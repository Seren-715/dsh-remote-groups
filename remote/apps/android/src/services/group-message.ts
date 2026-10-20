interface Chunk { roomId: string; seq: number; text: string; length: number; offset: number; nextOffset: number | null; complete: boolean }

/** Expand one persisted room entry over bounded Remote replies. */
export async function readGroupMessage(
  read: (payload: Record<string, unknown>, signal?: AbortSignal) => Promise<Chunk>,
  roomId: string, seq: number, signal?: AbortSignal,
): Promise<{ text: string; whole: boolean }> {
  let offset = 0
  const chunks: string[] = []
  let length: number | undefined
  for (;;) {
    if (signal?.aborted) throw new Error('Message loading cancelled')
    const page = await read({ roomId, seq, offset }, signal)
    if (signal?.aborted) throw new Error('Message loading cancelled')
    if (page.roomId !== roomId || page.seq !== seq || page.offset !== offset || typeof page.text !== 'string'
      || !Number.isSafeInteger(page.length) || page.length < 0 || (length !== undefined && length !== page.length)
      || offset + page.text.length > page.length || typeof page.complete !== 'boolean'
      || (page.nextOffset !== null && (page.nextOffset !== offset + page.text.length || page.nextOffset <= offset))) {
      throw new Error('Invalid whole-message response. Update the group plugin on your computer.')
    }
    chunks.push(page.text)
    length = page.length
    if (page.nextOffset === null) return { text: chunks.join(''), whole: page.complete && offset + page.text.length === length }
    offset = page.nextOffset
  }
}
