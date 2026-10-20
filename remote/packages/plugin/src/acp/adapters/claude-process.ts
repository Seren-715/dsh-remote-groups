import { Buffer } from 'node:buffer'
import type { SafeLogger } from '../../logging.js'
import { CursorAcpClient, CursorAcpError, type CursorAcpOptions, type SpawnCursorAcp, type CursorAcpInboundHandler } from './cursor-process.js'
import { claudeHistoryEvents } from './claude-history.js'

/** Host-local authentication; no interactive login or filesystem transcript reads. */
export class ClaudeAcpClient extends CursorAcpClient {
  private readonly live = new Map<string, unknown>()
  private readonly loads = new Map<string, Promise<unknown>>()
  private pendingNew = 0
  private historyStop?: () => Promise<void>
  private historyReading = false
  private shuttingDown = false
  private readonly makeClient: () => CursorAcpClient

  constructor(binary = 'claude-agent-acp', logger?: SafeLogger, spawnAcp?: SpawnCursorAcp,
    options: Pick<CursorAcpOptions, 'args' | 'cwd'> = {}) {
    const config = { ...options, args: options.args ?? [], authenticationMethod: null, modelBackend: 'claude' as const }
    super(binary, logger, spawnAcp, config)
    this.makeClient = () => new CursorAcpClient(binary, logger, spawnAcp, config)
    super.onUnavailable(() => this.live.clear())
  }

  override onInbound(handler: CursorAcpInboundHandler): () => void {
    return super.onInbound(message => {
      const id = (message.params as { sessionId?: string } | null)?.sessionId
      // First load also replays: history belongs exclusively to history(), never live streams.
      if (message.kind === 'notification' && message.method === 'session/update' && id && this.loads.has(id)) return
      handler(message)
    })
  }

  override async call(method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
    if (this.shuttingDown) throw new CursorAcpError('ACP_CLOSED', 'Claude ACP is closed.')
    const id = (params as { sessionId?: string } | null)?.sessionId
    if (method === 'session/load' && typeof id === 'string') {
      // Upstream reloads even an already live session, replaying into active listeners.
      if (this.live.has(id)) return this.live.get(id)
      const pending = this.loads.get(id)
      if (pending) return pending
      this.checkSessionLimit()
      // Defer the actual call until the suppression/deduplication guard is installed.
      const load = Promise.resolve().then(() => super.call(method, params, timeoutMs)).then(result => {
        this.assertLoaded(result, id)
        this.live.set(id, result)
        return result
      })
      this.loads.set(id, load)
      try { return await load } finally { this.loads.delete(id) }
    }
    if (method === 'session/new') {
      this.checkSessionLimit()
      this.pendingNew++
      try {
        const result = await super.call(method, params, timeoutMs)
        const newId = (result as { sessionId?: string } | null)?.sessionId
        if (typeof newId !== 'string' || this.shuttingDown) throw new CursorAcpError('ACP_INVALID_SESSION', 'Claude returned an invalid session.')
        this.live.set(newId, result)
        return result
      } finally { this.pendingNew-- }
    }
    return super.call(method, params, timeoutMs)
  }

  private checkSessionLimit(): void {
    if (this.live.size + this.loads.size + this.pendingNew >= 30) throw new CursorAcpError('ACP_PROCESS_LIMIT', 'Too many Claude sessions are active.')
  }
  private assertLoaded(result: unknown, sessionId: string): void {
    const id = (result as { sessionId?: unknown } | null)?.sessionId
    if (this.shuttingDown) throw new CursorAcpError('ACP_CLOSED', 'Claude ACP is closed.')
    if (id !== undefined && id !== sessionId) throw new CursorAcpError('ACP_INVALID_SESSION', 'Claude returned an invalid history session.')
  }

  /** One temporary process, separate from all live sessions (including active prompts). */
  async history(sessionId: string, cwd: string): Promise<unknown[]> {
    if (this.shuttingDown) throw new CursorAcpError('ACP_CLOSED', 'Claude ACP is closed.')
    if (this.historyReading) throw new CursorAcpError('ACP_PROCESS_LIMIT', 'A Claude history read is already in progress.')
    this.historyReading = true
    const client = this.makeClient()
    let stopping: Promise<void> | undefined
    const stop = () => stopping ??= client.close()
    this.historyStop = stop
    const updates: Parameters<typeof claudeHistoryEvents>[0] = []
    let bytes = 0
    let count = 0
    let overflow = false
    client.onInbound(message => {
      // A history reader has no authority to run tools or wait for user approval.
      if (message.kind === 'request') {
        void (message.method === 'session/request_permission'
          ? client.respond(message.id, { outcome: { outcome: 'cancelled' } })
          : client.respondError(message.id, -32601, 'History reader does not support requests.')).catch(() => undefined)
        return
      }
      if (message.method !== 'session/update' || (message.params as { sessionId?: string } | null)?.sessionId !== sessionId || overflow) return
      bytes += Buffer.byteLength(JSON.stringify(message))
      count++
      if (bytes > 8 * 1024 * 1024 || count > 10000) {
        overflow = true
        void stop().catch(() => undefined)
      } else updates.push(message)
    })
    try {
      await client.start()
      if (this.shuttingDown) throw new CursorAcpError('ACP_CLOSED', 'Claude ACP is closed.')
      const result = await client.call('session/load', { sessionId, cwd, mcpServers: [] })
      this.assertLoaded(result, sessionId)
      if (overflow) throw new CursorAcpError('ACP_HISTORY_TOO_LARGE', 'Claude history exceeds the transfer limit.')
      return claudeHistoryEvents(updates, sessionId)
    } catch (error) {
      if (overflow) throw new CursorAcpError('ACP_HISTORY_TOO_LARGE', 'Claude history exceeds the transfer limit.')
      throw error
    } finally {
      try { await stop() } finally { this.historyStop = undefined; this.historyReading = false }
    }
  }

  override async close(): Promise<void> {
    this.shuttingDown = true
    await Promise.all([super.close(), this.historyStop?.()])
    this.live.clear()
  }
}
