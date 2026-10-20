// Modified by Seren-715 for DSH Remote Groups (2026-10-20): local Agent group integration, mobile history and attachments. Original work: Fei2411/DeepSeek-Bot, Apache-2.0.
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import { test } from 'node:test'
import { createAcpRuntime } from '../src/host/local-acp.js'

function harness(t, handle = () => {}, capabilities = { loadSession: true }) {
  const messages = []
  const children = []
  const reply = (child, message) => child.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
  const spawnProcess = (command, args, options) => {
    const child = new EventEmitter()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.killed = false
    child.kill = () => { child.killed = true }
    child.stdin = new Writable({ write(chunk, encoding, done) {
      const message = JSON.parse(chunk.toString())
      messages.push(message)
      queueMicrotask(() => {
        if (message.method === 'initialize') reply(child, { id: message.id, result: { protocolVersion: 1, agentCapabilities: capabilities } })
        else if (message.method === 'session/new') reply(child, { id: message.id, result: { sessionId: 'new-session' } })
        else handle(message, child, reply)
      })
      done()
    } })
    children.push({ child, command, args, options })
    return child
  }
  const runtime = createAcpRuntime({ command: 'agent', args: ['acp'], spawnProcess, timeoutMs: 1000 })
  t.after(() => runtime.close())
  return { runtime, messages, children, reply, spawnProcess }
}

function update(reply, child, sessionId, value) {
  reply(child, { method: 'session/update', params: { sessionId, update: value } })
}

test('ACP initializes, streams text and tools, and uses a shell-free child', async (t) => {
  const events = []
  const h = harness(t, (message, child, reply) => {
    if (message.method !== 'session/prompt') return
    update(reply, child, 'other-session', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'wrong' } })
    update(reply, child, message.params.sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hello ' } })
    update(reply, child, message.params.sessionId, { sessionUpdate: 'tool_call', title: 'Read file' })
    const wire = JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: message.params.sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '世界' } } } })
    const bytes = Buffer.from(`${wire}\n`)
    const cut = bytes.indexOf(Buffer.from('世界')) + 1
    child.stdout.write(bytes.subarray(0, cut))
    child.stdout.write(bytes.subarray(cut))
    reply(child, { id: message.id, result: { stopReason: 'end_turn' } })
  })
  const result = await h.runtime.run({ cwd: 'D:\\work', text: 'quoted $(input)', onEvent: (event) => events.push(event) })
  assert.deepEqual(result, { sessionId: 'new-session', text: 'Hello 世界' })
  assert.deepEqual(events, [{ type: 'text', text: 'Hello ' }, { type: 'tool', name: 'Read file' }, { type: 'text', text: '世界' }])
  assert.equal(h.children[0].options.shell, false)
  assert.equal(h.children[0].options.windowsHide, true)
  assert.equal(h.children[0].options.cwd, 'D:\\work')
  assert.deepEqual(h.messages.find((message) => message.method === 'session/prompt').params.prompt, [{ type: 'text', text: 'quoted $(input)' }])
})

test('ACP loads the exact session and excludes replayed history from its answer', async (t) => {
  const h = harness(t, (message, child, reply) => {
    if (message.method === 'session/load') {
      update(reply, child, 'saved', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'old response' } })
      reply(child, { id: message.id, result: {} })
    } else if (message.method === 'session/prompt') {
      update(reply, child, 'saved', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'new response' } })
      reply(child, { id: message.id, result: { stopReason: 'end_turn' } })
    }
  })
  assert.deepEqual(await h.runtime.run({ sessionId: 'saved', cwd: 'D:\\work', text: 'next' }), { sessionId: 'saved', text: 'new response' })
  assert.equal(h.messages.some((message) => message.method === 'session/new'), false)
})

test('ACP refuses unsupported or failed load without replacing the session', async (t) => {
  const unsupported = harness(t, undefined, {})
  await assert.rejects(unsupported.runtime.run({ sessionId: 'saved', cwd: '.', text: 'next' }), /cannot load/)
  assert.equal(unsupported.messages.some((message) => message.method === 'session/new'), false)
  const failed = harness(t, (message, child, reply) => {
    if (message.method === 'session/load') reply(child, { id: message.id, error: { code: -32602, message: 'secret provider payload' } })
  })
  await assert.rejects(failed.runtime.run({ sessionId: 'saved', cwd: '.', text: 'next' }), (error) => error.message.includes('session/load') && !error.message.includes('secret'))
  assert.equal(failed.messages.some((message) => message.method === 'session/new'), false)
})

test('ACP reuses its live session without requiring session/load capability', async (t) => {
  const h = harness(t, (message, child, reply) => {
    if (message.method === 'session/load') reply(child, { id: message.id, result: {} })
    if (message.method === 'session/prompt') {
      update(reply, child, message.params.sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: message.params.prompt[0].text } })
      reply(child, { id: message.id, result: { stopReason: 'end_turn' } })
    }
  }, {})
  const first = await h.runtime.run({ cwd: '.', text: 'first' })
  const second = await h.runtime.run({ sessionId: first.sessionId, cwd: '.', text: 'second' })
  assert.equal(second.text, 'second')
  assert.equal(h.children.length, 1)
  assert.equal(h.messages.filter((message) => message.method === 'initialize').length, 1)
  assert.equal(h.messages.some((message) => message.method === 'session/load'), false)
  await assert.rejects(h.runtime.run({ sessionId: first.sessionId, cwd: 'changed', text: 'third' }), /cannot load/)
  h.runtime.close()
  await assert.rejects(h.runtime.run({ cwd: '.', text: 'third' }), /closed/)
})

