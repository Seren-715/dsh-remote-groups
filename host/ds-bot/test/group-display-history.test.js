// Modified by Seren-715 for DSH Remote Groups (2026-10-20): local Agent group integration, mobile history and attachments. Original work: Fei2411/DeepSeek-Bot, Apache-2.0.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { install } from '../src/host/groups.js'
import { fakeContext } from './fake-ctx.js'

function reader(t, home) {
  const ctx = fakeContext()
  const room = { id: 'r1', seq: 0, log: [] }
  const rt = { ctx, home, roomOf: id => id === room.id ? room : undefined, readOnly: () => undefined, warn: () => {} }
  install(rt)
  t.after(() => ctx.dispose())
  return { rt, room }
}

test('display chunks read full disk text beyond the model context limit after restart', async t => {
  const home = mkdtempSync(join(tmpdir(), 'ds-bot-display-'))
  t.after(() => rmSync(home, { recursive: true, force: true, maxRetries: 5 }))
  const { rt, room } = reader(t, home)
  const text = 'x'.repeat(11999) + '😀' + '尾'.repeat(30000)
  room.log.push(rt.keepGroupLine(room.id, { seq: 1, who: 'Writer', text, time: 123 }, text))
  assert.equal(room.log[0].text.length, 2000)
  assert.equal(readFileSync(join(home, 'group-lines/r1/1.txt'), 'utf8'), text)
  // A fresh runtime has no wholeLines cache.
  const again = reader(t, home)
  again.room.log = structuredClone(room.log)
  let offset = 0
  let displayed = ''
  do {
    const page = await again.rt.readGroupLine(again.room, 1, { offset })
    assert.equal(page.complete, true)
    assert.equal(page.length, text.length)
    assert.ok(page.text.length <= 12000)
    assert.ok(!/[\uD800-\uDBFF]$/.test(page.text))
    assert.ok(!/^[\uDC00-\uDFFF]/.test(page.text))
    displayed += page.text
    offset = page.nextOffset
  } while (offset !== null)
  assert.equal(displayed, text)
  assert.equal(again.room.log[0].time, 123)
})

test('legacy prefix files report incomplete text and missing files retain readable state prefixes', async t => {
  const home = mkdtempSync(join(tmpdir(), 'ds-bot-display-'))
  t.after(() => rmSync(home, { recursive: true, force: true, maxRetries: 5 }))
  const { rt, room } = reader(t, home)
  const text = 'x'.repeat(25000)
  room.log.push(rt.keepGroupLine(room.id, { seq: 1, who: 'Writer', text }, text))
  const path = join(home, 'group-lines/r1/1.txt')
  writeFileSync(path, text.slice(0, 20000))
  const page = await rt.readGroupLine(room, 1, { offset: 12000 })
  assert.deepEqual(page, { text: 'x'.repeat(8000), length: 25000, offset: 12000, nextOffset: null, complete: false })
  rmSync(path)
  const missing = await rt.readGroupLine(room, 1)
  assert.equal(missing.text.length, 2000)
  assert.equal(missing.complete, false)
  assert.equal(missing.nextOffset, null)
})

test('display reads reject foreign rooms, invalid sequences, offsets and split Unicode boundaries', async t => {
  const { rt, room } = reader(t, 'unused-test-home')
  room.log.push({ seq: 1, who: 'User', text: 'A😀B' })
  await assert.rejects(rt.readGroupLine({ ...room }, 1), /Unknown group/)
  for (const seq of [0, -1, 1.5, '1', Infinity]) await assert.rejects(rt.readGroupLine(room, seq), /positive integer/)
  await assert.rejects(rt.readGroupLine(room, 2), /no longer available/)
  for (const offset of [-1, 0.5, '1', Infinity, 5]) await assert.rejects(rt.readGroupLine(room, 1, { offset }), /offset/)
  await assert.rejects(rt.readGroupLine(room, 1, { offset: 2 }), /Unicode/)
  for (const limit of [0, 12001, 0.5, '100']) await assert.rejects(rt.readGroupLine(room, 1, { limit }), /limit/)
  await assert.rejects(rt.readGroupLine(room, 1, { offset: 1, limit: 1 }), /Unicode/)
  assert.deepEqual(await rt.readGroupLine(room, 1, { offset: 4 }), { text: '', length: 4, offset: 4, nextOffset: null, complete: true })
})

test('image display chunks retain full user text while model logs keep their OCR reading', async t => {
  const home = mkdtempSync(join(tmpdir(), 'ds-bot-display-'))
  t.after(() => rmSync(home, { recursive: true, force: true, maxRetries: 5 }))
  const { rt, room } = reader(t, home)
  const original = '原文'.repeat(7000)
  const reading = '[Image "look.png", read by Vision:]\n可灵AI\n[End of image "look.png"]'
  const full = `${original}\n${reading}`
  const images = [{ attachmentId: 'sha256:picture', name: 'look.png' }]
  room.log.push(rt.keepGroupLine(room.id, { seq: 1, who: 'User', text: full, images, displayText: original.slice(0, 2000), displayLength: original.length }, full))
  const first = await rt.readGroupLine(room, 1)
  const second = await rt.readGroupLine(room, 1, { offset: first.nextOffset })
  assert.equal(first.text + second.text, original)
  assert.equal(first.length, original.length)
  assert.equal(second.nextOffset, null)
  assert.equal(second.complete, true)
  assert.equal(readFileSync(join(home, 'group-lines/r1/1.txt'), 'utf8'), full)
  room.log.push({ seq: 2, who: 'User', text: `检查\n${reading}`, images })
  assert.deepEqual(await rt.readGroupLine(room, 2), { text: '检查', length: 2, offset: 0, nextOffset: null, complete: true })
})
