// Modified by Seren-715 for DSH Remote Groups (2026-10-20): local Agent group integration, mobile history and attachments. Original work: Fei2411/DeepSeek-Bot, Apache-2.0.
import assert from 'node:assert/strict'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { importMobileFiles, readMobileAttachment } from '../src/host/mobile-attachments.js'
import { install } from '../src/host/channel.js'
import { fakeAttachments, fakeContext } from './fake-ctx.js'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'ds-bot-mobile-files-'))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5 }))
  const attachments = fakeAttachments()
  attachments.saveFileStream = async ({ data, name }) => {
    const chunks = []
    for await (const chunk of data) chunks.push(chunk)
    return attachments.saveFile({ data: Buffer.concat(chunks), name })
  }
  const staged = new Map()
  const fileUploads = { uploadStream: async ({ data, name }) => {
    const file = await attachments.saveFileStream({ data, name })
    const receiptId = `receipt-${staged.size}`
    staged.set(receiptId, file)
    return { receiptId, file }
  } }
  const rt = { ctx: { get: name => name === 'fileUploads' ? fileUploads : attachments }, resolveAgent: async id => ({ session: { id } }), sessionFolder: () => root }
  return { root, attachments, rt, staged, fileUploads }
}

test('uploaded binary files import byte for byte through the official stream attachment store', async t => {
  const { root, rt, attachments, staged } = await fixture(t)
  const bytes = Buffer.from([0, 255, 17, 128, 0])
  await writeFile(join(root, 'report.bin'), bytes)
  const content = await importMobileFiles(rt, 'room', [{ name: 'report.bin', path: './report.bin', bytes: bytes.length, kind: 'file' }])
  assert.equal(content[0].type, 'file')
  assert.deepEqual(attachments.files.get(staged.get(content[0].receiptId).attachmentId), bytes)
})

test('uploaded images use the official encoded prompt admission contract', async t => {
  const { root, rt } = await fixture(t)
  const bytes = Buffer.from('image bytes validated by prompt admission')
  await writeFile(join(root, 'look.png'), bytes)
  assert.deepEqual(await importMobileFiles(rt, 'room', [{ name: 'look.png', path: './look.png', bytes: bytes.length, mediaType: 'image/png', kind: 'image' }]), [{ type: 'image', data: bytes.toString('base64'), mediaType: 'image/png', name: 'look.png' }])
})

test('upload receipts reject traversal, absolute paths, alternate data streams, stale size and excess bytes', async t => {
  const { root, rt } = await fixture(t)
  await writeFile(join(root, 'notes.txt'), 'ok')
  for (const receipt of [
    { name: '../notes.txt', path: './../notes.txt', bytes: 2, kind: 'file' },
    { name: 'notes.txt', path: join(root, 'notes.txt'), bytes: 2, kind: 'file' },
    { name: 'notes.txt:secret', path: './notes.txt:secret', bytes: 2, kind: 'file' },
    { name: 'notes.txt', path: './notes.txt', bytes: 3, kind: 'file' },
    { name: 'notes.txt', path: './notes.txt', bytes: 20 * 1024 * 1024 + 1, kind: 'file' },
  ]) await assert.rejects(importMobileFiles(rt, 'room', [receipt]))
})

test('upload receipts refuse symlink files even if their target has the expected size', async t => {
  const { root, rt } = await fixture(t)
  await writeFile(join(root, 'target.txt'), 'ok')
  try { await symlink(join(root, 'target.txt'), join(root, 'link.txt')) } catch (error) {
    if (error.code === 'EPERM') { t.skip('Windows user cannot create symlinks'); return }
    throw error
  }
  await assert.rejects(importMobileFiles(rt, 'room', [{ name: 'link.txt', path: './link.txt', bytes: 2, kind: 'file' }]), /outside.*or has changed/)
})

