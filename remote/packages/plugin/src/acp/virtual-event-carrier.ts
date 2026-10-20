import type { ApiProxy, RpcRequest, RpcResponse } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { TypertRpcResult } from '../typert-gateway-contract.js'
import type { AcpVirtualWorkspaceView } from './virtual-catalog.js'
import { nativeWorkspace } from './virtual-catalog.js'
import type { AcpClientLike, AcpSessionState, JsonRecord, PendingApproval } from './virtual-contract.js'
import { AsyncValueQueue, failure, isRecord, rcEndpoint, record, string, success } from './virtual-contract.js'

/** Collaborates with one AcpVirtualHarness; never creates a second session or connection state. */
export interface AcpEventCarrierContext {
  readonly workspaceStreams: Set<AsyncValueQueue>
  readonly visibleWorkspaces: () => AcpVirtualWorkspaceView[]
  readonly controlStreams: Set<AsyncValueQueue>
  readonly eventStreams: Map<string, AsyncValueQueue>
  readonly selectedWorkspaceId: string | undefined
  readonly workspaceById: Map<string, AcpVirtualWorkspaceView>
  readonly backendLabel: () => string
  readonly pendingApprovals: Map<string, PendingApproval>
  readonly client: AcpClientLike
  readonly dispatch: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<TypertRpcResult>
  readonly rcMuxStreams: Set<AsyncValueQueue>
  readonly sessions: Map<string, AcpSessionState>
  readonly rcHostStreams: Set<AsyncValueQueue>
  readonly nextProjectionSeq: () => number
  readonly archivedSessionIds: ReadonlySet<string>
}

export class AcpEventCarrier {
  constructor(private readonly context: AcpEventCarrierContext) {}

  async workspaceFollow(signal: AbortSignal): Promise<AsyncIterable<unknown>> {
    const queue = new AsyncValueQueue(signal)
    this.context.workspaceStreams.add(queue)
    queue.push({
      type: 'baseline',
      value: {
        items: this.context.visibleWorkspaces().map(nativeWorkspace),
        archivedSessionIds: [...this.context.archivedSessionIds],
        pinnedSessionIds: [],
      },
    })
    return queue.iterate(() => this.context.workspaceStreams.delete(queue))
  }

  async sessionControl(signal: AbortSignal): Promise<AsyncIterable<unknown>> {
    const queue = new AsyncValueQueue(signal)
    this.context.controlStreams.add(queue)
    // Session Controller treats the first control frame as the opening
    // snapshot. Without it the Client-side RemoteSnapshotStream never moves
    // to `ready`, so a workspace selected through the Remote modal remains
    // stuck on the empty shell after the page reload.
    queue.push({ type: 'baseline', value: { projections: {} } })
    return queue.iterate(() => this.context.controlStreams.delete(queue))
  }

  /**
   * Background jobs belong to the Host Harness session, not to a backend-scoped
   * virtual Workspace. The native session header mounts a job roster stream as
   * soon as a Session opens, so answer it with an authoritative empty roster
   * instead of a terminal `method-not-found` failure that tears the page down.
   */
  emptyJobStream(endpoint: 'job/list' | 'job/follow', signal: AbortSignal): AsyncIterable<unknown> {
    const queue = new AsyncValueQueue(signal)
    if (endpoint === 'job/list') queue.push({ type: 'rows', jobs: [] })
    return queue.iterate(() => queue.close())
  }

  async remoteEvents(signal: AbortSignal): Promise<AsyncIterable<unknown>> {
    const id = `cursor-events:${Date.now()}:${Math.random()}`
    const queue = new AsyncValueQueue(signal)
    this.context.eventStreams.set(id, queue)
    const workspace = this.context.selectedWorkspaceId === undefined
      ? undefined
      : this.context.workspaceById.get(this.context.selectedWorkspaceId)
    queue.push({
      type: 'ready',
      clientId: id,
      host: { home: workspace?.path ?? '/' },
    })
    return queue.iterate(() => this.context.eventStreams.delete(id))
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
      toolName: string(input.request.toolName) ?? this.context.backendLabel(),
      ...(typeof input.request.reason === 'string' ? { reason: input.request.reason } : {}),
    }, input.eventId)
  }

  async answerRemoteEvent(args: JsonRecord, signal: AbortSignal): Promise<undefined> {
    const eventId = string(args.eventId)
    const outcome = record(args.outcome)
    if (eventId === undefined) throw new Error(`The ${this.context.backendLabel()} approval result is missing its event id.`)
    const pending = this.context.pendingApprovals.get(eventId)
    if (pending === undefined) return undefined
    this.context.pendingApprovals.delete(eventId)
    const decision = outcome.kind === 'result' && outcome.value === 'allowed-once'
      ? 'allow-once'
      : outcome.kind === 'result' && outcome.value === 'cancelled'
        ? 'cancel'
        : 'reject-once'
    await this.context.client.respond(pending.requestHandle, decision, undefined, signal)
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
          ?? [...this.context.pendingApprovals.values()].find(item => item.requestHandle === String(message.rpcId))
        if (pending === undefined) return { accepted: false, reason: 'not-pending' }
        const result = message.result
        const outcome = result.ok ? result.value : undefined
        const decision = outcome === 'allowed-once' ? 'allow-once' : outcome === 'cancelled' ? 'cancel' : 'reject-once'
        await this.context.client.respond(pending.requestHandle, decision)
        this.context.pendingApprovals.delete(pending.requestHandle)
        return { accepted: true }
      },
    }
  }

  async *rcMux(request: RpcRequest<unknown>, signal: AbortSignal): AsyncIterable<unknown> {
    const queue = new AsyncValueQueue(signal)
    this.context.rcMuxStreams.add(queue)
    for (const session of this.context.sessions.values()) {
      queue.push({
        rpcId: `${String(request.rpcId)}:${session.sessionId}:subscribed`,
        payload: { type: 'session/subscribed', sessionId: session.sessionId, lastSeq: -1 },
      })
    }
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

  broadcastRcMux(payload: unknown, rpcId = `cursor-mux:${Date.now()}:${Math.random()}`): void {
    for (const queue of this.context.rcMuxStreams) queue.push({ rpcId, payload })
  }

  broadcastRcHost(payload: unknown): void {
    const frame = { rpcId: `cursor-host:${Date.now()}:${Math.random()}`, payload }
    for (const queue of this.context.rcHostStreams) queue.push(frame)
  }

  publishProjection(sessionId: string, key: string, value: unknown, seq = this.context.nextProjectionSeq()): void {
    for (const queue of this.context.controlStreams) {
      queue.push({ type: 'projection', sessionId, key, value, asOfSeq: seq, seq })
    }
    this.broadcastRcMux({ type: 'session/projection', sessionId, key, value, seq })
  }
}
