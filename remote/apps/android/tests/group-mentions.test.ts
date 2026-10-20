import { describe, expect, it } from 'vitest'
import { insertMention, mentionQuery } from '../src/screens/group-mentions'

describe('group mention completion', () => {
  it('opens for a cursor-local token, not an email or completed mention', () => {
    expect(mentionQuery('@', 1)).toEqual({ start: 0, end: 1, query: '' })
    expect(mentionQuery('问一下 @cla 之后', 8)?.query).toBe('cla')
    expect(mentionQuery('a@example.com', 5)).toBeUndefined()
    expect(mentionQuery('@gpt ', 5)).toBeUndefined()
  })
  it('replaces the pending query and preserves following text', () => {
    expect(insertMention('请 @gp继续', 5, 'gpt')).toEqual({ text: '请 @gpt 继续', cursor: 7 })
    expect(insertMention('之前之后', 2, '大肥鱼', false)).toEqual({ text: '之前 @大肥鱼 之后', cursor: 8 })
    expect(insertMention('问 @Claude 后', 5, 'Claude').text).toBe('问 @Claude 后')
  })
})
