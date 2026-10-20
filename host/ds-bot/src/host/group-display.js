// Modified by Seren-715 for DSH Remote Groups (2026-10-20): keep image readings in model context, outside user-visible group text. Apache-2.0.
import { escapeRegExp } from './text.js'

// Legacy logs mixed the user's words with generated image readings. Only the
// reserved blocks for attachments actually on this line may be hidden.
export function groupDisplayText(line, text = line.text ?? '') {
  if (typeof line.displayText === 'string') return text.slice(0, line.displayLength ?? line.displayText.length)
  if (!line.images?.length) return text
  const truncated = line.length > text.length
  for (const image of line.images) {
    const label = image.name ? `"${image.name}"` : `sha256:${String(image.attachmentId).slice('sha256:'.length, 'sha256:'.length + 8)}`
    const escaped = escapeRegExp(label)
    const reading = new RegExp(`(?:^|\\n)\\[Image ${escaped}, read by [^\\r\\n]+:\\]\\r?\\n[\\s\\S]*?\\r?\\n\\[End of image ${escaped}\\](?=\\r?\\n|$)`, 'g')
    const unavailable = new RegExp(`(?:^|\\n)\\[Image ${escaped}: it could not be read right now\\. Ask the user what it shows if it matters\\.\\](?=\\r?\\n|$)`, 'g')
    text = text.replace(reading, '').replace(unavailable, '')
    if (truncated) text = text.replace(new RegExp(`(?:^|\\n)\\[Image ${escaped}, read by [^\\r\\n]+:\\]\\r?\\n[\\s\\S]*$`), '')
  }
  return text
}
