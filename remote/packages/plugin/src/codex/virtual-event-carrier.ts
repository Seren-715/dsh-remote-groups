import type { ApiProxy, RpcRequest, RpcResponse } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { TypertRpcResult } from '../typert-gateway-contract.js'
import type { CatalogState } from './virtual-catalog.js'
import { nativeVisibleWorkspaces, nativeWorkspace } from './virtual-catalog.js'
import type { PendingApproval } from './virtual-contract.js'
import { AsyncValueQueue, failure, rcEndpoint, success } from './virtual-contract.js'
import type { CodexClientLike, JsonRecord } from './virtual-values.js'
import { isRecord, record, string } from './virtual-values.js'

/** Collaborates with one CodexVirtualHarness; never creates a second session or connection state. */
export interface CodexEventCarrierContext {
  readonly workspaceStreams: Set<AsyncValueQueue>
  readonly refreshCatalog: (signal?: AbortSignal) => Promise<CatalogState>
  readonly selectedWorkspaceId: string | undefined
  readonly controlStreams: Set<AsyncValueQueue>
  readonly host: { deviceId: string; name: string; }
  readonly eventStreams: Map<string, AsyncValueQueue>
  readonly currentCatalog: (signal?: AbortSignal) => Promise<CatalogState>
  readonly pendingApprovals: Map<string, PendingApproval>
  readonly client: CodexClientLike
  readonly dispatch: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<TypertRpcResult>
  readonly rcMuxStreams: Set<AsyncValueQueue>
  readonly rcHostStreams: Set<AsyncValueQueue>
}

export class CodexEventCarrier {
  constructor(private readonly context: CodexEventCarrierContext) {}

  async workspaceFollow(signal: AbortSignal): Promise<AsyncIterable<unknown>> {
    const queue = new AsyncValueQueue(signal)
    this.context.workspaceStreams.add(queue)
    const catalog = await this.context.refreshCatalog(signal)
    queue.push({
      type: 'baseline',
      value: {
        items: nativeVisibleWorkspaces(catalog, this.context.selectedWorkspaceId).map(nativeWorkspace),
        archivedSessionIds: catalog.sessions.filter(item => item.archived).map(item => item.id),
        pinnedSessionIds: [],
      },
    })
    return queue.iterate(() => this.context.workspaceStreams.delete(queue))
  }

  async sessionControl(signal: AbortSignal): Promise<AsyncIterable<unknown>> {
    const queue = new AsyncValueQueue(signal)
    this.context.controlStreams.add(queue)
    queue.push({ type: 'baseline', value: { queues: {}, jobs: {}, projections: {} } })
    return queue.iterate(() => this.context.controlStreams.delete(queue))
  }

  /**
   * Background jobs belong to the Host Harness session, not to a CodeX virtual
   * Workspace. The native session header mounts a job roster stream as soon as a
   * Session opens, so answer it with an authoritative empty roster instead of a
   * terminal `method-not-found` failure that tears the page down.
   */
  emptyJobStream(endpoint: 'job/list' | 'job/follow', signal: AbortSignal): AsyncIterable<unknown> {
    const queue = new AsyncValueQueue(signal)
    if (endpoint === 'job/list') queue.push({ type: 'rows', jobs: [] })
    return queue.iterate(() => queue.close())
  }

  async remoteEvents(signal: AbortSignal): Promise<AsyncIterable<unknown>> {
    const queue = new AsyncValueQueue(signal)
    const clientId = `codex-events:${this.context.host.deviceId}:${Date.now().toString(36)}`
    this.context.eventStreams.set(clientId, queue)
    const home = (await this.context.currentCatalog(signal)).workspaces[0]?.path ?? '/'
    queue.push({ type: 'ready', clientId, host: { home } })
    return queue.iterate(() => this.context.eventStreams.delete(clientId))
  }

  emitRemoteEvent(event: string, args: unknown[]): void {
    for (const queue of this.context.eventStreams.values()) queue.push({ type: 'emit', event, args })
    const sessionId = typeof args[0] === 'string' ? args[0] : undefined
    if (event === 'api-session/status' && sessionId !== undefined && typeof args[1] === 'boolean') {
      this.broadcastRcHost({ type: 'host/session-status', sessionId, running: args[1] })
    } else if (event === 'api-session/removed' && sessionId !== undefined) {
      this.broadcastRcHost({ type: 'host/session-removed', sessionId })
    } else if (event === 'api-session/added' && isRecord(args[0])) {
      const summary = args[0]
      this.broadcastRcHost({
        type: 'host/session-added',
        sessionId: summary.sessionId,
        blank: summary.blank === true,
        ...(typeof summary.cwd === 'string' ? { cwd: summary.cwd } : {}),
      })
    }
  }

  emitApproval(input: { eventId: string; agentId: string; request: JsonRecord }): void {
    for (const queue of this.context.eventStreams.values()) queue.push({
      type: 'waterfall',
      event: 'approval/request',
      eventId: input.eventId,
      agentId: input.agentId,
      request: input.request,
    })
    this.broadcastRcMux({
      type: 'approval/requested',
      sessionId: input.agentId,
      approvalId: input.eventId,
      toolName: string(input.request.toolName) ?? 'CodeX',
      ...(typeof input.request.reason === 'string' ? { reason: input.request.reason } : {}),
    }, input.eventId)
  }

