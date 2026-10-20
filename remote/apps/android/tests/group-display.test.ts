import { describe, expect, it } from 'vitest'
import { foldPreview, groupTimeLabel } from '../src/screens/group-display-text'

describe('desktop group message presentation', () => {
  it('keeps the desktop thresholds and bounded preview', () => {
    expect(foldPreview('a'.repeat(1500))).toBeNull()
    expect(foldPreview('a'.repeat(1501))).toHaveLength(600)
    expect(foldPreview(Array.from({ length: 25 }, () => 'line').join('\n'))).toBeNull()
    expect(foldPreview(Array.from({ length: 26 }, () => 'line').join('\n'))?.split('\n')).toHaveLength(10)
  })

  it('preserves Unicode and closes Markdown fences in a folded preview', () => {
    const emoji = `${'a'.repeat(599)}😀${'b'.repeat(1600)}`
    expect(foldPreview(emoji)).toBe('a'.repeat(599))
    const code = '```python\n' + Array.from({ length: 30 }, () => 'print("hello")').join('\n')
    expect(foldPreview(code)?.endsWith('\n```')).toBe(true)
  })

  it('formats persisted timestamps as today, yesterday or a date and ignores absent values', () => {
    const now = new Date(2026, 9, 19, 12).getTime()
    expect(groupTimeLabel(new Date(2026, 9, 19, 9, 30).getTime(), true, now)).toContain('今天')
    expect(groupTimeLabel(new Date(2026, 9, 18, 9, 30).toISOString(), true, now)).toContain('昨天')
    expect(groupTimeLabel(new Date(2025, 9, 18, 9, 30).toISOString(), false, now)).toContain('2025')
    expect(groupTimeLabel(undefined, true, now)).toBe('')
    expect(groupTimeLabel('bad date', true, now)).toBe('')
  })
})
