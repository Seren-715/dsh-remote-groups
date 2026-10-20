import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { Bot, Code2, Sparkles, Terminal, User } from 'lucide-react-native'
import { NativeMarkdown } from '../ui/markdown'
import { useTheme } from '../ui/theme-context'
import { lookOf } from '../vendor/ds-bot/characters.js'
import { GroupCharacter } from './group-avatar-native'
import { foldPreview, groupTimeLabel, groupVisibleText, stripLongNote } from './group-display-text'
import type { GroupBot, GroupEntry } from './group-types'
import { GroupAttachmentView } from './group-attachment-view'

/** Uses the same generated character paths, colors and ID fallback as desktop. */
export const GroupAvatar = memo(function GroupAvatar({ bot, size = 36, user = false, onLongPress }: { bot?: GroupBot; size?: number; user?: boolean; onLongPress?: () => void }) {
  const { colors, scheme } = useTheme()
  const look = lookOf(bot)
  // Host uploaded avatars are bounded image data, never arbitrary external URLs.
  const photo = typeof look.image === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/i.test(look.image) ? look.image : undefined
  return <Pressable disabled={!onLongPress} onLongPress={onLongPress} delayLongPress={350} accessibilityRole={onLongPress ? 'button' : undefined} accessibilityLabel={onLongPress ? `@${bot?.name}` : user ? 'User' : bot?.name ?? 'Agent'} style={{ width: size, height: size, flexShrink: 0, borderRadius: Math.max(8, size * .23), backgroundColor: colors.surfaceStrong, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
    {user ? <User size={size * .55} color={colors.muted} /> : photo
      ? <Image source={{ uri: photo }} style={{ width: size, height: size }} resizeMode="cover" />
      : <GroupCharacter bot={bot} size={size * .93} dark={scheme === 'dark'} />}
  </Pressable>
})

// The desktop clusterSeats geometry: diagonal pair, triangle, then four seats.
function clusterSeats(count: number, frame: number): [number, number, number][] {
  if (count === 1) return [[0, 0, frame]]
  if (count === 2) return [[0, 0, frame * 2 / 3], [frame / 3, frame / 3, frame * 2 / 3]]
  if (count === 3) {
    const size = frame * 5 / 9
    const rest = frame - size
    return [[rest / 2, 0, size], [0, rest, size], [rest, rest, size]]
  }
  const half = frame / 2
  return [[0, 0, half], [half, 0, half], [0, half, half], [half, half, half]]
}

export const RoomAvatar = memo(function RoomAvatar({ bots, size = 44 }: { bots: GroupBot[]; size?: number }) {
  const { colors } = useTheme()
  if (bots.length === 0) return <GroupAvatar size={size} />
  const people: (GroupBot | undefined)[] = bots.length === 1 ? [bots[0], undefined] : bots
  const seats = clusterSeats(Math.min(people.length, 4), size)
  return <View accessibilityLabel={bots.map(bot => bot.name).join(', ')} style={{ width: size, height: size, flexShrink: 0 }}>
    {seats.map(([left, top, frame], index) => <View key={people[index]?.id ?? index} style={{ position: 'absolute', left, top, width: frame, height: frame, borderRadius: 7, borderWidth: 1.5, borderColor: colors.background }}>
      {people.length > 4 && index === 3
        ? <View style={{ flex: 1, borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong }}><Text style={{ fontSize: Math.max(8, frame * .36), color: colors.muted }}>+{people.length - 3}</Text></View>
        : <GroupAvatar bot={people[index]} user={people[index] === undefined} size={Math.max(1, frame - 3)} />}
    </View>)}
  </View>
})

export function GroupRuntimeIcon({ runtime, size = 11 }: { runtime?: unknown; size?: number }) {
  const { colors } = useTheme()
  const Icon = runtime === 'codex' || runtime === 'opencode' ? Code2 : runtime === 'claude' ? Sparkles : runtime === 'hermes' ? Terminal : Bot
  return <Icon size={size} color={colors.subtle} />
}

export const GroupMessage = memo(function GroupMessage({ entry, bot, zh, roomId, onToggleExpand, loadWhole, onMention }: { entry: GroupEntry; bot?: GroupBot; zh: boolean; roomId?: string; onToggleExpand?: () => void; loadWhole?: (signal: AbortSignal) => Promise<{ text: string; whole: boolean }>; onMention?: (name: string) => void }) {
  const { colors, scheme } = useTheme()
  const user = entry.who === 'User'
  const [expanded, setExpanded] = useState(false)
  const [read, setRead] = useState<{ text: string; whole: boolean }>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | undefined>(undefined)
  useEffect(() => () => controller.current?.abort(), [])
  const text = stripLongNote(groupVisibleText(entry))
  const contentLength = entry.displayLength ?? (entry.images?.length && text !== stripLongNote(entry.text) ? text.length : entry.length ?? text.length)
  const cut = contentLength > text.length
  const preview = useMemo(() => foldPreview(text, cut ? { chars: -1, lines: 0 } : undefined), [text, cut])
  const shown = expanded || preview === null ? read ? stripLongNote(groupVisibleText(entry, read.text)) : text : preview
  const time = groupTimeLabel(entry.time, zh) || (zh ? '时间未记录' : 'Time not recorded')
  const toggle = async () => {
    if (loading) return
    onToggleExpand?.()
    if (expanded && !error) { setExpanded(false); return }
    setExpanded(true)
    if (!cut || read || !loadWhole) return
    const pending = new AbortController()
    controller.current = pending
    setLoading(true); setError('')
    try {
      const result = await loadWhole(pending.signal)
      if (!pending.signal.aborted) setRead(result)
    } catch (cause) {
      if (!pending.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (!pending.signal.aborted) setLoading(false)
    }
  }
  const name = user ? zh ? '我' : 'You' : bot?.name ?? entry.who
  const event = entry.kind !== undefined
  const eventLabels: Record<string, string> = zh
    ? { done: '工作已完成', stopped: '已停止', resumed: '继续工作', cut: '上下文已续接', lookup: '查看历史', failed: '工作失败', missed: '未及时回复' }
    : { done: 'Work completed', stopped: 'Stopped', resumed: 'Resumed', cut: 'Context continued', lookup: 'Read history', failed: 'Work failed', missed: 'No timely reply' }
  if (event) return <View style={styles.event}><Text selectable style={[styles.eventText, { color: entry.kind === 'failed' ? colors.danger : colors.subtle }]}>{time} · {name} · {eventLabels[entry.kind!] ?? entry.kind}{shown ? ` · ${shown}` : ''}</Text>{preview !== null && <Pressable accessibilityRole="button" onPress={() => { void toggle() }}><Text style={{ color: colors.primary, fontSize: 12 }}>{expanded ? zh ? '收起' : 'Show less' : zh ? '展开' : 'Show all'}</Text></Pressable>}</View>
  return <View style={styles.message}>
    {time !== '' && <Text style={[styles.time, { color: colors.subtle }]}>{time}</Text>}
    <View style={[styles.row, user && styles.userRow]}>
      <GroupAvatar bot={bot} user={user} size={34} onLongPress={!user && bot && onMention ? () => onMention(bot.name) : undefined} />
      <View style={[styles.messageColumn, user && styles.userColumn]}>
        <View style={[styles.nameLine, user && styles.userNameLine]}>
          {!user && <GroupRuntimeIcon runtime={bot?.runtime} />}
          <Text numberOfLines={1} style={[styles.name, { color: colors.muted }]}>{name}</Text>
          {!user && bot?.role && <Text numberOfLines={1} style={[styles.role, { color: colors.subtle }]}>{bot.role}</Text>}
        </View>
        <View style={[styles.bubble, { backgroundColor: user ? colors.primarySoft : scheme === 'dark' ? colors.surfaceStrong : colors.surface, borderColor: user ? 'transparent' : colors.separator }]}>
          <NativeMarkdown text={shown} />
          {roomId && entry.images?.map(ref => <GroupAttachmentView key={ref.attachmentId} roomId={roomId} seq={entry.seq} attachment={ref} image zh={zh} />)}
          {roomId && entry.files?.map(ref => <GroupAttachmentView key={ref.attachmentId} roomId={roomId} seq={entry.seq} attachment={ref} zh={zh} />)}
          {loading && <Text style={[styles.expandText, { color: colors.muted }]}>{zh ? '正在加载全文…' : 'Loading whole message…'}</Text>}
          {error !== '' && <Text style={[styles.expandText, { color: colors.danger }]}>{error}</Text>}
          {expanded && cut && read && !read.whole && <Text style={[styles.expandText, { color: colors.muted }]}>{zh ? `旧记录仅保存了前 ${read.text.length.toLocaleString()} 字符` : `Only the first ${read.text.length.toLocaleString()} characters were kept`}</Text>}
          {preview !== null && <Pressable disabled={loading} accessibilityRole="button" accessibilityState={{ expanded, disabled: loading }} hitSlop={8} style={styles.expand} onPress={() => { void toggle() }}>
            <Text style={[styles.expandText, { color: colors.primary }]}>{error ? zh ? '重试加载全文' : 'Retry loading' : expanded ? zh ? '收起' : 'Show less' : zh ? `展开全文 · ${contentLength.toLocaleString()} 字符` : `Show all · ${contentLength.toLocaleString()} characters`}</Text>
          </Pressable>}
        </View>
      </View>
    </View>
  </View>
})

const styles = StyleSheet.create({
  message: { paddingHorizontal: 16, paddingBottom: 17 },
  time: { textAlign: 'center', fontSize: 11, lineHeight: 17, marginTop: 2, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  userRow: { flexDirection: 'row-reverse' },
  messageColumn: { flexShrink: 1, maxWidth: '80%', alignItems: 'flex-start' },
  userColumn: { alignItems: 'flex-end' },
  nameLine: { flexDirection: 'row', gap: 4, alignItems: 'center', marginBottom: 5, maxWidth: '100%' },
  userNameLine: { justifyContent: 'flex-end' },
  name: { fontSize: 12, lineHeight: 16, flexShrink: 1 },
  role: { fontSize: 10, lineHeight: 15, flexShrink: 1, marginLeft: 2 },
  bubble: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 6, maxWidth: '100%', minWidth: 28 },
  expand: { paddingTop: 8, paddingBottom: 4 },
  expandText: { fontSize: 12, lineHeight: 18, fontWeight: '500' },
  event: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 10, gap: 5 },
  eventText: { fontSize: 11, lineHeight: 17, textAlign: 'center' },
})