  async answerRemoteEvent(args: JsonRecord, signal: AbortSignal): Promise<undefined> {
    const eventId = string(args.eventId)
    const outcome = record(args.outcome)
    if (eventId === undefined) throw new Error('The CodeX approval result is missing its event id.')
    const pending = this.context.pendingApprovals.get(eventId)
    if (pending === undefined) return undefined
    this.context.pendingApprovals.delete(eventId)
    const decision = outcome.kind === 'result' && outcome.value === 'allowed-once'
      ? 'accept'
      : outcome.kind === 'result' && outcome.value === 'cancelled'
        ? 'cancel'
        : 'decline'
    await this.context.client.respond(pending.requestHandle, decision, signal)
    return undefined
  }

  createApiProxy(): ApiProxy {
    const call = (endpoint: string) => async (request: RpcRequest<unknown>, signal?: AbortSignal): Promise<RpcResponse<unknown>> => {
      const payload = endpoint === 'session.prompt' && isRecord(request.payload)
        ? { ...request.payload, requestId: String(request.rpcId) }
        : request.payload
      const result = await this.context.dispatch(rcEndpoint(endpoint), { args: { request: payload } }, signal ?? new AbortController().signal)
      return {
        rpcId: request.rpcId,
        result: (result.ok
          ? success(result.value)
          : failure(result.error.code, result.error.message, result.error.details)) as never,
      }
    }
    return {
      sessions: {
        list: call('session.list') as never,
        search: call('session.search') as never,
        create: call('session.create') as never,
        history: call('session.history') as never,
        models: call('session.models') as never,
        selectModel: call('session.selectModel') as never,
        rename: call('session.rename') as never,
        fork: call('session.fork') as never,
        prompt: call('session.prompt') as never,
        attachment: call('session.attachment') as never,
        updateQueue: call('session.updateQueue') as never,
        cancel: call('session.cancel') as never,
      },
      workspace: {
        list: call('workspace.list') as never,
        create: call('workspace.create') as never,
        rename: call('workspace.rename') as never,
        delete: call('workspace.delete') as never,
        insertBefore: call('workspace.insertBefore') as never,
        insertSessionBefore: call('workspace.insertSessionBefore') as never,
        archiveSession: call('workspace.archiveSession') as never,
      },
      subagents: {} as ApiProxy['subagents'],
      host: {
        describe: call('host.describe') as never,
        listDirectory: call('host.listDirectory') as never,
      } as unknown as ApiProxy['host'],
      skills: { list: call('skills.list') as never },
      agentPresets: {} as ApiProxy['agentPresets'],
      goals: {} as ApiProxy['goals'],
      settings: {} as ApiProxy['settings'],
      credentials: {} as ApiProxy['credentials'],
      llm: {} as ApiProxy['llm'],
      events: {
        mux: ((request: RpcRequest<unknown>, signal: AbortSignal) => this.rcMux(request, signal)) as never,
        host: ((request: RpcRequest<unknown>, signal: AbortSignal) => this.rcHost(request, signal)) as never,
      },
      downloads: {} as ApiProxy['downloads'],
      respond: async message => {
        const pending = this.context.pendingApprovals.get(String(message.rpcId))
        if (pending === undefined) return { accepted: false, reason: 'not-pending' }
        const result = message.result
        const outcome = result.ok ? result.value : undefined
        const decision = outcome === 'allowed-once' ? 'accept' : outcome === 'cancelled' ? 'cancel' : 'decline'
        await this.context.client.respond(pending.requestHandle, decision)
        this.context.pendingApprovals.delete(pending.requestHandle)
        return { accepted: true }
      },
    }
  }

  async *rcMux(request: RpcRequest<unknown>, signal: AbortSignal): AsyncIterable<unknown> {
    const queue = new AsyncValueQueue(signal)
    this.context.rcMuxStreams.add(queue)
    const catalog = await this.context.currentCatalog(signal)
    for (const session of catalog.sessions) queue.push({
      rpcId: `${String(request.rpcId)}:${session.id}:subscribed`,
      payload: { type: 'session/subscribed', sessionId: session.id, lastSeq: -1 },
    })
    try {
      yield* queue
    } finally {
      this.context.rcMuxStreams.delete(queue)
      queue.close()
    }
  }

  async *rcHost(_request: RpcRequest<unknown>, signal: AbortSignal): AsyncIterable<unknown> {
    const queue = new AsyncValueQueue(signal)
    this.context.rcHostStreams.add(queue)
    try {
      yield* queue
    } finally {
      this.context.rcHostStreams.delete(queue)
      queue.close()
    }
  }

  broadcastRcMux(payload: unknown, rpcId = `codex-mux:${Date.now()}:${Math.random()}`): void {
    for (const queue of this.context.rcMuxStreams) queue.push({ rpcId, payload })
  }

  broadcastRcHost(payload: unknown): void {
    const frame = { rpcId: `codex-host:${Date.now()}:${Math.random()}`, payload }
    for (const queue of this.context.rcHostStreams) queue.push(frame)
  }

  publishProjection(sessionId: string, key: string, value: unknown, seq: number): void {
    for (const queue of this.context.controlStreams) queue.push({ type: 'projection', sessionId, key, value, seq })
    this.broadcastRcMux({ type: 'session/projection', sessionId, key, value, seq })
  }
}
