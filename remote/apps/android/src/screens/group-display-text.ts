export { foldPreview, stripLongNote } from '../vendor/ds-bot/fold.js'
export { groupVisibleText } from './group-image-display'

/** Matches the desktop Today / Yesterday / date + time labels. */
export function groupTimeLabel(value: number | string | undefined, zh: boolean, now = Date.now()): string {
  if (value === undefined || value === '') return ''
  const numeric = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  const date = new Date(numeric)
  if (!Number.isFinite(date.getTime())) return ''
  const current = new Date(now)
  const midnight = (item: Date) => new Date(item.getFullYear(), item.getMonth(), item.getDate()).getTime()
  const days = Math.round((midnight(current) - midnight(date)) / 86400000)
  const locale = zh ? 'zh-CN' : 'en-US'
  const clock = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  if (days === 0) return `${zh ? '今天' : 'Today'} ${clock}`
  if (days === 1) return `${zh ? '昨天' : 'Yesterday'} ${clock}`
  return `${date.toLocaleDateString(locale, { month: 'short', day: 'numeric', ...(date.getFullYear() === current.getFullYear() ? {} : { year: 'numeric' }) })} ${clock}`
}
