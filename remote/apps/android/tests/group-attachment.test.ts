import { describe, expect, it } from 'vitest'
import { readGroupAttachment } from '../src/services/group-attachment'
import { createRequire } from 'node:module'

const { AbortController: NativeAbortController } = createRequire(import.meta.url)('abort-controller') as {
  AbortController: new () => { signal: AbortSignal; abort(): void }
}

describe('authenticated group attachment reads', () => {
  it('reads with the native signal and stops if cancelled during a chunk', async () => {
    const controller = new NativeAbortController()
    const page = { attachmentId: 'file', data: 'Bw==', offset: 0, nextOffset: null, bytes: 1, mediaType: '', name: '' }
    expect(await readGroupAttachment(async () => page, 'room', 1, { attachmentId: 'file', bytes: 1 }, controller.signal)).toEqual(new Uint8Array([7]))
    await expect(readGroupAttachment(async () => { controller.abort(); return page }, 'room', 1, { attachmentId: 'file', bytes: 1 }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('reassembles binary data from bounded ranges and rejects another attachment', async () => {
    const data = Uint8Array.from({ length: 150000 }, (_, i) => i % 251)
    const ref = { attachmentId: 'image-1', bytes: data.length }
    const offsets: number[] = []
    const result = await readGroupAttachment(async payload => {
      const offset = Number(payload.offset)
      offsets.push(offset)
      const slice = data.slice(offset, offset + 65536)
      return { attachmentId: ref.attachmentId, data: Buffer.from(slice).toString('base64'), offset, nextOffset: offset + slice.length < data.length ? offset + slice.length : null, bytes: data.length, mediaType: 'image/png', name: 'test.png' }
    }, 'room', 1, ref)
    expect(result).toEqual(data)
    expect(offsets).toEqual([0, 65536, 131072])
    await expect(readGroupAttachment(async () => ({ attachmentId: 'other', data: '', offset: 0, nextOffset: null, bytes: 0, mediaType: '', name: '' }), 'room', 1, { ...ref, bytes: 0 })).rejects.toThrow('Invalid')
  })
  it('rejects non-progressing chunks and stops cancelled downloads', async () => {
    const page = { attachmentId: 'file', data: '', offset: 0, nextOffset: 0, bytes: 1, mediaType: '', name: '' }
    await expect(readGroupAttachment(async () => page, 'room', 1, { attachmentId: 'file', bytes: 1 })).rejects.toThrow('range')
    const signal = new AbortController(); signal.abort()
    await expect(readGroupAttachment(async () => page, 'room', 1, { attachmentId: 'file', bytes: 1 }, signal.signal)).rejects.toThrow()
  })
})
