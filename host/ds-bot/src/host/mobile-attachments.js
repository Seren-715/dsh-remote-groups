// Modified by Seren-715 for DSH Remote Groups (2026-10-20): local Agent group integration, mobile history and attachments. Original work: Fei2411/DeepSeek-Bot, Apache-2.0.
import { Buffer } from 'node:buffer'
import { lstat, open, realpath } from 'node:fs/promises'
import { basename, join, relative } from 'node:path'

const MAX_BYTES = 20 * 1024 * 1024
const CHUNK_BYTES = 64 * 1024
const invalid = message => Object.assign(new Error(message), { code: 'bot/invalid' })

// Workspace uploads return a leaf relative to the official Session working folder.
// The caller never supplies an absolute path or a durable attachment reference.
export async function importMobileFiles(rt, sessionId, uploads, signal) {
  if (!Array.isArray(uploads) || uploads.length > 20) throw invalid('Invalid uploaded files')
  if (uploads.length === 0) return []
  const attachments = rt.ctx.get?.('attachments')
  if (!attachments) throw invalid('File uploads are unavailable')
  const agent = await rt.resolveAgent(sessionId)
  const folder = rt.sessionFolder(agent.session)
  if (typeof folder !== 'string' || folder === '') throw invalid('The session workspace is unavailable')
  const root = await realpath(folder)
  const content = []
  for (const upload of uploads) {
    signal?.throwIfAborted()
    if (!upload || typeof upload.name !== 'string' || upload.name === '' || upload.name === '.' || upload.name === '..'
      || /[\\/<>:"|?*]/.test(upload.name) || [...upload.name].some(char => char.charCodeAt(0) < 32) || upload.path !== `./${upload.name}`
      || !Number.isSafeInteger(upload.bytes) || upload.bytes < 0 || upload.bytes > MAX_BYTES
      || (upload.originalName !== undefined && (typeof upload.originalName !== 'string' || upload.originalName.length === 0 || upload.originalName.length > 1024))
      || !['image', 'file'].includes(upload.kind)) throw invalid('Invalid uploaded file receipt')
    const name = upload.originalName ?? upload.name
    const candidate = join(root, upload.name)
    const before = await lstat(candidate)
    const target = await realpath(candidate)
    if (before.isSymbolicLink() || !before.isFile() || before.size !== upload.bytes
      || relative(root, target) !== basename(target) || await realpath(folder) !== root) throw invalid('Uploaded file is outside the session workspace or has changed')
    const handle = await open(target, 'r')
    try {
      const current = await handle.stat()
      if (!current.isFile() || current.size !== upload.bytes || current.dev !== before.dev || current.ino !== before.ino) throw invalid('Uploaded file has changed')
      if (upload.kind === 'image') {
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(upload.mediaType)) throw invalid('Invalid image upload')
        const data = await handle.readFile({ signal })
        if (data.length !== upload.bytes) throw invalid('Uploaded file has changed')
        content.push({ type: 'image', data: data.toString('base64'), mediaType: upload.mediaType, name })
      } else {
        const fileUploads = rt.ctx.get?.('fileUploads')
        if (typeof fileUploads?.uploadStream !== 'function') throw invalid('Staged file uploads are unavailable')
        const data = handle.createReadStream({ autoClose: false, signal })
        const staged = await fileUploads.uploadStream({ sessionId, data, signal, name })
        if (staged.file.bytes !== upload.bytes) throw invalid('Uploaded file has changed')
        content.push({ type: 'file', receiptId: staged.receiptId })
      }
    } finally { await handle.close() }
  }
  return content
}

export async function readMobileAttachment(ctx, room, body, signal) {
  if (!Number.isSafeInteger(body.seq) || typeof body.attachmentId !== 'string') throw invalid('Invalid group attachment')
  const line = (room.log ?? []).find(item => item.seq === body.seq)
  const image = line?.images?.find(ref => ref.attachmentId === body.attachmentId)
  const ref = image ?? line?.files?.find(file => file.attachmentId === body.attachmentId)
  if (!ref) throw invalid('Attachment is not part of this group message')
  const offset = body.offset ?? 0
  const limit = body.limit ?? CHUNK_BYTES
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > ref.bytes
    || !Number.isSafeInteger(limit) || limit < 1 || limit > CHUNK_BYTES) throw invalid('Invalid attachment range')
  const attachments = ctx.get?.('attachments')
  if (!attachments) throw invalid('Attachment downloads are unavailable')
  const end = Math.min(ref.bytes, offset + limit)
  let data
  if (image) {
    const stored = await attachments.readImage(ref, signal)
    data = Buffer.from(stored.data).subarray(offset, end)
  } else {
    const chunks = []
    let position = 0
    for await (const chunk of attachments.readFileStream(ref, signal)) {
      const next = position + chunk.length
      if (next > offset && position < end) chunks.push(Buffer.from(chunk).subarray(Math.max(0, offset - position), Math.min(chunk.length, end - position)))
      position = next
    }
    if (position !== ref.bytes) throw invalid('Stored attachment has changed')
    data = Buffer.concat(chunks)
  }
  return { attachmentId: ref.attachmentId, data: data.toString('base64'), offset, nextOffset: end < ref.bytes ? end : null,
    bytes: ref.bytes, mediaType: image?.mediaType ?? 'application/octet-stream', name: ref.name ?? 'image' }
}
