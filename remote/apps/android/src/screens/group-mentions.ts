export interface MentionQuery { start: number; end: number; query: string }

/** Complete only the @ token at the cursor, without replacing text elsewhere. */
export function mentionQuery(text: string, cursor: number): MentionQuery | undefined {
  const end = Math.max(0, Math.min(cursor, text.length))
  const before = text.slice(0, end)
  const match = /(?:^|\s)@([^\s@]*)$/.exec(before)
  if (!match) return undefined
  return { start: end - match[1]!.length - 1, end, query: match[1]! }
}

export function insertMention(text: string, cursor: number, name: string, complete = true): { text: string; cursor: number } {
  const position = Math.max(0, Math.min(cursor, text.length))
  const query = complete ? mentionQuery(text, position) : undefined
  const start = query?.start ?? position
  let end = query?.end ?? position
  if (query && name.toLocaleLowerCase().startsWith(query.query.toLocaleLowerCase())) {
    const remainder = name.slice(query.query.length)
    const tail = text.slice(end)
    if (remainder && tail.toLocaleLowerCase().startsWith(remainder.toLocaleLowerCase()) && /^(?:\s|$)/.test(tail.slice(remainder.length))) end += remainder.length
  }
  if (query && text[end] === ' ') end++
  const prefix = text.slice(0, start)
  const token = `${prefix && !/\s$/.test(prefix) ? ' ' : ''}@${name} `
  return { text: prefix + token + text.slice(end), cursor: prefix.length + token.length }
}
