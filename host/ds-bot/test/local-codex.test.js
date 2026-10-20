// Modified by Seren-715 for DSH Remote Groups (2026-10-20): local Agent group integration, mobile history and attachments. Original work: Fei2411/DeepSeek-Bot, Apache-2.0.
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import { test } from 'node:test'
import { createCodexRuntime } from '../src/host/local-codex.js'

function setup(handle = () => {}, options = {}) {
  const sent = []
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = () => { child.killed = true }
  const respond = (id, result) => child.stdout.write(`${JSON.stringify({ id, result })}\n`)
  const notify = (method, params) => child.stdout.write(`${JSON.stringify({ method, params })}\n`)
  child.stdin = new Writable({ write(chunk, encoding, callback) {
    const message = JSON.parse(chunk.toString())
    sent.push(message)
    queueMicrotask(() => {
      // CLI-generated v2 ThreadStartParams/ThreadResumeParams wire enums.
      // Thread sandbox uses kebab-case; turn sandboxPolicy.type uses camelCase.
      if (message.method === 'thread/start' || message.method === 'thread/resume') {
        const approvalPolicies = ['untrusted', 'on-request', 'never']
        const sandboxModes = ['read-only', 'workspace-write', 'danger-full-access']
        if (!approvalPolicies.includes(message.params.approvalPolicy) || !sandboxModes.includes(message.params.sandbox)) {
          child.stdout.write(`${JSON.stringify({ id: message.id, error: { message: 'Invalid request: unsupported approval policy or sandbox wire enum' } })}\n`)
          return
        }
      }
      if (handle(message, { child, respond, notify }) === false) return
      if (message.method === 'initialize') respond(message.id, {})
      else if (message.method === 'thread/start' || message.method === 'thread/resume') respond(message.id, { thread: { id: 'thread1' } })
      else if (message.method === 'turn/start') respond(message.id, { turn: { id: 'turn1', status: 'inProgress' } })
    })
    callback()
  } })
  let spawnArgs
  const runtime = createCodexRuntime({ command: 'codex', spawnProcess: (...args) => { spawnArgs = args; return child }, ...options })
  return { runtime, sent, child, notify, respond, spawnArgs: () => spawnArgs }
}

const scope = { threadId: 'thread1', turnId: 'turn1' }
const completed = (notify, status = 'completed') => notify('turn/completed', { threadId: 'thread1', turn: { id: 'turn1', status } })
const tick = () => new Promise(resolve => setImmediate(resolve))

test('Codex initializes, streams text, and waits for completed before success', async () => {
  const f = setup((message, { notify }) => {
    if (message.method === 'turn/start') {
      notify('item/agentMessage/delta', { ...scope, itemId: 'answer', delta: 'hello ' })
      notify('item/agentMessage/delta', { ...scope, itemId: 'answer', delta: '世界' })
      notify('item/started', { ...scope, item: { type: 'commandExecution' } })
    }
  })
  const events = []
  let resolved = false
  const result = f.runtime.run({ cwd: 'D:/work', text: 'hello', onEvent: event => events.push(event) }).then(value => { resolved = true; return value })
  await tick()
  assert.equal(resolved, false)
  f.notify('turn/completed', { threadId: 'other', turn: { id: 'turn1', status: 'completed' } })
  assert.equal(resolved, false)
  completed(f.notify)
  assert.deepEqual(await result, { sessionId: 'thread1', text: 'hello 世界' })
  assert.deepEqual(events, [{ type: 'text', text: 'hello ' }, { type: 'text', text: '世界' }, { type: 'tool', name: 'commandExecution' }])
  assert.deepEqual(f.sent.map(message => message.method), ['initialize', 'initialized', 'thread/start', 'turn/start'])
  assert.deepEqual(f.spawnArgs()[1], ['app-server', '--listen', 'stdio://'])
  assert.equal(f.spawnArgs()[2].shell, false)
  assert.equal(f.sent[2].params.approvalPolicy, 'untrusted')
  assert.equal(f.sent[2].params.sandbox, 'workspace-write')
  assert.equal(f.child.killed, true)
})

test('Codex resumes threads and uses final agent message without duplicate text', async () => {
  const f = setup((message, { notify }) => {
    if (message.method === 'turn/start') {
      notify('item/agentMessage/delta', { ...scope, itemId: 'a', delta: 'partial' })
      notify('item/completed', { ...scope, item: { id: 'a', type: 'agentMessage', text: 'final' } })
      completed(notify)
    }
  })
  assert.deepEqual(await f.runtime.run({ sessionId: 'thread1', text: 'again' }), { sessionId: 'thread1', text: 'final' })
  assert.equal(f.sent[2].method, 'thread/resume')
  assert.equal(f.sent[2].params.threadId, 'thread1')
})

