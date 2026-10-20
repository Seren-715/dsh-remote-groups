import { describe, it, expect, vi } from 'vitest'
import { PiAcpClient } from '../src/acp/adapters/pi-process.js'
import type { CursorAcpLike, CursorAcpInboundHandler } from '../src/acp/adapters/cursor-process.js'
import { runScenarios } from '../../../scripts/test-scenarios.mjs'

function fake(replay?: Array<Record<string, unknown>>, loadError?: Error) {
  const handlers: CursorAcpInboundHandler[] = []
  const client: CursorAcpLike = {
    start: vi.fn(async () => {}), isReady: () => true,
    call: vi.fn(async (method, params) => {
      const p = params as { sessionId?: string; configId?: string; value?: string }
      if (method === 'session/set_config_option') return { configOptions: [{ type: 'select', id: p.configId, currentValue: p.value, options: p.configId === 'model' ? [{ value: 'model', name: 'Model' }] : [{ value: 'low', name: 'Low' }, { value: 'high', name: 'High' }] }] }
      if (method === 'session/load') {
        for (const update of replay ?? [{ sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'hello' } }]) {
          for (const handler of handlers) handler({ kind: 'notification', method: 'session/update', params: { sessionId: p.sessionId, update } })
        }
        // A different session on the temporary process must never leak into history.
        for (const handler of handlers) handler({ kind: 'notification', method: 'session/update', params: { sessionId: 'other', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'secret' } } } })
        if (loadError) throw loadError
      }
      return { sessionId: p.sessionId ?? 'new-session', models: { currentModelId: 'model', availableModels: [{ modelId: 'model', name: 'Model' }] }, modes: { currentModeId: 'low', availableModes: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }] } }
    }),
    respond: vi.fn(async () => {}), respondError: vi.fn(async () => {}),
    onInbound: handler => { handlers.push(handler); return () => {} }, onUnavailable: vi.fn(() => () => {}), close: vi.fn(async () => {}),
  }
  return client
}

