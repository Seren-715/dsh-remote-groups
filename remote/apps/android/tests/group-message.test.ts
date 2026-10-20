import { describe, expect, it } from 'vitest'
import { readGroupMessage } from '../src/services/group-message'

describe('whole group message loading', () => {
  it('expands beyond the persisted preview over bounded replies', async () => {
    const text = '文字'.repeat(18000) + 'FULL-MESSAGE-END'
    const offsets: number[] = []
    const result = await readGroupMessage(async payload => {
      const offset = Number(payload.offset)
      offsets.push(offset)
      const chunk = text.slice(offset, offset + 12000)
      return { roomId: 'room-1', seq: 2, text: chunk, offset, length: text.length, nextOffset: offset + chunk.length < text.length ? offset + chunk.length : null, complete: true }
    }, 'room-1', 2)
    expect(offsets).toEqual([0, 12000, 24000, 36000])
    expect(result).toEqual({ text, whole: true })
  })

  it('reports old partial records and rejects another entry or non-progressing chunks', async () => {
    const chunk = { roomId: 'room-1', seq: 2, text: 'old prefix', offset: 0, length: 30000, nextOffset: null, complete: false }
    expect(await readGroupMessage(async () => chunk, 'room-1', 2)).toEqual({ text: 'old prefix', whole: false })
    await expect(readGroupMessage(async () => ({ ...chunk, roomId: 'other' }), 'room-1', 2)).rejects.toThrow('Invalid')
    await expect(readGroupMessage(async () => ({ ...chunk, nextOffset: 0 }), 'room-1', 2)).rejects.toThrow('Invalid')
  })

  it('stops before another page when the view is cancelled', async () => {
    const controller = new AbortController()
    let requests = 0
    await expect(readGroupMessage(async () => {
      requests++
      controller.abort()
      return { roomId: 'room-1', seq: 2, text: 'page', offset: 0, length: 8, nextOffset: 4, complete: true }
    }, 'room-1', 2, controller.signal)).rejects.toThrow('cancelled')
    expect(requests).toBe(1)
  })
})
