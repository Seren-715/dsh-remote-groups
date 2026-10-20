import { describe, expect, it, vi } from 'vitest'
import { runScenarios } from '../../../scripts/test-scenarios.mjs'
import { AcpVirtualHarness, acpCwdWorkspaceId, discoverAcpVirtualWorkspaces, modelCatalog, type AcpClientLike } from '../src/acp/virtual-harness.js'
import type { AgentAcpFrameData } from '@dsh-remote/protocol'

function fakePi(): AcpClientLike {
  return {
    createSession: vi.fn(async () => ({ sessionId: 'new' })), prompt: vi.fn(async () => ({})),
    cancel: vi.fn(async () => ({})), listDirectory: vi.fn(async () => ({})), respond: vi.fn(async () => ({})),
    openStream: vi.fn(async () => ({ close: async () => undefined })),
    listSessions: vi.fn(async () => [{ conversationId: 'saved', title: 'Saved', createdAt: 1, updatedAt: 2 }]),
    loadSessionHistory: vi.fn(async () => []),
  }
}

describe('PI ACP projection isolation', () => {
  it('preserves PI failure, cancellation and stream outcomes without completing interrupted turns', async () => {
    const scenarios = [
      { name: 'normal', update: { sessionUpdate: 'prompt_completed', stopReason: 'end_turn' }, end: 'completed', finish: 'stop' },
      { name: 'upstream cancel', update: { sessionUpdate: 'prompt_completed', stopReason: 'cancelled' }, end: 'aborted', finish: 'aborted' },
      { name: 'prompt failure', update: { sessionUpdate: 'prompt_failed', code: 'FAILED' }, end: 'error', finish: 'error' },
      { name: 'upstream error stop', update: { sessionUpdate: 'prompt_completed', stopReason: 'error' }, end: 'error', finish: 'error' },
      { name: 'token ceiling', update: { sessionUpdate: 'prompt_completed', stopReason: 'max_tokens' }, end: 'max-tokens', finish: 'max-tokens' },
      { name: 'local cancel and late confirmation', localCancel: true, end: 'aborted', finish: 'aborted' },
      { name: 'failed stream', closed: 'failed', end: 'error', finish: 'error' },
      { name: 'disconnected stream', closed: 'peer-disconnected', end: 'aborted', finish: 'aborted' },
    ] as const
    await runScenarios(scenarios.map(scenario => ({ name: scenario.name, run: async () => {
      const client = fakePi()
      let receive!: (frame: AgentAcpFrameData) => void
      let closed!: NonNullable<Parameters<AcpClientLike['openStream']>[2]>
      vi.mocked(client.openStream).mockImplementation(async (_id, handler, onClosed) => {
        receive = handler; closed = onClosed!; return { close: async () => undefined }
      })
      const target = new AcpVirtualHarness(client, { deviceId: 'host', name: 'Host' }, 'pi')
      const signal = new AbortController().signal
      const request = { sessionId: 'pi:saved' }
      const update = (value: Record<string, unknown>) => receive({ frame: { method: 'session/update', params: { sessionId: 'saved', update: value } } } as AgentAcpFrameData)
      try {
        await target.selectOrCreateWorkspace('/project')
        expect(await target.dispatch('session/prompt', { args: { request: { ...request, content: [{ type: 'text', text: 'run' }] } } }, signal)).toMatchObject({ ok: true })
        update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'partial' } })
        if ('localCancel' in scenario) {
          expect(await target.dispatch('session/cancel', { args: { request } }, signal)).toMatchObject({ ok: true })
          update({ sessionUpdate: 'prompt_completed', stopReason: 'cancelled' })
        } else if ('closed' in scenario) closed({ streamId: 'test', reason: scenario.closed })
        else update(scenario.update)
        const history: any = await target.dispatch('session/history', { args: { request } }, signal)
        const events = history.value.records.map((entry: any) => entry.event)
        const ends = events.filter((entry: any) => entry.type === 'turn/end')
        expect(ends).toHaveLength(1)
        expect(ends[0].data.reason.kind).toBe(scenario.end)
        const message = events.find((entry: any) => entry.type === 'assistant/message').data
        expect(message.message.content).toEqual([{ type: 'text', text: 'partial' }])
        expect(message.stream.at(-1).chunk).toMatchObject({ type: 'finish', reason: { kind: scenario.finish } })
        if (scenario.end === 'error') expect(ends[0].data.reason.error).toMatchObject({ code: expect.any(String), message: expect.any(String) })
        if (scenario.end === 'aborted') expect(ends[0].data.reason.reason.kind).toBe('closed' in scenario ? 'disposed' : 'user')
      } finally { await target.close() }
    } })))
  })
  it('keeps failed catalog/history reads retryable and never prompts against a false empty baseline', async () => {
    const client = fakePi()
    const target = new AcpVirtualHarness(client, { deviceId: 'host', name: 'Host' }, 'pi')
    const signal = new AbortController().signal
    const unavailable = Object.assign(new Error('PI history unavailable'), { code: 'ACP_HISTORY_UNAVAILABLE' })
    try {
      const discovery = { ...client, listWorkspaces: vi.fn(async () => { throw unavailable }) }
      await expect(discoverAcpVirtualWorkspaces(discovery, 'pi', signal)).rejects.toMatchObject({ code: 'ACP_HISTORY_UNAVAILABLE' })
      await expect(discoverAcpVirtualWorkspaces(discovery, 'antigravity', signal)).resolves.toEqual([])
      vi.mocked(client.listSessions!).mockRejectedValueOnce(unavailable)
      await expect(target.selectOrCreateWorkspace('/project')).rejects.toMatchObject({ code: 'ACP_HISTORY_UNAVAILABLE' })
      expect(client.createSession).not.toHaveBeenCalled()
      await target.selectOrCreateWorkspace('/project')
      vi.mocked(client.loadSessionHistory!).mockRejectedValue(unavailable)
      const request = { sessionId: 'pi:saved' }
      expect(await target.dispatch('session/history', { args: { request } }, signal)).toMatchObject({ ok: false })
      expect(await target.dispatch('session/prompt', { args: { request: { ...request, content: [{ type: 'text', text: 'continue' }] } } }, signal)).toMatchObject({ ok: false })
      expect(client.prompt).not.toHaveBeenCalled()
      const event = { type: 'event', event: { seq: 0, time: 1, type: 'user/message', data: { id: 'saved-user', role: 'user', content: [{ type: 'text', text: 'history' }] } } }
      let resolve!: (events: unknown[]) => void
      vi.mocked(client.loadSessionHistory!).mockClear().mockImplementation(() => new Promise(done => { resolve = done }))
      const history = target.dispatch('session/history', { args: { request } }, signal)
      const page = target.dispatch('session/page', { args: { request } }, signal)
      expect(client.loadSessionHistory).toHaveBeenCalledTimes(1)
      resolve([event])
      expect(await history).toMatchObject({ ok: true, value: { records: [event] } })
      expect(await page).toMatchObject({ ok: true, value: { records: [event] } })
    } finally { await target.close() }
  })

  it('projects live PI tool results including streamed bash output and failures into readable history', async () => {
    const client = fakePi()
    let receive!: (frame: AgentAcpFrameData) => void
    vi.mocked(client.openStream).mockImplementation(async (_id, handler) => { receive = handler; return { close: async () => undefined } })
    const target = new AcpVirtualHarness(client, { deviceId: 'host', name: 'Host' }, 'pi')
    const signal = new AbortController().signal
    const update = (value: Record<string, unknown>) => receive({ frame: { method: 'session/update', params: { sessionId: 'saved', update: value } } } as AgentAcpFrameData)
    try {
      await target.selectOrCreateWorkspace('/project')
      expect(await target.dispatch('session/prompt', { args: { request: { sessionId: 'pi:saved', content: [{ type: 'text', text: 'inspect' }] } } }, signal)).toMatchObject({ ok: true })
      update({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'plan ' } })
      update({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'tools' } })
      update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'before ' } })
      update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'tools' } })
      update({ sessionUpdate: 'tool_call', toolCallId: 'bash-1', title: 'bash', status: 'in_progress', rawInput: { command: 'printf output' } })
      update({ sessionUpdate: 'tool_call_update', toolCallId: 'bash-1', status: 'in_progress', _meta: { terminal_output: { data: 'first ' } } })
      update({ sessionUpdate: 'tool_call_update', toolCallId: 'bash-1', status: 'completed', _meta: { terminal_output: { data: 'second' }, terminal_exit: { exit_code: 0 } } })
      update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'middle' } })
      update({ sessionUpdate: 'tool_call', toolCallId: 'read-1', title: 'read', status: 'pending', rawInput: {} })
      update({ sessionUpdate: 'tool_call_update', toolCallId: 'read-1', status: 'pending', rawInput: { path: 'missing' } })
      update({ sessionUpdate: 'tool_call_update', toolCallId: 'read-1', status: 'in_progress', rawInput: { path: 'missing.txt' } })
      update({ sessionUpdate: 'tool_call_update', toolCallId: 'read-1', status: 'failed', rawOutput: { content: [{ type: 'text', text: 'File missing' }], isError: true } })
      update({ sessionUpdate: 'tool_call', toolCallId: 'write-1', title: 'write', status: 'in_progress', rawInput: { path: 'new.txt', content: 'new' } })
      update({ sessionUpdate: 'tool_call_update', toolCallId: 'write-1', status: 'completed', content: [{ type: 'diff', path: 'new.txt', oldText: null, newText: 'new' }] })
      update({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'reasoning-only final' } })
      update({ sessionUpdate: 'prompt_completed', stopReason: 'end_turn' })
      const history: any = await target.dispatch('session/history', { args: { request: { sessionId: 'pi:saved' } } }, signal)
      const results = history.value.records.filter((row: any) => row.event.type === 'tool/result').map((row: any) => row.event.data.message.content[0])
      expect(results).toEqual([
        { type: 'tool-result', toolCallId: 'bash-1', content: [{ type: 'text', text: 'first second' }] },
        { type: 'tool-result', toolCallId: 'read-1', content: [{ type: 'text', text: 'File missing' }], isError: true },
        { type: 'tool-result', toolCallId: 'write-1', content: [{ type: 'text', text: 'File: new.txt\n--- before\n\n+++ after\nnew' }] },
      ])
      const calls = history.value.records.filter((row: any) => row.event.type === 'tool/call')
      expect(calls).toHaveLength(3)
      expect(calls[1].event.data).toMatchObject({ name: 'read', arguments: JSON.stringify({ path: 'missing.txt' }) })
      const events = history.value.records.map((row: any) => row.event)
      expect(events.map((event: any) => event.type)).toEqual([
        'turn/start', 'step/start', 'user/message', 'assistant/message', 'tool/call', 'tool/result',
        'step/end', 'step/start', 'assistant/message', 'tool/call', 'tool/result', 'tool/call', 'tool/result',
        'step/end', 'step/start', 'assistant/message', 'step/end', 'turn/end',
      ])
      const messages = events.filter((event: any) => event.type === 'assistant/message')
      expect(messages.map((event: any) => [event.data.turn, event.data.step, event.data.message.content])).toEqual([
        [1, 1, [{ type: 'reasoning', text: 'plan tools' }, { type: 'text', text: 'before tools' }]],
        [1, 2, [{ type: 'text', text: 'middle' }]],
        [1, 3, [{ type: 'reasoning', text: 'reasoning-only final' }]],
      ])
      expect(new Set(messages.map((event: any) => event.data.message.id)).size).toBe(3)
      expect(messages[0].data.stream).toContainEqual(expect.objectContaining({ chunk: { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'plan tools' } } }))
      expect(calls.map((row: any) => row.event.data.step)).toEqual([1, 2, 2])
      // A new turn must not reuse the old step or its reasoning accumulator.
      await target.dispatch('session/prompt', { args: { request: { sessionId: 'pi:saved', content: [{ type: 'text', text: 'again' }] } } }, signal)
      update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'next turn' } })
      update({ sessionUpdate: 'prompt_completed', stopReason: 'end_turn' })
      const continued: any = await target.dispatch('session/history', { args: { request: { sessionId: 'pi:saved' } } }, signal)
      const final = continued.value.records.filter((row: any) => row.event.type === 'assistant/message').at(-1).event.data
      expect(final).toMatchObject({ turn: 2, step: 1, message: { content: [{ type: 'text', text: 'next turn' }] } })
      expect(messages.some((event: any) => event.data.message.id === final.message.id)).toBe(false)
    } finally { await target.close() }
  })
  it('uses PI scoped workspace/session ids and routes prompts/tools only to PI', async () => {
    const client = {
      createSession: vi.fn(async () => ({ sessionId: 'pi-session' })),
      prompt: vi.fn(async () => ({})),
      cancel: vi.fn(async () => ({})),
      listDirectory: vi.fn(async () => ({})),
      openStream: vi.fn(async () => ({ close: async () => undefined })),
      respond: vi.fn(async () => ({})),
      workspaceToolCall: vi.fn(async () => ({ entries: [] })),
      sessionModels: vi.fn(async () => ({ current: { provider: 'pi', model: 'host-model', reasoningEffort: 'off' }, routable: true,
        groups: [{ id: 'pi', name: 'PI', models: [{ id: 'host-model', name: 'Host model', reasoning: { efforts: [{ id: 'off', name: 'Off' }, { id: 'high', name: 'High' }] } }] }], failures: [] })),
      selectModel: vi.fn(async (_sessionId: string, _backend: 'antigravity' | 'pi', selection: { provider: string; model: string; reasoningEffort?: string }) => selection),
    }
    const target = new AcpVirtualHarness(client, { deviceId: 'host', name: 'Host' }, 'pi')
    const signal = new AbortController().signal
    try {
      const workspace = await target.selectOrCreateWorkspace('/project')
      expect(workspace.workspaceId).toBe(acpCwdWorkspaceId('/project', 'pi'))
      expect(workspace.sessionIds).toEqual(['pi:pi-session'])
      await expect(target.selectWorkspace(acpCwdWorkspaceId('/project', 'cursor'))).rejects.toThrow()
      expect(await target.dispatch('session/prompt', { args: { request: { sessionId: 'pi:pi-session', content: [{ type: 'text', text: 'hello' }] } } }, signal)).toMatchObject({ ok: true })
      expect(client.prompt).toHaveBeenCalledWith('pi-session', 'hello', signal, [], 'pi')
      expect(await target.dispatch('workspaceFiles/list', { args: { workspaceFileScopeId: 'pi:pi-session', path: '.' } }, signal)).toMatchObject({ ok: true })
      expect(client.workspaceToolCall).toHaveBeenCalledWith('pi-session', 'pi', 'workspaceFiles/list', expect.any(Object), signal)
      expect(modelCatalog('pi')).toMatchObject({ default: { provider: 'pi', model: 'host-settings' }, groups: [{ id: 'pi', models: [] }] })
      expect(await target.dispatch('session/models', { args: { request: { sessionId: 'pi:pi-session' } } }, signal)).toMatchObject({ ok: true, value: { current: { provider: 'pi', model: 'host-model', reasoningEffort: 'off' } } })
      const selection = { sessionId: 'pi:pi-session', provider: 'pi', model: 'host-model', reasoningEffort: 'high' }
      expect(await target.dispatch('session/selectModel', { args: { request: selection } }, signal)).toMatchObject({ ok: true, value: { selected: { reasoningEffort: 'high' } } })
      expect(client.selectModel).toHaveBeenCalledWith('pi-session', 'pi', { provider: 'pi', model: 'host-model', reasoningEffort: 'high' })
      expect(await target.dispatch('session/selectModel', { args: { request: { ...selection, reasoningEffort: 'invented' } } }, signal)).toMatchObject({ ok: false })
      expect(client.selectModel).toHaveBeenCalledTimes(1)
    } finally { await target.close() }
  })
})
