import { PassThrough } from 'node:stream'
import headless from '@xterm/headless'
import { afterEach, expect, it, vi } from 'vitest'
import { runScenarios } from '../../../scripts/test-scenarios.mjs'
import { RemoteTerminalController, RemoteTerminalState } from '../src/remote-terminal-controller.js'
import { discoverTerminalShells, type RemoteTerminalProcess, type RemoteTerminalSpawner, type RemoteTerminalSpec } from '../src/remote-terminal-provider.js'
import { RpcError } from '../src/safe-error.js'
import { TerminalPolicy } from '../src/terminal-policy.js'

const signal = new AbortController().signal
const states: RemoteTerminalState[] = []
afterEach(async () => { vi.useRealTimers(); await Promise.all(states.splice(0).map(state => state.dispose())) })

function fixture() {
  const removed = vi.fn()
  const state = new RemoteTerminalState(removed); states.push(state)
  const outputs: PassThrough[] = []
  const writes: string[] = []
  const activity = vi.fn(async () => ({ state: 'unknown' as 'idle' | 'busy' | 'unknown', revision: 0 }))
  const terminate = vi.fn(async () => {})
  const resize = vi.fn(async () => {})
  const start = vi.fn(async (_spec: RemoteTerminalSpec): Promise<RemoteTerminalProcess> => {
    const output = new PassThrough(); output.setEncoding('utf8'); outputs.push(output)
    let settle!: (value: { exitCode: number | null }) => void
    const completed = new Promise<{ exitCode: number | null }>(resolve => { settle = resolve })
    return { output: output as unknown as AsyncIterable<string>, completed,
      write: data => { writes.push(data) }, resize, inspectActivity: activity,
      terminate: async () => { await terminate(); output.end(); settle({ exitCode: 0 }) } }
  })
  const spawn: RemoteTerminalSpawner = Object.assign(start, { shells: async () => [{ path: '/verified/bash', args: ['-i'], name: 'bash' }] })
  let enabled = true
  const controller = () => new RemoteTerminalController(state, spawn, () => enabled, (code, message) => new RpcError(`TEST_${code}`, message))
  const first = controller()
  const call = (endpoint: string, args: Record<string, unknown> = {}) => first.call(`terminal/${endpoint}`, 'session', '/trusted', args, signal)
  const create = () => call('create', { request: { id: 'term', cols: 80, rows: 24 } })
  const open = (attachmentId: string, connection = first, abort = signal) => connection.open('terminal/follow', 'session', { id: 'term', attachmentId }, abort)
  return { state, removed, outputs, writes, activity, terminate, resize, start, spawn, first, controller, call, create, open, disable: () => { enabled = false } }
}

const iterators = new WeakMap<AsyncIterable<unknown>, AsyncIterator<unknown>>()
async function frame(source: AsyncIterable<unknown>): Promise<Record<string, any>> {
  let iterator = iterators.get(source)
  if (!iterator) { iterator = source[Symbol.asyncIterator](); iterators.set(source, iterator) }
  return (await iterator.next()).value as Record<string, any>
}

it('discovers shells in the provider execution world and rejects unverified selection', async () => {
  await runScenarios([
    ...[
      { name: 'posix interactive default', path: '/account/zsh', args: ['-i'], platform: 'posix' as const },
      { name: 'Windows PowerShell default', path: 'C:\\verified\\pwsh.exe', args: ['-NoLogo'], platform: 'windows' as const },
      { name: 'Windows cmd default', path: 'C:\\verified\\cmd.exe', args: [], platform: 'windows' as const },
    ].map(row => ({ name: row.name, run: async () => {
      const resolve = vi.fn(async (path: string) => {
        if (path !== row.path) throw Object.assign(new Error(), { name: 'SubprocessExecutableNotFoundError' })
        return path
      })
      const shells = await discoverTerminalShells({ spawnTerminal: async () => {}, terminalEnvironment: async () => ({ platform: row.platform, defaultShell: row.path }), resolveExecutable: resolve }, signal)
      expect(shells[0]).toMatchObject({ path: row.path, args: row.args })
      expect(resolve).toHaveBeenCalledWith(row.path, undefined, signal)
    } })),
    { name: 'declared default cannot silently downgrade', run: async () => {
      await expect(discoverTerminalShells({ spawnTerminal: async () => {},
        terminalEnvironment: async () => ({ platform: 'posix', defaultShell: '/missing/default' }),
        resolveExecutable: async () => { throw Object.assign(new Error(), { name: 'SubprocessExecutableNotFoundError' }) },
      }, signal)).rejects.toThrow()
    } },
    { name: 'client cannot supply an arbitrary executable', run: async () => {
      const f = fixture()
      await expect(f.call('create', { request: { id: 'term', shellPath: '/untrusted/command' } })).rejects.toMatchObject({ code: 'INVALID_MESSAGE' })
      expect(f.start).not.toHaveBeenCalled(); expect(f.state.terminals.size).toBe(0)
    } },
  ])
})

