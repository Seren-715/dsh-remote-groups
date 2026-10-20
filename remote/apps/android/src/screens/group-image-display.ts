// Derived from Fei2411/DeepSeek-Bot, Apache-2.0; modified by Seren-715 (2026-10-20) for native mobile compatibility. See ../vendor/ds-bot/LICENSE and NOTICE.
import type { GroupEntry } from './group-types'

/** Apache-2.0 DS Bot group-display adaptation, modified by Seren-715 (2026-10-20) for older mobile Hosts. */
export function groupVisibleText(entry: GroupEntry, source = entry.text): string {
  if (entry.displayText !== undefined) return source === entry.text ? entry.displayText : source
  if (!entry.images?.length) return source
  let text = source
  for (const image of entry.images) {
    const label = image.name ? `"${image.name}"` : `sha256:${image.attachmentId.slice(7, 15)}`
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    text = text.replace(new RegExp(`(?:^|\\n)\\[Image ${escaped}, read by [^\\r\\n]+:\\]\\r?\\n[\\s\\S]*?\\r?\\n\\[End of image ${escaped}\\](?=\\r?\\n|$)`, 'g'), '')
      .replace(new RegExp(`(?:^|\\n)\\[Image ${escaped}: it could not be read right now\\. Ask the user what it shows if it matters\\.\\](?=\\r?\\n|$)`, 'g'), '')
    if ((entry.length ?? 0) > source.length) text = text.replace(new RegExp(`(?:^|\\n)\\[Image ${escaped}, read by [^\\r\\n]+:\\]\\r?\\n[\\s\\S]*$`), '')
  }
  return text
}
