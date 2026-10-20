import type { GroupAttachment } from '../screens/group-types'
import { throwIfAborted } from './abort-signal'

interface Chunk { attachmentId: string; data: string; offset: number; nextOffset: number | null; bytes: number; mediaType: string; name: string }

export async function readGroupAttachment(read: (payload: Record<string, unknown>, signal?: AbortSignal) => Promise<Chunk>, roomId: string, seq: number, ref: GroupAttachment, signal?: AbortSignal, progress?: (received: number) => void): Promise<Uint8Array> {
  if (!Number.isSafeInteger(ref.bytes) || ref.bytes < 0 || ref.bytes > 20 * 1024 * 1024) throw new Error('Unsupported attachment size')
  const result = new Uint8Array(ref.bytes)
  let offset = 0
  do {
    throwIfAborted(signal)
    const page = await read({ roomId, seq, attachmentId: ref.attachmentId, offset, limit: 65536 }, signal)
    throwIfAborted(signal)
    if (page.attachmentId !== ref.attachmentId || page.offset !== offset || page.bytes !== ref.bytes || typeof page.data !== 'string' || page.data.length > 87384) throw new Error('Invalid attachment response')
    const binary = atob(page.data)
    if (btoa(binary) !== page.data || binary.length > 65536 || offset + binary.length > ref.bytes) throw new Error('Invalid attachment bytes')
    const end = offset + binary.length
    if (page.nextOffset !== (end < ref.bytes ? end : null) || (end === offset && end < ref.bytes)) throw new Error('Invalid attachment range')
    for (let i = 0; i < binary.length; i++) result[offset + i] = binary.charCodeAt(i)
    offset = end
    progress?.(offset)
  } while (offset < ref.bytes)
  return result
}