describe('PI standard ACP isolation', () => {
  it('reads modern model snapshots and rejects unconfirmed model or thinking changes', async () => {
    await runScenarios(['modern snapshot', 'unconfirmed model', 'unconfirmed thinking'].map(scenario => ({ name: scenario, run: async () => {
      const client = fake([])
      if (scenario === 'modern snapshot') vi.mocked(client.call).mockResolvedValueOnce({ sessionId: 'saved', configOptions: [
        { type: 'select', id: 'model', currentValue: 'model', options: [{ name: 'Provider', options: [{ value: 'model', name: 'Model' }] }] },
        { type: 'select', id: 'thought_level', currentValue: 'low', options: [{ value: 'low', name: 'Low' }] },
      ] })
      const pi = new PiAcpClient('pi-acp', undefined, {}, () => client)
      try {
        await pi.call('session/load', { sessionId: 'saved', cwd: '/tmp' })
        if (scenario === 'modern snapshot') {
          await expect(pi.call('dsh/sessionModels', { sessionId: 'saved' })).resolves.toMatchObject({ current: { model: 'model', reasoningEffort: 'low' }, groups: [{ models: [{ id: 'model', name: 'Model' }] }] })
        } else {
          if (scenario === 'unconfirmed model') {
            vi.mocked(client.call).mockResolvedValueOnce({ configOptions: [{ type: 'select', id: 'model', currentValue: 'other', options: [{ value: 'model', name: 'Model' }] }] })
          } else {
            // A valid model acknowledgement followed by a missing thinking acknowledgement.
            vi.mocked(client.call).mockResolvedValueOnce({ configOptions: [{ type: 'select', id: 'model', currentValue: 'model', options: [{ value: 'model', name: 'Model' }] }] }).mockResolvedValueOnce({})
          }
          await expect(pi.call('dsh/selectModel', { sessionId: 'saved', model: 'model', reasoningEffort: 'high' })).rejects.toThrow('did not confirm')
        }
      } finally { await pi.close() }
    } })))
  })

  it('preserves first new-session and synchronous prompt frames', async () => {
    const client = fake()
    let receive!: CursorAcpInboundHandler
    client.onInbound = handler => { receive = handler; return () => {} }
    client.call = vi.fn(async method => {
      receive({ kind: 'notification', method: 'session/update', params: { sessionId: 'new-session', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: method } } } })
      return { sessionId: 'new-session' }
    })
    const pi = new PiAcpClient('pi-acp', undefined, {}, () => client)
    const inbound = vi.fn()
    pi.onInbound(inbound)
    try {
      await pi.call('session/new', { cwd: '/tmp' })
      await pi.call('session/prompt', { sessionId: 'new-session', prompt: [] })
      expect(inbound.mock.calls.map(([message]) => message.params.update.content.text)).toEqual(['session/new', 'session/prompt'])
    } finally { await pi.close() }
  })
  it('isolates initial load replay, commits configuration and opens live delivery only on success', async () => {
    const failures: string[] = []
    for (const scenario of ['replay then live', 'load rejects', 'wrong returned session', 'permission during load'] as const) {
      const client = fake()
      let receive!: CursorAcpInboundHandler
      client.onInbound = handler => { receive = handler; return () => {} }
      const pi = new PiAcpClient('pi-acp', undefined, {}, () => client)
      const inbound = vi.fn()
      pi.onInbound(inbound)
      const update = (sessionUpdate: string, fields: Record<string, unknown> = {}, sessionId = 'saved') =>
        receive({ kind: 'notification', method: 'session/update', params: { sessionId, update: { sessionUpdate, ...fields } } })
      let finish!: (result: unknown) => void
      let reject!: (error: Error) => void
      vi.mocked(client.call).mockImplementationOnce(() => new Promise((resolve, fail) => { finish = resolve; reject = fail }))
      try {
        const loading = pi.call('session/load', { sessionId: 'saved', cwd: '/tmp' })
        // Let wrapper startup install its receiver and enter session/load.
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
        for (const kind of ['user_message_chunk', 'agent_message_chunk', 'agent_thought_chunk', 'tool_call', 'tool_call_update']) {
          update(kind, { content: { type: 'text', text: 'historical' }, toolCallId: 'old' })
        }
        update('config_option_update', { configOptions: [{ type: 'select', id: 'model', currentValue: 'replayed', options: [{ value: 'replayed', name: 'Replayed' }] }] })
        update('current_mode_update', { currentModeId: 'high' })
        update('current_mode_update', { currentModeId: 'foreign' }, 'other')
        if (scenario === 'permission during load') {
          receive({ kind: 'request', id: 42, method: 'session/request_permission', params: { sessionId: 'saved', options: [{ optionId: 'allow', kind: 'allow_once' }] } })
          expect(client.respondError).toHaveBeenCalledWith(42, -32600, expect.any(String))
          expect(client.respond).not.toHaveBeenCalled()
          await expect(pi.respond(42, { outcome: { outcome: 'selected', optionId: 'allow' } })).rejects.toMatchObject({ code: 'ACP_CALLBACK_NOT_FOUND' })
        }
        expect(inbound).not.toHaveBeenCalled()
        if (scenario === 'load rejects') reject(new Error('load failed'))
        else finish({ sessionId: scenario === 'wrong returned session' ? 'other' : 'saved', modes: { currentModeId: 'low', availableModes: [{ id: 'high', name: 'High' }] } })
        if (scenario === 'load rejects' || scenario === 'wrong returned session') {
          await expect(loading).rejects.toMatchObject(scenario === 'load rejects' ? { message: 'load failed' } : { code: 'ACP_INVALID_SESSION' })
          expect(client.close).toHaveBeenCalledOnce()
          update('agent_message_chunk', { content: { type: 'text', text: 'late' } })
          expect(inbound).not.toHaveBeenCalled()
          await expect(pi.call('dsh/sessionModels', { sessionId: 'saved' })).rejects.toMatchObject({ code: 'ACP_SESSION_NOT_LOADED' })
        } else {
          await loading
          await expect(pi.call('dsh/sessionModels', { sessionId: 'saved' })).resolves.toMatchObject({ current: { model: 'replayed', reasoningEffort: 'high' } })
          update('agent_message_chunk', { content: { type: 'text', text: 'live' } })
          update('current_mode_update', { currentModeId: 'low' })
          expect(inbound).toHaveBeenCalledTimes(2)
          await expect(pi.call('dsh/sessionModels', { sessionId: 'saved' })).resolves.toMatchObject({ current: { reasoningEffort: 'low' } })
          receive({ kind: 'request', id: 43, method: 'session/request_permission', params: { sessionId: 'saved' } })
          const callback = inbound.mock.calls.at(-1)![0]
          expect(callback.id).not.toBe(43)
          await pi.respond(callback.id, { outcome: { outcome: 'cancelled' } })
          expect(client.respond).toHaveBeenCalledWith(43, { outcome: { outcome: 'cancelled' } })
        }
      } catch (error) { failures.push(`${scenario}: ${String(error)}`) }
      finally { await pi.close() }
    }
    expect(failures).toEqual([])
  })
  it('assembles native replay messages, reasoning and paired tool results without leaking temporary notifications', async () => {
    const chunk = (sessionUpdate: string, text: string) => ({ sessionUpdate, content: { type: 'text', text } })
    // Includes the exact 0.0.34 load tool shapes, including bash metadata and
    // provisional completed status followed by an authoritative failure.
    const replay = [chunk('user_message_chunk', 'hel'), chunk('user_message_chunk', 'lo'),
      chunk('agent_thought_chunk', 'think'), chunk('agent_thought_chunk', 'ing'),
      chunk('agent_message_chunk', 'checking'),
      { sessionUpdate: 'tool_call', toolCallId: 'read-1', title: 'read', status: 'completed', rawInput: { path: 'missing' },
        rawOutput: { content: [{ type: 'text', text: 'missing' }], isError: true } },
      { sessionUpdate: 'tool_call_update', toolCallId: 'read-1', status: 'failed', content: [{ type: 'content', content: { type: 'text', text: 'missing' } }] },
      { sessionUpdate: 'tool_call', toolCallId: 'bash-1', title: 'printf ok', kind: 'execute', status: 'completed', content: [{ type: 'terminal', terminalId: 'bash-1' }] },
      { sessionUpdate: 'tool_call_update', toolCallId: 'bash-1', status: 'completed', _meta: { terminal_output: { terminal_id: 'bash-1', data: 'ok' }, terminal_exit: { exit_code: 0 } } },
      chunk('agent_message_chunk', 'all '), chunk('agent_message_chunk', 'done'),
      chunk('user_message_chunk', 'again'), chunk('agent_message_chunk', 'yes')]
    const clients: CursorAcpLike[] = []
    const pi = new PiAcpClient('pi-acp', undefined, {}, () => { const client = fake(replay); clients.push(client); return client })
    const inbound = vi.fn()
    pi.onInbound(inbound)
    const first = await pi.history('saved', '/tmp') as any[]
    expect(await pi.history('saved', '/tmp')).toEqual(first)
    expect(inbound).not.toHaveBeenCalled()
    expect(clients.every(client => vi.mocked(client.close).mock.calls.length === 1)).toBe(true)
    const events = first.map(row => row.event)
    expect(events.map(event => event.seq)).toEqual(events.map((_, index) => index))
    expect(events.every(event => event.time === 0)).toBe(true)
    expect(events.filter(event => event.type === 'turn/start')).toHaveLength(2)
    expect(events.filter(event => event.type === 'user/message').map(event => event.data.content)).toEqual([[{ type: 'text', text: 'hello' }], [{ type: 'text', text: 'again' }]])
    expect(events.filter(event => event.type === 'assistant/message').map(event => event.data.message.content)).toEqual([
      [{ type: 'reasoning', text: 'thinking' }, { type: 'text', text: 'checking' }], [{ type: 'text', text: 'all done' }], [{ type: 'text', text: 'yes' }]])
    const calls = events.filter(event => event.type === 'tool/call')
    expect(calls.map(event => [event.data.callId, event.data.name, event.data.arguments])).toEqual([['read-1', 'read', '{"path":"missing"}'], ['bash-1', 'printf ok', '{}']])
    const results = events.filter(event => event.type === 'tool/result')
    expect(results.map(event => event.data.message.content[0])).toEqual([
      { type: 'tool-result', toolCallId: 'read-1', content: [{ type: 'text', text: 'missing' }], isError: true },
      { type: 'tool-result', toolCallId: 'bash-1', content: [{ type: 'text', text: 'ok' }] }])
    expect(results.every(event => event.surfaceOp === 'append')).toBe(true)
    expect(results.every(event => event.data.message.role === 'user' && event.data.message.source.kind === 'tool')).toBe(true)
    expect(events.map(event => event.type)).toEqual([
      'turn/start', 'step/start', 'user/message', 'assistant/message', 'tool/call', 'tool/result',
      'tool/call', 'tool/result', 'step/end', 'step/start', 'assistant/message', 'step/end', 'turn/end',
      'turn/start', 'step/start', 'user/message', 'assistant/message', 'step/end', 'turn/end',
    ])
    const ids = events.flatMap(event => event.type === 'user/message' ? [event.data.id] : event.data.message ? [event.data.message.id] : [])
    expect(new Set(ids).size).toBe(ids.length)
    expect(JSON.stringify(first)).not.toContain('secret')
    await pi.close()
  })

  it('reserves one history slot during startup and releases it after failures', async () => {
    let release!: () => void
    const client = fake()
    vi.mocked(client.start).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
    const pi = new PiAcpClient('pi-acp', undefined, {}, () => client)
    const first = pi.history('saved', '/tmp')
    await expect(pi.history('other', '/tmp')).rejects.toMatchObject({ code: 'ACP_PROCESS_LIMIT' })
    release()
    await first
    await expect(pi.history('saved', '/tmp')).resolves.toHaveLength(5)
    await pi.close()
  })

  it('fails explicitly at history bounds and disposes failed temporary loads', async () => {
    const failures: string[] = []
    for (const [name, replay, error] of [
      ['count', Array.from({ length: 10001 }, () => ({ sessionUpdate: 'config_option_update' })), undefined],
      ['bytes', [{ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'x'.repeat(8 * 1024 * 1024) } }], undefined],
      ['load', [], new Error('load failed')],
    ] as const) {
      const client = fake([...replay], error)
      const pi = new PiAcpClient('pi-acp', undefined, {}, () => client)
      try {
        await expect(pi.history('saved', '/tmp')).rejects.toMatchObject(error ? { message: 'load failed' } : { code: 'ACP_HISTORY_TOO_LARGE' })
        expect(client.close).toHaveBeenCalledOnce()
      } catch (failure) { failures.push(`${name}: ${String(failure)}`) }
      finally { await pi.close() }
    }
    expect(failures).toEqual([])
    const client = fake(Array.from({ length: 10000 }, () => ({ sessionUpdate: 'config_option_update' })))
    const pi = new PiAcpClient('pi-acp', undefined, {}, () => client)
    await expect(pi.history('saved', '/tmp')).resolves.toEqual([])
    await pi.close()
  })
  it('deduplicates session loads, preserves live sessions across history reads and closes every wrapper', async () => {
    const clients: CursorAcpLike[] = []
    const pi = new PiAcpClient('pi-acp', undefined, {}, () => { const client = fake(); clients.push(client); return client })
    await pi.start()
    await Promise.all([pi.call('session/load', { sessionId: 'saved', cwd: '/tmp' }), pi.call('session/load', { sessionId: 'saved', cwd: '/tmp' })])
    expect(clients).toHaveLength(2)
    let finishPrompt!: () => void
    vi.mocked(clients[1]!.call).mockImplementationOnce(() => new Promise(resolve => { finishPrompt = () => resolve({ stopReason: 'end_turn' }) }))
    const prompt = pi.call('session/prompt', { sessionId: 'saved', prompt: [] }, 123)
    expect(clients[1]!.call).toHaveBeenLastCalledWith('session/prompt', { sessionId: 'saved', prompt: [] }, 123)
    const history = await pi.history('saved', '/tmp')
    await expect(pi.call('session/prompt', { sessionId: 'saved', prompt: [] })).rejects.toMatchObject({ code: 'PROMPT_IN_PROGRESS' })
    finishPrompt()
    await prompt
    expect(history).toEqual(expect.arrayContaining([expect.objectContaining({ event: expect.objectContaining({ type: 'user/message' }) })]))
    expect(clients[2]!.close).toHaveBeenCalledOnce()
    expect(clients[1]!.close).not.toHaveBeenCalled()
    await pi.call('session/load', { sessionId: 'saved', cwd: '/tmp' })
    expect(clients).toHaveLength(3)
    await expect(pi.call('dsh/sessionModels', { sessionId: 'saved' })).resolves.toMatchObject({ current: { provider: 'pi', model: 'model', reasoningEffort: 'low' } })
    await expect(pi.call('dsh/selectModel', { sessionId: 'saved', model: 'invented' })).rejects.toMatchObject({ code: 'INVALID_MESSAGE' })
    await expect(pi.call('dsh/selectModel', { sessionId: 'saved', model: 'model', reasoningEffort: 'high' })).resolves.toMatchObject({ selected: { reasoningEffort: 'high' } })
    expect(clients[1]!.call).toHaveBeenLastCalledWith('session/set_config_option', { sessionId: 'saved', configId: 'thought_level', value: 'high' })
    const unavailable = vi.fn()
    pi.onUnavailable(unavailable)
    vi.mocked(clients[1]!.onUnavailable).mock.calls[0]![0]('EXITED')
    expect(unavailable).not.toHaveBeenCalled()
    await pi.call('session/load', { sessionId: 'saved', cwd: '/tmp' })
    expect(clients).toHaveLength(4)
    await pi.close()
    expect(clients[0]!.close).toHaveBeenCalledOnce()
    expect(clients[1]!.close).toHaveBeenCalledOnce()
  })
})