it('serializes duplicate allocations and cleans late processes after close, disposal or disable', async () => {
  await runScenarios(['duplicate', 'close', 'dispose', 'disable'].map(kind => ({ name: kind, run: async () => {
    const f = fixture()
    const original = f.start.getMockImplementation()!
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    f.start.mockImplementation(async spec => { await gate; return original(spec) })
    const first = f.create(); void first.catch(() => {})
    await vi.waitFor(() => expect(f.start).toHaveBeenCalledTimes(1))
    const duplicate = f.create(); void duplicate.catch(() => {})
    await Promise.resolve()
    expect(f.start).toHaveBeenCalledTimes(1)
    const closing = kind === 'close' ? f.call('close', { id: 'term' }) : kind === 'dispose' ? f.state.dispose() : undefined
    if (kind === 'disable') f.disable()
    release()
    if (kind === 'duplicate') {
      expect(await first).toEqual(await duplicate)
      expect(f.start).toHaveBeenCalledTimes(1)
    } else {
      await expect(first).rejects.toThrow(); await expect(duplicate).rejects.toThrow()
      await closing
      expect(f.terminate).toHaveBeenCalledTimes(1)
      expect(f.state.terminals.size).toBe(0)
    }
  } })))
})

it('keeps terminal ownership across connections but releases input when an attachment detaches', async () => {
  await runScenarios([
    { name: 'different attachment IDs', attachmentId: 'new', detached: false },
    { name: 'same ID on another live connection', attachmentId: 'old', detached: false },
    { name: 'same ID after disconnect', attachmentId: 'old', detached: true },
  ].map(row => ({ name: row.name, run: async () => {
    const f = fixture(); await f.create()
    const oldSignal = new AbortController()
    const old = await f.open('old', f.first, oldSignal.signal); await frame(old)
    if (row.detached) f.first.closeAll()
    const second = f.controller()
    const newer = await f.open(row.attachmentId, second); await frame(newer)
    await expect(f.call('write', { id: 'term', attachmentId: 'old', data: 'old' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    await expect(f.call('resize', { id: 'term', attachmentId: 'old', cols: 100, rows: 30 })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(f.resize).not.toHaveBeenCalled()
    oldSignal.abort()
    await second.call('terminal/write', 'session', '/trusted', { id: 'term', attachmentId: row.attachmentId, data: 'new' }, signal)
    await second.call('terminal/resize', 'session', '/trusted', { id: 'term', attachmentId: row.attachmentId, cols: 100, rows: 30 }, signal)
    expect(f.resize).toHaveBeenCalledTimes(1)
    second.closeAll()
    await expect(second.call('terminal/write', 'session', '/trusted', { id: 'term', attachmentId: row.attachmentId, data: 'replay' }, signal)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(f.writes).toEqual(['new'])
    expect(f.terminate).not.toHaveBeenCalled()
    const recovered = await f.open('reconnected'); await frame(recovered)
    await f.call('write', { id: 'term', attachmentId: 'reconnected', data: 'fresh' })
    expect(f.writes).toEqual(['new', 'fresh'])
  } })))
})

it('disconnect fences a follow whose serialized snapshot is still pending', async () => {
  const f = fixture(); await f.create()
  const opening = f.open('late'); void opening.catch(() => {})
  f.first.closeAll()
  await expect(opening).rejects.toMatchObject({ code: 'TRANSPORT_CLOSED' })
  await expect(f.call('write', { id: 'term', attachmentId: 'late', data: 'late' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  expect(f.state.terminals.get('session/term')!.controllerId).toBeUndefined()
  expect(f.writes).toEqual([])
  expect(f.terminate).not.toHaveBeenCalled()
})

it('request cancellation only cleans allocations before their commit and preserves committed device claims', async () => {
  await runScenarios(['before commit', 'after commit'].map(phase => ({ name: phase, run: async () => {
    const f = fixture(), request = new AbortController()
    const original = f.start.getMockImplementation()!
    f.start.mockImplementation(async spec => {
      const process = await original(spec)
      // The extra microtask cancels after the allocation continuation commits,
      // but before the awaiting RPC resumes to return its result.
      queueMicrotask(() => phase === 'before commit' ? request.abort() : queueMicrotask(() => request.abort()))
      return process
    })
    const owners = new Map<string, string>()
    const policy = new TerminalPolicy(true, 'device', owners)
    const payload = { args: { agentId: 'session', request: { id: 'term' } } }
    const reservation = policy.check('terminal/create', payload)
    const creation = f.first.call('terminal/create', 'session', '/trusted', payload.args, request.signal)
    if (phase === 'before commit') {
      await expect(creation).rejects.toMatchObject({ name: 'AbortError' })
      policy.result('terminal/create', payload, { ok: false, error: { code: 'FAILED', message: '', details: {} } }, reservation)
      expect(f.terminate).toHaveBeenCalledTimes(1)
      expect(f.state.terminals.size).toBe(0)
      expect(owners.size).toBe(0)
    } else {
      const result = await creation
      expect(request.signal.aborted).toBe(true)
      policy.result('terminal/create', payload, result, reservation)
      expect(owners.get('session/term')).toBe('device')
      expect(() => new TerminalPolicy(true, 'other', owners).check('terminal/create', payload)).toThrow()
      expect(f.terminate).not.toHaveBeenCalled()
      expect(await f.create()).toEqual(result)
      const reconnected = f.controller()
      const recovered = await f.open('fresh', reconnected); await frame(recovered)
      await reconnected.call('terminal/write', 'session', '/trusted', { id: 'term', attachmentId: 'fresh', data: 'fresh input' }, signal)
      expect(f.writes).toEqual(['fresh input'])
      expect(f.state.terminals.size).toBe(1)
      expect(f.start).toHaveBeenCalledTimes(1)
    }
  } })))
})

it('recovers the parsed screen after clear, cursor movement and resize with ordered output', async () => {
  const f = fixture(); await f.create()
  const first = await f.open('first'); await frame(first)
  f.outputs[0]!.write('secret-old-screen\x1b[2J\x1b[Hnew\r\nline\x1b[1;1HX')
  const output = await frame(first)
  expect(output).toMatchObject({ type: 'output', sequence: 1 })
  await f.call('resize', { id: 'term', attachmentId: 'first', cols: 100, rows: 30 })
  f.first.closeAll()
  const reconnect = await f.open('second', f.controller())
  const snapshot = await frame(reconnect)
  expect(snapshot).toMatchObject({ type: 'snapshot', sequence: 1, info: { cols: 100, rows: 30 } })
  expect(snapshot.screen).not.toContain('secret-old-screen')
  const restored = new headless.Terminal({ cols: 100, rows: 30, allowProposedApi: true })
  try {
    await new Promise<void>(resolve => restored.write(snapshot.screen, resolve))
    expect(restored.buffer.active.getLine(0)?.translateToString(true)).toBe('Xew')
    expect(restored.buffer.active.getLine(1)?.translateToString(true)).toBe('line')
  } finally { restored.dispose() }
})

it('fails a slow output subscriber without losing the screen or the shell', async () => {
  const f = fixture(); await f.create()
  const slow = await f.open('slow'); await frame(slow)
  // More than one follower's queue limit, while the parsed screen remains bounded.
  f.outputs[0]!.write('a'.repeat(1_100_000))
  await vi.waitFor(() => expect(f.state.terminals.values().next().value?.sequence).toBeGreaterThan(65), { timeout: 3000 })
  await expect(frame(slow)).rejects.toMatchObject({ code: 'TERMINAL_BUFFER_EXCEEDED' })
  const recovered = await frame(await f.open('fresh', f.controller()))
  expect(recovered.type).toBe('snapshot')
  expect(Buffer.byteLength(recovered.screen)).toBeLessThanOrEqual(256 * 1024)
  expect(f.terminate).not.toHaveBeenCalled()
})

it('retains cleanup ownership on failure so explicit close can retry', async () => {
  const f = fixture(); await f.create()
  f.terminate.mockRejectedValueOnce(new Error('provider failed'))
  await expect(f.call('close', { id: 'term' })).rejects.toMatchObject({ code: 'TERMINAL_CLEANUP_FAILED' })
  expect(f.state.terminals.size).toBe(1)
  expect(f.removed).not.toHaveBeenCalled()
  await expect(f.create()).rejects.toMatchObject({ code: 'TEST_TERMINAL_NOT_FOUND' })
  await f.call('close', { id: 'term' })
  expect(f.state.terminals.size).toBe(0)
  expect(f.removed).toHaveBeenCalledTimes(1)
  expect(f.removed).toHaveBeenCalledWith('session/term')
  expect(f.terminate).toHaveBeenCalledTimes(2)
})

it('reclaims only positively idle unheld shells; busy, unknown and changing revisions survive', async () => {
  await runScenarios(['idle', 'busy', 'unknown', 'changing', 'retained'].map(kind => ({ name: kind, run: async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    const f = fixture()
    let revision = 0
    f.activity.mockImplementation(async () => ({ state: kind === 'busy' ? 'busy' : kind === 'unknown' ? 'unknown' : 'idle', revision: kind === 'changing' ? revision++ : 0 }))
    try {
      await f.create()
      if (kind === 'retained') await frame(await f.first.open('terminal/retain', 'session', { id: 'term' }, signal))
      await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000 + 60_000)
      expect(f.state.terminals.size).toBe(kind === 'idle' ? 0 : 1)
      if (kind === 'retained') expect(f.activity).not.toHaveBeenCalled()
    } finally { vi.useRealTimers(); await f.state.dispose() }
  } })))
})
