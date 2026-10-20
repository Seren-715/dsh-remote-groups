// Modified by Seren-715 for DSH Remote Groups (2026-10-20): local Agent group integration, mobile history and attachments. Original work: Fei2411/DeepSeek-Bot, Apache-2.0.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { install } from '../src/host/channel.js'
import { fakeContext } from './fake-ctx.js'

function channel(t, { room, readOnly, earlierPage, readGroupLine } = {}) {
  const ctx = fakeContext()
  t.after(() => ctx.dispose())
  let route
  const register = ctx.connection.fetch.register
  ctx.connection.fetch.register = options => {
    route = options
    return register(options)
  }
  install({
    ctx, state: {},
    refresh: async () => {}, load: async () => {},
    readOnly: () => readOnly,
    roomOf: id => room?.id === id ? room : undefined,
    earlierPage,
    readGroupLine,
    noteFailure: error => assert.fail(JSON.stringify(error)),
  })
  return async payload => (await route.fetch(new Request('http://localhost/api/bot', {
    method: 'POST', body: JSON.stringify({ endpoint: 'earlier', payload }),
  }))).json()
}

test('Remote group history reads the latest 60 lines without internal room or line data', async t => {
  const log = Array.from({ length: 65 }, (_, seq) => ({
    seq, who: seq === 64 ? 'Writer' : 'User', text: `Line ${seq}`,
    time: seq, ...(seq === 64 ? { botId: 'b1', kind: 'event' } : {}),
    runtimeSession: 'private-thread',
  }))
  const call = channel(t, {
    room: { id: 'r1', log, workDir: 'private-folder', runtimeSessions: { b1: 'private-thread' }, seen: {} },
    readOnly: 'Another Host owns the team',
  })
  const result = await call({ roomId: 'r1' })
  assert.equal(result.ok, true)
  assert.deepEqual(Object.keys(result.value), ['roomId', 'entries', 'hasMore'])
  assert.equal(result.value.roomId, 'r1')
  assert.equal(result.value.hasMore, false)
  assert.equal(result.value.entries.length, 60)
  assert.deepEqual(result.value.entries[0], { seq: 5, who: 'User', text: 'Line 5', length: 6, time: 5 })
  assert.deepEqual(result.value.entries.at(-1), { seq: 64, who: 'Writer', text: 'Line 64', length: 7, botId: 'b1', time: 64, kind: 'event' })
  assert.equal(JSON.stringify(result).includes('private-'), false)
})

test('Remote earlier routes a message chunk through the room-scoped reader and projects true lengths', async t => {
  const room = { id: 'r1', log: [{ seq: 1, who: 'Writer', text: 'prefix', length: 25000 }] }
  const page = { text: 'next chunk', length: 25000, offset: 12000, nextOffset: 12010, complete: true }
  const call = channel(t, { room, readOnly: 'Read only', readGroupLine: async (actual, seq, options) => {
    assert.equal(actual, room)
    assert.equal(seq, 1)
    assert.deepEqual(options, { offset: 12000, limit: undefined })
    return page
  } })
  assert.deepEqual(await call({ roomId: 'r1', seq: 1, offset: 12000 }), { ok: true, value: { roomId: 'r1', seq: 1, ...page } })
  const history = await call({ roomId: 'r1' })
  assert.equal(history.value.entries[0].length, 25000)
})

test('Remote group history refuses an unknown room and does not expose Session history', async t => {
  const call = channel(t, { earlierPage: () => assert.fail('Unexpected Session history read') })
  assert.deepEqual(await call({ roomId: 'missing', sessionId: 'b1' }), {
    ok: false, error: { code: 'bot/not-found', message: 'Unknown group', details: {} },
  })
})

test('Remote history exposes public attachment references without paths or image bytes', async t => {
  const image = { attachmentId: 'sha256:image', mediaType: 'image/png', name: 'look.png', bytes: 67, width: 1, height: 1 }
  const file = { attachmentId: 'sha256:file', name: 'notes.txt', bytes: 12 }
  const call = channel(t, { room: { id: 'r1', log: [{ seq: 1, who: 'User', text: '', images: [{ ...image, hostPath: 'private' }], files: [{ ...file, path: 'private' }] }] } })
  const history = await call({ roomId: 'r1' })
  assert.deepEqual(history.value.entries[0].images, [image])
  assert.deepEqual(history.value.entries[0].files, [file])
})

test('Remote earlier hides old image readings without changing stored logs or ordinary user text', async t => {
  const image = { attachmentId: 'sha256:picture', name: 'look.png' }
  const text = '原文\n[Image "look.png", read by Vision:]\n可灵AI\n[End of image "look.png"]'
  const log = [{ seq: 1, who: 'User', text, images: [image] }, { seq: 2, who: 'User', text }]
  const call = channel(t, { room: { id: 'r1', log } })
  const { value } = await call({ roomId: 'r1' })
  assert.equal(value.entries[0].text, '原文')
  assert.equal(value.entries[0].length, 2)
  assert.equal(value.entries[0].displayText, '原文')
  assert.equal(value.entries[0].displayLength, 2)
  assert.equal(value.entries[1].text, text)
  assert.equal(log[0].text, text)
})

test('earlier without a room keeps its original Session and cursor behavior', async t => {
  const page = { items: [{ kind: 'message', text: 'Earlier part' }], cursor: null, startedAt: 10 }
  const cursor = { part: 1, beforeSeq: 3 }
  const call = channel(t, {
    earlierPage: async (sessionId, actualCursor) => {
      assert.equal(sessionId, 'b2')
      assert.deepEqual(actualCursor, cursor)
      return page
    },
  })
  assert.deepEqual(await call({ sessionId: 'b2', cursor }), { ok: true, value: page })
  assert.deepEqual(await call({ roomId: '', sessionId: 'b2', cursor }), { ok: true, value: page })
})