test('Codex maps only single-action approvals and refuses mismatched turns', async () => {
  const approvals = []
  const f = setup((message, { child, notify }) => {
    if (message.method === 'turn/start') {
      for (const [id, method, params] of [
        [101, 'item/commandExecution/requestApproval', { ...scope, reason: 'Run test' }],
        [102, 'item/fileChange/requestApproval', { ...scope, reason: 'Edit file' }],
        [103, 'item/commandExecution/requestApproval', { ...scope, reason: 'Cancel' }],
        [104, 'item/fileChange/requestApproval', { ...scope, turnId: 'other' }],
      ]) child.stdout.write(`${JSON.stringify({ id, method, params })}\n`)
    }
    if (message.id === 104 && message.result) queueMicrotask(() => completed(notify))
  })
  const decisions = ['allow', 'reject', 'cancel']
  await f.runtime.run({ text: 'work', onApproval: request => { approvals.push(request); return decisions.shift() } })
  assert.deepEqual(approvals.map(value => value.tool), ['commandExecution', 'fileChange', 'commandExecution'])
  assert.deepEqual(approvals[0].options, ['allow', 'reject', 'cancel'])
  assert.deepEqual(f.sent.filter(value => value.result).map(value => value.result.decision), ['cancel', 'accept', 'decline', 'cancel'])
})

test('Codex denies approval when callback is missing', async () => {
  const f = setup((message, { child, notify }) => {
    if (message.method === 'turn/start') child.stdout.write(`${JSON.stringify({ id: 100, method: 'item/fileChange/requestApproval', params: scope })}\n`)
    if (message.id === 100) { assert.equal(message.result.decision, 'decline'); completed(notify) }
  })
  await f.runtime.run({ text: 'work' })
})

test('Codex handles split UTF-8 protocol chunks', async () => {
  const f = setup((message, { child, notify }) => {
    if (message.method !== 'turn/start') return
    const bytes = Buffer.from(`${JSON.stringify({ method: 'item/agentMessage/delta', params: { ...scope, itemId: 'a', delta: '群聊' } })}\n`)
    const split = bytes.indexOf(Buffer.from('群')) + 1
    child.stdout.write(bytes.subarray(0, split))
    child.stdout.write(bytes.subarray(split))
    completed(notify)
  })
  assert.equal((await f.runtime.run({ text: 'work' })).text, '群聊')
})

test('Codex stops if the approval callback fails', async () => {
  const f = setup((message, { child }) => {
    if (message.method === 'turn/start') child.stdout.write(`${JSON.stringify({ id: 100, method: 'item/fileChange/requestApproval', params: scope })}\n`)
  })
  await assert.rejects(f.runtime.run({ text: 'work', onApproval: () => { throw new Error('approval unavailable') } }), /approval unavailable/)
  assert.equal(f.child.killed, true)
  assert.equal(f.sent.some(message => message.result?.decision === 'accept'), false)
})

test('Codex rejects failed/interrupted turns and process failures', async t => {
  for (const mode of ['failed', 'interrupted', 'error', 'close', 'bad-json', 'rpc-error']) {
    await t.test(mode, async () => {
      const f = setup((message, { child, notify }) => {
        if (message.method !== 'turn/start') return
        if (mode === 'error') child.emit('error', new Error('spawn failed'))
        else if (mode === 'close') child.emit('close', 1)
        else if (mode === 'bad-json') child.stdout.write('invalid json\n')
        else if (mode === 'rpc-error') {
          child.stdout.write(`${JSON.stringify({ id: message.id, error: { message: 'RPC failed' } })}\n`)
          return false
        }
        else completed(notify, mode)
      })
      await assert.rejects(f.runtime.run({ text: 'work' }), mode === 'rpc-error' ? /RPC failed/ : undefined)
      assert.equal(f.child.killed, true)
    })
  }
})

test('Codex interrupts cancellation, enforces timeout, and closes active runs', async () => {
  const abort = setup()
  const controller = new AbortController()
  const run = abort.runtime.run({ text: 'wait', signal: controller.signal })
  await tick()
  controller.abort()
  await assert.rejects(run, { name: 'AbortError' })
  assert.deepEqual(abort.sent.at(-1).params, { threadId: 'thread1', turnId: 'turn1' })
  assert.equal(abort.sent.at(-1).method, 'turn/interrupt')
  const timeout = setup(() => {}, { timeoutMs: 10 })
  await assert.rejects(timeout.runtime.run({ text: 'wait' }), /timed out/)
  const close = setup()
  const pending = close.runtime.run({ text: 'wait' })
  await tick()
  close.runtime.close()
  await assert.rejects(pending, /closed/)
  await assert.rejects(close.runtime.run({ text: 'again' }), /closed/)
})

test('Codex rejects already-aborted requests and invalid timeout configuration', async () => {
  const f = setup()
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(f.runtime.run({ text: 'work', signal: controller.signal }), { name: 'AbortError' })
  assert.equal(f.spawnArgs(), undefined)
  assert.throws(() => createCodexRuntime({ command: 'codex', timeoutMs: Infinity }), /timeout/)
})
