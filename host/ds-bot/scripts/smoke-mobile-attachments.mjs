// Modified by Seren-715 for DSH Remote Groups (2026-10-20): local Agent group integration, mobile history and attachments. Original work: Fei2411/DeepSeek-Bot, Apache-2.0.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const home = resolve(process.argv[2] ?? '')
const port = Number(process.argv[3])
if (!/\.dsh-test-mobile-attachments$/.test(home) || !(port > 0)) throw new Error('Use only an isolated .dsh-test-mobile-attachments Host and its port')
const base = `http://127.0.0.1:${port}`
const log = await readFile(join(home, process.env.SMOKE_WEB_LOG ?? 'web.log'), 'utf8')
const loginUrl = log.match(new RegExp(`${base.replaceAll('.', '\\.')}[/]?\\?token=[^\\s]+`))?.[0]
assert.ok(loginUrl, 'Isolated Host login URL was not found')
const login = await fetch(loginUrl, { redirect: 'manual' })
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
assert.ok(cookie)
const api = async (endpoint, payload = {}) => {
  const response = await fetch(`${base}/api/bot`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ endpoint, payload }) })
  return response.json()
}
const state = await api('state')
assert.equal(state.ok, true)
const model = state.value.models.find(item => item.ref.startsWith('deepseek/'))?.ref ?? state.value.models[0]?.ref
assert.ok(model)
const chief = state.value.bots.find(bot => bot.id === state.value.mainBotId)
assert.equal((await api('update-bot', { id: chief.id, model })).ok, true)
const writer = await api('create-bot', { name: `File Reader ${Date.now()}`, role: 'Read attachments', model })
assert.equal(writer.ok, true)
const created = await api('create-room', { members: [chief.id, writer.value.id], name: `Attachment smoke ${Date.now()}`, maxTurns: 1 })
assert.equal(created.ok, true)
const room = created.value
const file = Buffer.from('A mobile document\0with binary bytes\xff', 'latin1')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAO0lEQVR4nO3RQREAMAjEwKPqKqk6UVQJ4cMvK+CYCXVfZ9NZXY8HBvwBMhEyETIRMhEyETIRMhEyUcgHl94B0pSfZIkAAAAASUVORK5CYII=', 'base64')
const workspace = join(home, 'bot', 'workspace')
await writeFile(join(workspace, 'mobile-smoke.bin'), file)
await writeFile(join(workspace, 'mobile-smoke.png'), png)
const sent = await api('send', { sessionId: room.id, text: 'Check these attachments.', uploadedFiles: [
  { name: 'mobile-smoke.bin', path: './mobile-smoke.bin', bytes: file.length, kind: 'file' },
  { name: 'mobile-smoke.png', path: './mobile-smoke.png', bytes: png.length, kind: 'image', mediaType: 'image/png' },
] })
assert.equal(sent.ok, true, sent.error?.message)
let posted
const until = Date.now() + 30_000
while (!posted && Date.now() < until) {
  const history = await api('earlier', { roomId: room.id })
  posted = history.value?.entries.find(line => line.files?.length && line.images?.length)
  if (!posted) await new Promise(resolve => setTimeout(resolve, 200))
}
assert.ok(posted, 'The attachment message did not reach the group log')
assert.equal(posted.files[0].name, 'mobile-smoke.bin')
assert.equal(posted.images[0].mediaType, 'image/png')
const download = await api('earlier', { roomId: room.id, seq: posted.seq, attachmentId: posted.files[0].attachmentId, limit: 8 })
assert.equal(download.ok, true)
assert.deepEqual(Buffer.from(download.value.data, 'base64'), file.subarray(0, 8))
assert.equal(download.value.nextOffset, 8)
const image = await api('earlier', { roomId: room.id, seq: posted.seq, attachmentId: posted.images[0].attachmentId })
assert.equal(image.ok, true)
assert.equal(image.value.mediaType, 'image/png')
assert.ok(Buffer.from(image.value.data, 'base64').length > 0)
assert.equal((await api('earlier', { roomId: room.id, seq: posted.seq + 999, attachmentId: posted.files[0].attachmentId })).ok, false)
assert.equal((await api('send', { sessionId: room.id, uploadedFiles: [{ name: 'mobile-smoke.bin', path: '../mobile-smoke.bin', bytes: file.length, kind: 'file' }] })).ok, false)
const summary = { status: 'passed', checks: ['authenticated real Host send', 'official file/image admission', 'group attachment persistence', 'bounded exact binary download', 'image readback', 'cross-message refusal', 'path traversal refusal'], realModels: false, home, port }
await writeFile(join(home, 'attachment-api-smoke.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary))