test('attachment downloads are bound to the group message and read all verified bytes in bounded chunks', async t => {
  const { rt, attachments } = await fixture(t)
  const bytes = Buffer.from('文档\0'.repeat(20000))
  const file = await attachments.saveFile({ data: bytes, name: 'notes.txt' })
  const room = { log: [{ seq: 1, files: [file] }] }
  let data = Buffer.alloc(0)
  let offset = 0
  do {
    const page = await readMobileAttachment(rt.ctx, room, { seq: 1, attachmentId: file.attachmentId, offset })
    assert.ok(Buffer.from(page.data, 'base64').length <= 65536)
    assert.equal(page.mediaType, 'application/octet-stream')
    data = Buffer.concat([data, Buffer.from(page.data, 'base64')])
    offset = page.nextOffset
  } while (offset !== null)
  assert.deepEqual(data, bytes)
  for (const body of [{ seq: 2, attachmentId: file.attachmentId }, { seq: 1, attachmentId: 'other' }, { seq: 1, attachmentId: file.attachmentId, limit: 65537 }, { seq: 1, attachmentId: file.attachmentId, offset: -1 }]) {
    await assert.rejects(readMobileAttachment(rt.ctx, room, body))
  }
})

test('stored image downloads use the official image reader and preserve MIME type', async () => {
  const ref = { attachmentId: 'sha256:image', name: 'look.png', bytes: 4, mediaType: 'image/png' }
  const signal = new AbortController().signal
  const ctx = { get: () => ({ readImage: async (actual, actualSignal) => {
    assert.equal(actual, ref)
    assert.equal(actualSignal, signal)
    return { ref, data: Uint8Array.from([1, 2, 3, 4]) }
  } }) }
  assert.deepEqual(await readMobileAttachment(ctx, { log: [{ seq: 1, images: [ref] }] }, { seq: 1, attachmentId: ref.attachmentId, offset: 1, limit: 2 }, signal), {
    attachmentId: ref.attachmentId, data: Buffer.from([2, 3]).toString('base64'), offset: 1, nextOffset: 3, bytes: 4, mediaType: 'image/png', name: 'look.png',
  })
})

test('the public send route imports file-only messages and the history route retrieves their bytes', async t => {
  const { root, rt, attachments, staged, fileUploads } = await fixture(t)
  const ctx = fakeContext({ services: { attachments, fileUploads } })
  t.after(() => ctx.dispose())
  const room = { id: 'room', log: [] }
  let prompted
  let route
  ctx.connection.fetch.register = options => { route = options; return () => {} }
  ctx.sessionController = { prompt: async options => { prompted = options } }
  install({ ...rt, ctx, state: {}, refresh: async () => {}, load: async () => {},
    readOnly: () => undefined, pastOwners: new Map(), chatOwners: new Map(), botOf: () => undefined,
    ensureCapabilities: async () => {}, roomOf: id => id === room.id ? room : undefined,
    noteFailure: error => assert.fail(JSON.stringify(error)),
  })
  const call = async (endpoint, payload) => (await route.fetch(new Request('http://localhost/api/bot', { method: 'POST', body: JSON.stringify({ endpoint, payload }) }))).json()
  await writeFile(join(root, 'notes.txt'), 'mobile upload')
  const receipt = { name: 'notes.txt', path: './notes.txt', bytes: 13, kind: 'file' }
  assert.equal((await call('send', { sessionId: 'room', uploadedFiles: [receipt] })).ok, true)
  assert.equal(prompted.sessionId, 'room')
  assert.equal(prompted.content[0].type, 'file')
  room.log.push({ seq: 1, who: 'User', text: '', files: [staged.get(prompted.content[0].receiptId)] })
  const page = await call('earlier', { roomId: 'room', seq: 1, attachmentId: staged.get(prompted.content[0].receiptId).attachmentId })
  assert.equal(Buffer.from(page.value.data, 'base64').toString(), 'mobile upload')
  assert.equal((await call('send', { sessionId: 'room', uploadedFiles: [{ ...receipt, path: '../notes.txt' }] })).ok, false)
  assert.equal((await call('send', { sessionId: 'room', uploadedFiles: [] })).ok, false)
})
