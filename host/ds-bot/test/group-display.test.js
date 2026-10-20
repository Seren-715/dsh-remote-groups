// Modified by Seren-715 for DSH Remote Groups (2026-10-20): regression coverage for private image readings. Apache-2.0.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { groupDisplayText } from '../src/host/group-display.js'

const image = { attachmentId: 'sha256:123456789abc', name: 'screen[1].png' }
const reading = '[Image "screen[1].png", read by Vision Model:]\nOCR: 可灵AI\n[End of image "screen[1].png"]'

test('legacy image readings are hidden only for matching image references', () => {
  const text = `请检查\n${reading}`
  assert.equal(groupDisplayText({ text, images: [image] }), '请检查')
  assert.equal(groupDisplayText({ text }), text)
  assert.equal(groupDisplayText({ text, images: [] }), text)
  assert.equal(groupDisplayText({ text, images: [{ ...image, name: 'other.png' }] }), text)
  const unfinished = '请检查\n[Image "screen[1].png", read by Vision Model:]\nMy own example'
  assert.equal(groupDisplayText({ text: unfinished, images: [image] }), unfinished)
  assert.equal(groupDisplayText({ text: unfinished, length: unfinished.length + 2000, images: [image] }), '请检查')
})

test('legacy multiple images and unavailable readings keep adjacent user text and files', () => {
  const fallback = '[Image sha256:12345678: it could not be read right now. Ask the user what it shows if it matters.]'
  const file = '[File "notes.txt" (10 bytes) attached]'
  assert.equal(groupDisplayText({ text: `前\n${reading}\n${fallback}\n${file}`, images: [image, { attachmentId: image.attachmentId }] }), `前\n${file}`)
  assert.equal(groupDisplayText({ text: reading, images: [image] }), '')
})

test('new explicit display text preserves even user-authored reserved-looking text', () => {
  const original = `  原文\n${reading}\n`
  const text = `${original}\n${reading}`
  assert.equal(groupDisplayText({ text, images: [image], displayText: original, displayLength: original.length }), original)
  assert.equal(groupDisplayText({ text: reading, images: [image], displayText: '', displayLength: 0 }), '')
})