test('ACP rejects unsupported client filesystem requests and defaults to denying permission', async (t) => {
  let promptId
  const h = harness(t, (message, child, reply) => {
    if (message.method === 'session/prompt') {
      promptId = message.id
      reply(child, { id: 'read', method: 'fs/read_text_file', params: { path: 'credentials' } })
    } else if (message.id === 'read') {
      assert.equal(message.error.code, -32601)
      reply(child, { id: 'permission', method: 'session/request_permission', params: { sessionId: 'new-session', options: [{ kind: 'allow_once', optionId: 'allow' }, { kind: 'reject_once', optionId: 'deny' }] } })
    } else if (message.id === 'permission') {
      assert.deepEqual(message.result.outcome, { outcome: 'selected', optionId: 'deny' })
      reply(child, { id: promptId, result: { stopReason: 'end_turn' } })
    }
  })
  await h.runtime.run({ cwd: '.', text: 'work' })
})

for (const choice of ['allow', 'reject', 'cancel']) {
  test(`ACP maps ${choice} to a one-time permission or cancellation`, async (t) => {
    const options = [{ kind: 'allow_always', optionId: 'always' }, { kind: 'allow_once', optionId: 'once' }, { kind: 'reject_once', optionId: 'deny' }]
    let promptId
    const h = harness(t, (message, child, reply) => {
      if (message.method === 'session/prompt') {
        promptId = message.id
        reply(child, { id: 'permission', method: 'session/request_permission', params: { sessionId: 'new-session', toolCall: { title: 'Run command' }, options } })
      } else if (message.id === 'permission') {
        assert.deepEqual(message.result.outcome, choice === 'cancel' ? { outcome: 'cancelled' } : { outcome: 'selected', optionId: choice === 'allow' ? 'once' : 'deny' })
        reply(child, { id: promptId, result: { stopReason: 'end_turn' } })
      }
    })
    await h.runtime.run({ cwd: '.', text: 'work', onApproval: async (request) => { assert.equal(request.tool, 'Run command'); return choice } })
  })
}

test('ACP never grants an always permission when no once option exists', async (t) => {
  let promptId
  const h = harness(t, (message, child, reply) => {
    if (message.method === 'session/prompt') {
      promptId = message.id
      reply(child, { id: 'permission', method: 'session/request_permission', params: { sessionId: 'new-session', options: [{ kind: 'allow_always', optionId: 'always' }] } })
    } else if (message.id === 'permission') {
      assert.deepEqual(message.result.outcome, { outcome: 'cancelled' })
      reply(child, { id: promptId, result: { stopReason: 'end_turn' } })
    }
  })
  await h.runtime.run({ cwd: '.', text: 'work', onApproval: () => 'allow' })
})

test('ACP abort sends session/cancel, kills its process and rejects concurrent turns', async (t) => {
  const controller = new AbortController()
  let started
  const promptStarted = new Promise((resolve) => { started = resolve })
  const h = harness(t, (message) => { if (message.method === 'session/prompt') started() })
  const running = h.runtime.run({ cwd: '.', text: 'work', signal: controller.signal })
  await promptStarted
  await assert.rejects(h.runtime.run({ cwd: '.', text: 'second' }), /already running/)
  controller.abort()
  await assert.rejects(running, { name: 'AbortError' })
  assert.equal(h.children[0].child.killed, true)
  assert.equal(h.messages.at(-1).method, 'session/cancel')
})

test('ACP handles process failure, malformed protocol, timeout and close', async (t) => {
  for (const mode of ['exit', 'invalid', 'timeout', 'close']) {
    const h = harness(t, (message, child) => {
      if (message.method !== 'session/prompt') return
      if (mode === 'exit') child.emit('exit', 1)
      if (mode === 'invalid') child.stdout.write('not JSON\n')
      if (mode === 'close') h.runtime.close()
    })
    const runtime = mode === 'timeout' ? createAcpRuntime({ command: 'agent', spawnProcess: h.spawnProcess, timeoutMs: 10 }) : h.runtime
    t.after(() => runtime.close())
    await assert.rejects(runtime.run({ cwd: '.', text: 'work' }), /exited|protocol|timed out|closed/)
    assert.equal(h.children[0].child.killed, true)
  }
})

test('ACP refuses saved sessions after restart when the agent cannot load them', async (t) => {
  const h = harness(t, (message, child, reply) => {
    if (message.method === 'session/prompt') reply(child, { id: message.id, result: { stopReason: 'end_turn' } })
  }, {})
  const first = await h.runtime.run({ cwd: '.', text: 'first' })
  h.children[0].child.emit('exit', 0)
  await assert.rejects(h.runtime.run({ sessionId: first.sessionId, cwd: '.', text: 'next' }), /cannot load/)
  assert.equal(h.children.length, 2)
  assert.equal(h.messages.filter((message) => message.method === 'session/new').length, 1)
})

for (const stopReason of ['refusal', 'refused', 'max_turn_requests', 'max_tokens', undefined]) {
  test(`ACP does not treat incomplete stop reason ${stopReason} as success`, async (t) => {
    const h = harness(t, (message, child, reply) => {
      if (message.method === 'session/prompt') reply(child, { id: message.id, result: { stopReason } })
    })
    await assert.rejects(h.runtime.run({ cwd: '.', text: 'work' }), /did not complete/)
  })
}
