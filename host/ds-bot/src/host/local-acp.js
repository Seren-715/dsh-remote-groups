// Modified by Seren-715 for DSH Remote Groups (2026-10-20): local Agent group integration, mobile history and attachments. Original work: Fei2411/DeepSeek-Bot, Apache-2.0.
import { spawnLocalProcess } from './local-process.js'

const abortError = (message = 'Local agent run cancelled') => Object.assign(new Error(message), { name: 'AbortError' })

export function createAcpRuntime({ command, args = [], spawnProcess = spawnLocalProcess, timeoutMs = 300_000 }) {
  if (!command || !Array.isArray(args)) throw new Error('A local agent command and argument array are required')
  let transport
  let active
  let closed = false
  let nextId = 0

  function stop(error = new Error('Local agent connection closed')) {
    const current = transport
    transport = undefined
    if (!current) return
    for (const pending of current.pending.values()) pending.reject(error)
    current.pending.clear()
    try { current.child.kill() } catch { /* The child may already have exited. */ }
  }

  function send(current, message) {
    if (transport !== current) return
    current.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
  }

  function request(current, method, params) {
    return new Promise((resolve, reject) => {
      if (transport !== current) return reject(new Error('Local agent connection closed'))
      const id = ++nextId
      current.pending.set(id, { resolve, reject, method })
      try { send(current, { id, method, params }) } catch {
        current.pending.delete(id)
        reject(new Error('Unable to write to local agent'))
      }
    })
  }

  async function permission(current, message) {
    const params = message.params || {}
    const run = active
    let outcome = { outcome: 'cancelled' }
    if (run && params.sessionId === run.sessionId) {
      const options = Array.isArray(params.options) ? params.options : []
      let choice = 'reject'
      try {
        choice = await run.onApproval?.({
          tool: params.toolCall?.title || params.toolCall?.kind || 'Tool',
          reason: params.toolCall?.title || 'Local agent requests permission',
          options,
        }) || 'reject'
      } catch { /* A failed approval must never grant permission. */ }
      if (active === run && !run.cancelled) {
        const kind = choice === 'allow' ? 'allow_once' : choice === 'reject' ? 'reject_once' : undefined
        const option = options.find((item) => item.kind === kind && typeof item.optionId === 'string')
        if (option) outcome = { outcome: 'selected', optionId: option.optionId }
      }
    }
    try { send(current, { id: message.id, result: { outcome } }) } catch { stop(new Error('Unable to reply to local agent')) }
  }

  function receive(current, message) {
    if (transport !== current) return
    if (message.method) {
      if (message.id !== undefined) {
        if (message.method === 'session/request_permission') void permission(current, message)
        else send(current, { id: message.id, error: { code: -32601, message: 'Client method not supported' } })
        return
      }
      const run = active
      if (message.method !== 'session/update' || !run?.acceptUpdates || message.params?.sessionId !== run.sessionId) return
      const update = message.params.update
      if (update?.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text') {
        const text = update.content.text
        if (typeof text !== 'string') return
        run.text += text
        run.onEvent?.({ type: 'text', text })
      } else if (update?.sessionUpdate === 'tool_call') {
        run.onEvent?.({ type: 'tool', name: update.title || update.kind || 'Tool' })
      }
      return
    }
    const pending = current.pending.get(message.id)
    if (!pending) return
    current.pending.delete(message.id)
    // Provider error payloads can contain credentials or entire request bodies.
    if (message.error) pending.reject(new Error(`Local agent ${pending.method} failed (RPC ${message.error.code ?? 'error'})`))
    else pending.resolve(message.result)
  }

  function connect(cwd) {
    if (transport) return transport
    const child = spawnProcess(command, args, { cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    const current = { child, pending: new Map(), sessions: new Map(), buffer: '', ready: undefined }
    transport = current
    const failed = () => {
      if (transport === current) stop(new Error('Local agent process exited or failed'))
    }
    child.on('error', failed)
    child.on('exit', failed)
    child.stdin.on('error', failed)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      if (transport !== current) return
      current.buffer += chunk
      if (current.buffer.length > 8_388_608) return stop(new Error('Local agent protocol message is too large'))
      let newline
      while ((newline = current.buffer.indexOf('\n')) !== -1) {
        const line = current.buffer.slice(0, newline).trim()
        current.buffer = current.buffer.slice(newline + 1)
        if (!line) continue
        try { receive(current, JSON.parse(line)) } catch { return stop(new Error('Invalid local agent protocol message')) }
      }
    })
    // Drain diagnostics without exposing model configuration or credentials.
    child.stderr.resume()
    current.ready = request(current, 'initialize', {
      protocolVersion: 1,
      clientInfo: { name: 'ds-bot', version: '0.1.7' },
      clientCapabilities: {},
    })
    return current
  }

  async function run({ sessionId, cwd, text, signal, onEvent, onApproval }) {
    if (closed) throw new Error('Local agent runtime is closed')
    if (active) throw new Error('Local agent runtime is already running')
    if (signal?.aborted) throw abortError()
    if (typeof cwd !== 'string' || !cwd || typeof text !== 'string') throw new Error('A working directory and prompt text are required')
    const state = { sessionId, text: '', onEvent, onApproval, cancelled: false }
    active = state
    let timer
    let current
    const cancel = (error) => {
      state.cancelled = true
      if (current && state.sessionId) {
        try { send(current, { method: 'session/cancel', params: { sessionId: state.sessionId } }) } catch {}
      }
      stop(error)
    }
    const aborted = () => cancel(abortError())
    signal?.addEventListener('abort', aborted, { once: true })
    try {
      current = connect(cwd)
      timer = setTimeout(() => cancel(new Error('Local agent run timed out')), timeoutMs)
      const initialized = await current.ready
      if (initialized?.protocolVersion !== 1) throw new Error('Local agent negotiated an unsupported ACP version')
      if (sessionId) {
        if (!current.sessions.has(sessionId) || current.sessions.get(sessionId) !== cwd) {
          if (initialized?.agentCapabilities?.loadSession !== true) throw new Error('Local agent cannot load the existing session')
          await request(current, 'session/load', { sessionId, cwd, mcpServers: [] })
          current.sessions.set(sessionId, cwd)
        }
      } else {
        const created = await request(current, 'session/new', { cwd, mcpServers: [] })
        if (typeof created?.sessionId !== 'string' || !created.sessionId) throw new Error('Local agent did not return a session ID')
        state.sessionId = created.sessionId
        current.sessions.set(state.sessionId, cwd)
      }
      state.acceptUpdates = true
      const result = await request(current, 'session/prompt', {
        sessionId: state.sessionId,
        prompt: [{ type: 'text', text }],
      })
      if (result?.stopReason === 'cancelled') throw abortError()
      if (result?.stopReason !== 'end_turn') throw new Error('Local agent did not complete its turn')
      return { sessionId: state.sessionId, text: state.text }
    } catch (error) {
      stop(error)
      throw error
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', aborted)
      if (active === state) active = undefined
    }
  }

  return {
    run,
    close() {
      closed = true
      if (transport && active?.sessionId) {
        try { send(transport, { method: 'session/cancel', params: { sessionId: active.sessionId } }) } catch {}
      }
      if (active) active.cancelled = true
      stop(new Error('Local agent runtime is closed'))
    },
  }
}
