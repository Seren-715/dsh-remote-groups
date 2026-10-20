import { beforeEach, describe, expect, it, vi } from 'vitest'
const disk = vi.hoisted(() => new Map<string, string>())
vi.mock('expo-file-system', () => ({
  Paths: { document: 'private-documents' },
  File: class {
    key: string
    constructor(...parts: string[]) { this.key = parts.join('/') }
    get exists() { return disk.has(this.key) }
    create() { disk.set(this.key, '') }
    textSync() { return disk.get(this.key) }
    write(text: string) { disk.set(this.key, text) }
  },
}))
import { decodeGroupDrafts, groupDraftKey, loadGroupDrafts, saveGroupDrafts } from '../src/services/group-drafts'

describe('persisted group drafts', () => {
  beforeEach(() => disk.clear())
  it('restores text after a new read and deletes only a sent room draft', () => {
    const first = groupDraftKey('https://relay.example/', 'account', 'host', 'room1')
    const second = groupDraftKey('https://relay.example', 'account', 'host', 'room2')
    saveGroupDrafts({ [first]: '@gpt 尚未发送', [second]: '另一群' })
    expect(loadGroupDrafts()).toEqual({ [first]: '@gpt 尚未发送', [second]: '另一群' })
    saveGroupDrafts({ ...loadGroupDrafts(), [first]: '' })
    expect(loadGroupDrafts()).toEqual({ [second]: '另一群' })
  })
  it('isolates server, account and host, and ignores malformed stored values', () => {
    expect(new Set(['a', 'b'].flatMap(server => ['u', 'v'].flatMap(account => ['h', 'k'].map(host => groupDraftKey(server, account, host, 'room'))))).size).toBe(8)
    expect(decodeGroupDrafts('{broken')).toEqual({})
    expect(decodeGroupDrafts('["not a map"]')).toEqual({})
    expect(decodeGroupDrafts('{"valid":"text","invalid":42}')).toEqual({ valid: 'text' })
  })
})
