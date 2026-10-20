import { useEffect, useRef, useState } from 'react'
import { Alert, AppState, BackHandler, FlatList, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import { GroupAttachmentDrafts, groupAttachmentDraft, validateGroupAttachments, type GroupAttachmentDraft } from './group-attachment-drafts'
import { AtSign, Check, ChevronRight, Crown, ImagePlus, MoreHorizontal, Paperclip, Pin, Plus, RefreshCw, Send, Square, X } from 'lucide-react-native'
import { callGroupBot, getGroupConnectionScope, uploadGroupFile, useAppStore } from '../state/store'
import { Button, Field, IconButton, TopBar } from '../ui/components'
import { KeyboardInset } from '../ui/keyboard-inset'
import { useResponsiveLayout } from '../ui/responsive'
import { radius, spacing, type, type ThemeColors } from '../ui/theme'
import { useTheme } from '../ui/theme-context'
import { useThemedStyles } from '../ui/use-themed-styles'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { GroupAvatar, GroupMessage, RoomAvatar } from './group-display'
import { GroupDetails } from './group-details'
import type { GroupEntry, GroupState } from './group-types'
import { readGroupMessage } from '../services/group-message'
import { throwIfAborted } from '../services/abort-signal'
import { groupDraftKey, loadGroupDrafts, saveGroupDrafts } from '../services/group-drafts'
import { insertMention, mentionQuery } from './group-mentions'
import { GroupApprovals } from './group-approvals'

interface History { entries: GroupEntry[]; roomId: string; hasMore: boolean }
interface Progress { callId: string; replies: Array<{ kind?: string; name?: string; botId?: string; text?: string; time?: number; code?: string }> }

/** A separate view over DS Bot's existing rooms; regular Remote sessions stay intact. */
export function GroupsScreen({ onBack }: { onBack: () => void }) {
  const language = useAppStore(state => state.language)
  const zh = language === 'zh-CN'
  const t = (cn: string, en: string) => zh ? cn : en
  const connection = useAppStore(state => state.connection)
  const deviceId = useAppStore(state => state.selectedDevice?.deviceId)
  const draftServer = useAppStore(state => state.config?.baseUrl ?? '')
  const draftAccount = useAppStore(state => state.account ?? state.identity?.deviceId ?? '')
  const scope = getGroupConnectionScope()
  const connected = connection.phase === 'connected'
  const [foreground, setForeground] = useState(AppState.currentState === 'active')
  const [snapshot, setSnapshot] = useState<GroupState>()
  const [roomId, setRoomId] = useState<string>()
  const [entries, setEntries] = useState<GroupEntry[]>([])
  const [roundEvents, setRoundEvents] = useState<GroupEntry[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>(() => { try { return loadGroupDrafts() } catch { return {} } })
  const draftsRef = useRef(drafts)
  const input = useRef<TextInput>(null)
  const [cursor, setCursor] = useState(0)
  const [mentionSelection, setMentionSelection] = useState<{ start: number; end: number }>()
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const initialScroll = useRef(true)
  const lastHistory = useRef<{ room?: string; seq?: number }>({})
  const [creating, setCreating] = useState(false)
  const [groupSearch, setGroupSearch] = useState('')
  const [name, setName] = useState('')
  const [members, setMembers] = useState<string[]>([])
  const [admin, setAdmin] = useState<string>()
  const [mode, setMode] = useState<'admin' | 'everyone'>('admin')
  const [error, setError] = useState('')
  const [pollError, setPollError] = useState('')
  const [busy, setBusy] = useState('')
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [plusOpen, setPlusOpen] = useState(false)
  const [imageDrafts, setImageDrafts] = useState<Record<string, GroupAttachmentDraft[]>>({})
  const [pickingImages, setPickingImages] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const uploadController = useRef<AbortController | undefined>(undefined)
  const pickerScope = `${deviceId}:${scope}:${roomId}`
  const currentPickerScope = useRef(pickerScope)
  currentPickerScope.current = pickerScope
  const images = roomId === undefined ? [] : imageDrafts[roomId] ?? []
  const lifecycle = useRef(0)
  const controllers = useRef(new Set<AbortController>())
  const mutationRunning = useRef(false)
  const list = useRef<FlatList<GroupEntry>>(null)
  const nearBottom = useRef(true)
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { contentMaxWidth, sheetMaxHeight } = useResponsiveLayout()
  const { width: windowWidth } = useWindowDimensions()
  const workWidth = Math.max(120, Math.min(contentMaxWidth, windowWidth) - 96)
  const insets = useSafeAreaInsets()
  const room = snapshot?.rooms.find(item => item.id === roomId)
  const botName = (id: string) => snapshot?.bots.find(bot => bot.id === id)?.name ?? id
  const writable = connected && foreground && snapshot !== undefined && !snapshot.readOnly
  const draftKey = roomId === undefined ? undefined : groupDraftKey(draftServer, draftAccount, deviceId ?? '', roomId)
  const draft = draftKey === undefined ? '' : drafts[draftKey] ?? ''
  function writeDraft(key: string, value: string) {
    const next = { ...draftsRef.current, [key]: value }
    draftsRef.current = next
    setDrafts(next)
    try { saveGroupDrafts(next) } catch { setError(t('草稿暂未保存到手机，请保留此页面', 'Draft could not be saved. Keep this page open.')) }
  }
  const setDraft = (value: string) => { if (draftKey !== undefined) writeDraft(draftKey, value) }
  useEffect(() => { setCursor(draft.length); setMentionSelection(undefined) }, [roomId, deviceId, draftAccount, draftServer])
  useEffect(() => {
    if (roomId !== undefined && lastHistory.current.room === roomId && !loading && initialScroll.current) {
      if (entries.length === 0) { initialScroll.current = false; return }
      requestAnimationFrame(() => list.current?.scrollToEnd({ animated: false }))
    }
  }, [roomId, loading, entries.length])

  useEffect(() => {
    const listener = AppState.addEventListener('change', value => setForeground(value === 'active'))
    return () => listener.remove()
  }, [])

  // Every write is scoped to this view, room and foreground connection lifetime.
  useEffect(() => {
    lifecycle.current++
    mutationRunning.current = false
    setBusy('')
    setError('')
    setPollError('')
    return () => {
      lifecycle.current++
      for (const controller of controllers.current) controller.abort()
      controllers.current.clear()
    }
  }, [deviceId, scope, connected, foreground, roomId])

  useEffect(() => {
    initialScroll.current = true
    lastHistory.current = {}
    setHasNewMessages(false)
    setSnapshot(undefined)
    setRoomId(undefined)
    setEntries([])
    setRoundEvents([])
    setImageDrafts({})
    setCreating(false)
    setGroupSearch('')
    setMembers([])
    setName('')
    setAdmin(undefined)
    setDetailsOpen(false)
    setPlusOpen(false)
    setError('')
  }, [deviceId, scope, connected])

  useEffect(() => {
    if (!connected || !foreground) { setLoading(false); return }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    setLoading(true)
    const poll = async () => {
      try {
        const next = await callGroupBot<GroupState>('state', { locale: language }, controller.signal)
        if (cancelled) return
        if (!Array.isArray(next.bots) || !Array.isArray(next.rooms)) throw new Error(t('群聊服务返回格式异常', 'Invalid group service response'))
        setSnapshot(next)
        if (roomId !== undefined) {
          if (!next.rooms.some(item => item.id === roomId)) {
            setRoomId(undefined)
            setEntries([])
          } else {
            const history = await callGroupBot<History>('earlier', { roomId }, controller.signal)
            if (cancelled) return
            if (history.roomId !== roomId || !Array.isArray(history.entries)) throw new Error(t('群聊历史返回格式异常', 'Invalid room history response'))
            const latest = history.entries.at(-1)?.seq
            if (lastHistory.current.room === roomId && lastHistory.current.seq !== undefined && latest !== undefined && latest > lastHistory.current.seq) setHasNewMessages(true)
            lastHistory.current = { room: roomId, seq: latest }
            setEntries(history.entries)
            const progress = await callGroupBot<Progress[]>('room-progress', { roomId }, controller.signal)
            if (cancelled) return
            const seen = new Set<string>()
            setRoundEvents(progress.flatMap(round => round.replies.filter(reply => reply.kind === 'failed' || reply.kind === 'missed')).filter(reply => {
              const key = `${reply.botId}:${reply.time}:${reply.text}`
              if (seen.has(key)) return false
              seen.add(key); return true
            }).map((reply, index) => ({ seq: -index - 1, who: reply.name ?? '', botId: reply.botId, text: [reply.code, reply.text].filter(Boolean).join(' · '), kind: reply.kind, time: reply.time })))
          }
        }
        setPollError('')
      } catch (cause) {
        if (!cancelled && !controller.signal.aborted) setPollError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        if (!cancelled) {
          setLoading(false)
          timer = setTimeout(() => { void poll() }, 3000)
        }
      }
    }
    void poll()
    return () => { cancelled = true; controller.abort(); if (timer !== undefined) clearTimeout(timer) }
  }, [deviceId, scope, connected, foreground, roomId, refresh, language])

  async function mutate(key: string, endpoint: string, payload: Record<string, unknown>, done?: () => void) {
    if (!writable || mutationRunning.current) return false
    mutationRunning.current = true
    const generation = lifecycle.current
    const controller = new AbortController()
    controllers.current.add(controller)
    setBusy(key)
    setError('')
    try {
      await callGroupBot(endpoint, payload, controller.signal)
      if (generation !== lifecycle.current || controller.signal.aborted) return false
      done?.()
      setRefresh(value => value + 1)
      return true
    } catch (cause) {
      if (generation === lifecycle.current && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
      return false
    } finally {
      controllers.current.delete(controller)
      if (generation === lifecycle.current) { mutationRunning.current = false; setBusy('') }
    }
  }

  async function pickImages(files = false) {
    if (!writable || pickingImages || busy || roomId === undefined) return
    const target = roomId
    const startedScope = pickerScope
    setPlusOpen(false); setPickingImages(true)
    try {
      let picked: GroupAttachmentDraft[]
      if (files) {
        const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true })
        if (result.canceled || currentPickerScope.current !== startedScope) return
        picked = result.assets.map(asset => groupAttachmentDraft({ uri: asset.uri, name: asset.name, bytes: asset.size ?? new File(asset.uri).size, kind: 'file', mediaType: asset.mimeType }))
      } else {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: Math.max(1, 4 - images.filter(item => item.kind === 'image').length), quality: 1, base64: false })
        if (result.canceled || currentPickerScope.current !== startedScope) return
        picked = result.assets.map(asset => {
          const mediaType = asset.mimeType ?? (asset.fileName?.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg')
          if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mediaType)) throw new Error(t('不支持该图片格式，请选择 PNG/JPEG/WebP/GIF', 'Choose a PNG/JPEG/WebP/GIF image'))
          if (asset.width > 8192 || asset.height > 8192 || asset.width * asset.height > 64000000) throw new Error(t('图片尺寸过大', 'Image dimensions are too large'))
          return groupAttachmentDraft({ uri: asset.uri, name: asset.fileName ?? `image.${mediaType.split('/')[1]}`, bytes: asset.fileSize ?? new File(asset.uri).size, kind: 'image', mediaType })
        })
      }
      if (currentPickerScope.current !== startedScope) return
      const next = [...images, ...picked]
      const problem = validateGroupAttachments(next, zh)
      if (problem) { Alert.alert(t('附件无法添加', 'Cannot add attachments'), problem); return }
      setImageDrafts(previous => ({ ...previous, [target]: next }))
    } catch (cause) {
      if (currentPickerScope.current === startedScope) setError(cause instanceof Error ? cause.message : String(cause))
    } finally { setPickingImages(false) }
  }

  async function sendMessage() {
    if (!room || !writable || mutationRunning.current || pickingImages) return
    const target = room.id
    const startedScope = pickerScope
    const generation = lifecycle.current
    const submitted = draft
    const submittedDraftKey = draftKey
    const items = [...images]
    const controller = new AbortController()
    uploadController.current = controller
    controllers.current.add(controller)
    mutationRunning.current = true; setBusy('send'); setError('')
    try {
      const uploadedFiles = []
      for (let index = 0; index < items.length; index++) {
        const item = items[index]!
        throwIfAborted(controller.signal)
        let receipt = item.receipt
        if (!receipt) {
          const data = await new File(item.uri).bytes()
          receipt = await uploadGroupFile({ sessionId: target, name: item.uploadName, data }, controller.signal, progress => {
            if (generation === lifecycle.current) setUploadProgress(`${index + 1}/${items.length} · ${Math.round(progress.totalBytes ? progress.receivedBytes / progress.totalBytes * 100 : 100)}%`)
          })
          if (currentPickerScope.current === startedScope) setImageDrafts(previous => ({ ...previous, [target]: (previous[target] ?? []).map(value => value.id === item.id ? { ...value, receipt } : value) }))
        }
        throwIfAborted(controller.signal)
        uploadedFiles.push({ ...receipt, originalName: item.name, mediaType: item.mediaType, kind: item.kind })
      }
      if (generation !== lifecycle.current || currentPickerScope.current !== startedScope) return
      throwIfAborted(controller.signal)
      setUploadProgress('')
      await callGroupBot('send', { sessionId: target, text: submitted, uploadedFiles }, controller.signal)
      if (generation !== lifecycle.current) return
      setImageDrafts(previous => ({ ...previous, [target]: (previous[target] ?? []).filter(item => !items.some(sent => sent.id === item.id)) }))
      if (submittedDraftKey !== undefined && draftsRef.current[submittedDraftKey] === submitted) writeDraft(submittedDraftKey, '')
      setRefresh(value => value + 1)
    } catch (cause) {
      if (generation === lifecycle.current) setError(controller.signal.aborted ? t('已取消，附件和文字保留在草稿中', 'Cancelled. Your attachments and text remain in the draft.') : cause instanceof Error ? cause.message : String(cause))
    } finally {
      controllers.current.delete(controller)
      if (uploadController.current === controller) uploadController.current = undefined
      if (generation === lifecycle.current) { mutationRunning.current = false; setBusy(''); setUploadProgress('') }
    }
  }

  function chooseRoom(id?: string) {
    setEntries([])
    setRoundEvents([])
    nearBottom.current = true
    initialScroll.current = true
    lastHistory.current = {}
    setHasNewMessages(false)
    setRoomId(id)
    setCreating(false)
    setDetailsOpen(false)
    setPlusOpen(false)
  }

  const work = roomId === undefined ? [] : snapshot?.work?.rooms?.[roomId] ?? []
  const approvals = snapshot?.work?.approvals?.filter(item => item.roomId === roomId) ?? []
  const search = groupSearch.trim().toLocaleLowerCase()
  const rooms = (snapshot?.rooms ?? []).filter(item => search
    ? `${item.name} ${item.members.map(botName).join(' ')}`.toLocaleLowerCase().includes(search)
    : !item.hidden).sort((a, b) => Number(b.pinned === true) - Number(a.pinned === true))
  const subtitle = !connected ? t('连接已断开，请返回设备页重新连接', 'Disconnected. Reconnect from Devices.')
    : !foreground ? t('后台已暂停刷新', 'Updates paused in background')
      : snapshot?.readOnly ? t('只读连接', 'Read-only connection') : room ? t(`${room.members.length} 位成员`, `${room.members.length} members`) : t('与电脑共用群聊', 'Shared with your computer')

  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (plusOpen) { setPlusOpen(false); return true }
      if (detailsOpen) { setDetailsOpen(false); return true }
      return false
    })
    return () => back.remove()
  }, [plusOpen, detailsOpen])

  const errors = <>
    {error !== '' && <View style={styles.error}><Text selectable style={styles.errorText}>{error}</Text></View>}
    {pollError !== '' && <View style={styles.error}><Text selectable style={styles.errorText}>{pollError}</Text></View>}
  </>
  const mention = (name: string, complete = true) => {
    const result = insertMention(draft, cursor, name, complete)
    setDraft(result.text)
    setCursor(result.cursor)
    setMentionSelection({ start: result.cursor, end: result.cursor })
    setPlusOpen(false)
    requestAnimationFrame(() => input.current?.focus())
  }
  const query = mentionQuery(draft, cursor)
  const mentionOptions = room && query !== undefined ? [
    { id: 'all', name: 'all', label: t('所有人', 'Everyone'), bot: undefined },
    ...room.members.flatMap(id => { const bot = snapshot?.bots.find(item => item.id === id); return bot ? [{ id, name: bot.name, label: bot.name, bot }] : [] }),
  ].filter(item => `${item.name} ${item.label}`.toLocaleLowerCase().includes(query.query.toLocaleLowerCase())) : []
  const loadEntry = (seq: number, signal: AbortSignal) => {
    const readingScope = getGroupConnectionScope()
    return readGroupMessage((payload, requestSignal) => {
      if (readingScope !== getGroupConnectionScope()) throw new Error(t('连接已更换，请重新打开消息', 'The connection changed. Reopen this message.'))
      return callGroupBot('earlier', payload, requestSignal)
    }, room!.id, seq, signal)
  }

  return <View style={styles.screen}>
    <TopBar title={room?.name ?? t('群聊', 'Group chats')} subtitle={subtitle}
      onBack={roomId !== undefined || creating ? () => chooseRoom() : onBack}
      action={room ? <IconButton label={t('群聊信息', 'Group info')} icon={MoreHorizontal} onPress={() => { Keyboard.dismiss(); setDetailsOpen(true) }} />
        : <IconButton label={t('刷新', 'Refresh')} icon={RefreshCw} disabled={!connected || !foreground || loading} onPress={() => setRefresh(value => value + 1)} />} />
    {errors}
    {room && <GroupApprovals items={approvals} botName={botName} zh={zh} disabled={!writable || busy !== ''} onAnswer={(id, choice) => { void mutate(`approval:${id}`, 'approval-answer', { id, choice }) }} />}
    {!!snapshot?.readOnly && <Text selectable style={styles.note}>{snapshot.readOnly}</Text>}
    {!connected && <Text style={styles.note}>{subtitle}</Text>}
    {room === undefined ? <ScrollView style={styles.flex} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, { maxWidth: contentMaxWidth }]}>
      {creating ? <>
        <Text style={styles.heading}>{t('新建群聊', 'Create group chat')}</Text>
        <Field label={t('群名称', 'Group name')} value={name} onChangeText={setName} maxLength={60} />
        <Text style={styles.note}>{t('选择电脑上已创建的 Bot；CLI 成员请先在电脑添加。', 'Choose existing computer Bots. Add CLI members on your computer first.')}</Text>
        {(snapshot?.bots ?? []).map(bot => {
          const selected = members.includes(bot.id)
          return <View key={bot.id} style={[styles.memberChoice, selected && { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}>
            <Pressable accessibilityRole="checkbox" accessibilityLabel={bot.name} accessibilityState={{ checked: selected }} style={styles.memberSelect} onPress={() => {
              setMembers(previous => selected ? previous.filter(id => id !== bot.id) : previous.length < 12 ? [...previous, bot.id] : previous)
              if (selected && admin === bot.id) setAdmin(undefined)
            }}>
              <GroupAvatar bot={bot} size={40} /><View style={styles.memberCopy}><Text numberOfLines={1} style={styles.author}>{bot.name}</Text>{!!bot.role && <Text numberOfLines={1} style={styles.note}>{bot.role}</Text>}</View>
              <View style={[styles.checkbox, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>{selected && <Check size={14} color={colors.white} />}</View>
            </Pressable>
            {selected && mode === 'admin' && <Pressable accessibilityRole="button" accessibilityLabel={t(`将 ${bot.name} 设为主持人`, `Make ${bot.name} moderator`)} style={styles.moderatorPick} onPress={() => setAdmin(bot.id)}>
              <Crown size={14} color={admin === bot.id ? colors.primary : colors.muted} /><Text style={[styles.note, admin === bot.id && { color: colors.primary }]}>{admin === bot.id ? t('主持人', 'Moderator') : t('设为主持', 'Make moderator')}</Text>
            </Pressable>}
          </View>
        })}
        <View style={styles.row}>
          <Button label={t('主持人回答', 'Moderator replies')} variant={mode === 'admin' ? 'secondary' : 'quiet'} onPress={() => setMode('admin')} />
          <Button label={t('所有人回答', 'Everyone replies')} variant={mode === 'everyone' ? 'secondary' : 'quiet'} onPress={() => setMode('everyone')} />
        </View>
        <Text style={styles.note}>{t('主持模式下，普通消息只交给主持人；@成员可指定回答。', 'In moderator mode, plain messages go only to the moderator; @ a member to address them.')}</Text>
        <Button label={t('创建群聊', 'Create group')} loading={busy === 'create'} disabled={!writable || busy !== '' || members.length < 2 || (mode === 'admin' && !admin)}
          onPress={() => { void mutate('create', 'create-room', { name: name.trim(), members, mode, ...(mode === 'admin' ? { admin } : {}) }, () => {
            setCreating(false); setName(''); setMembers([]); setAdmin(undefined)
          }) }} />
      </> : <>
        <Text style={styles.note}>{t('手机和电脑查看同一份群消息。点开群聊后，可 @成员、处理审批或停止任务。', 'Read the same rooms as your computer. Mention members, answer approvals, or stop tasks.')}</Text>
        <Button label={t('新建群聊', 'New group chat')} icon={Plus} disabled={!writable || busy !== ''} onPress={() => setCreating(true)} />
        <Field label={t('搜索群聊', 'Search groups')} value={groupSearch} onChangeText={setGroupSearch} placeholder={t('名称或成员，也可查找隐藏群聊', 'Name or member, including hidden groups')} />
        {loading && snapshot === undefined && <Text style={styles.note}>{t('正在加载群聊…', 'Loading groups…')}</Text>}
        {!loading && snapshot?.rooms.length === 0 && <Text style={styles.note}>{t('暂无群聊，可以用电脑已有的 Bot 创建。', 'No groups yet. Create one from existing Bots.')}</Text>}
        {!loading && search !== '' && rooms.length === 0 && <Text style={styles.note}>{t('没有匹配的群聊', 'No matching groups')}</Text>}
        {rooms.map(item => <View style={styles.card} key={item.id}>
          <Pressable accessibilityRole="button" accessibilityLabel={item.name} style={styles.menuItem} onPress={() => chooseRoom(item.id)}>
            <RoomAvatar bots={item.members.map(id => snapshot?.bots.find(bot => bot.id === id)).filter((bot): bot is NonNullable<typeof bot> => !!bot)} size={48} />
            <View style={styles.memberCopy}><View style={styles.identity}><Text style={styles.author}>{item.name}</Text>{item.pinned && <Pin size={12} color={colors.muted} />}</View><Text numberOfLines={1} style={styles.note}>{typeof item.preview === 'string' ? item.preview : item.members.map(botName).join(' · ')}</Text></View><ChevronRight size={18} color={colors.muted} />
          </Pressable>
        </View>)}
      </>}
    </ScrollView> : <View style={styles.flex}>
      <FlatList ref={list} data={[...entries, ...roundEvents]} keyExtractor={item => `${roomId}:${item.seq}`} style={styles.flex} initialNumToRender={60}
        contentContainerStyle={[styles.messages, { maxWidth: contentMaxWidth }]}
        onScrollBeginDrag={() => { initialScroll.current = false }}
        onContentSizeChange={() => { if (initialScroll.current && lastHistory.current.room === roomId && !loading) requestAnimationFrame(() => list.current?.scrollToEnd({ animated: false })) }}
        onEndReached={() => { if (lastHistory.current.room === roomId && !loading) initialScroll.current = false }} onEndReachedThreshold={0.01}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" onScroll={event => {
          const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent
          nearBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 40
          if (nearBottom.current) setHasNewMessages(false)
        }} scrollEventThrottle={100}
        ListEmptyComponent={<Text style={styles.note}>{loading ? t('加载消息…', 'Loading messages…') : t('还没有消息。', 'No messages yet.')}</Text>}
        renderItem={({ item }) => <GroupMessage roomId={roomId} entry={item} bot={snapshot?.bots.find(bot => bot.id === item.botId || bot.name === item.who)} zh={zh} onMention={name => mention(name, false)} onToggleExpand={() => { nearBottom.current = false }} loadWhole={signal => loadEntry(item.seq, signal)} />}
        ListFooterComponent={<>
          {work.map(item => <View key={item.botId} style={styles.workRow}>
            <GroupAvatar bot={snapshot?.bots.find(bot => bot.id === item.botId)} size={34} onLongPress={() => mention(botName(item.botId), false)} />
            <View style={[styles.workCard, { width: workWidth }]}><View style={styles.workHeader}><Text numberOfLines={1} style={[styles.author, styles.workTitle]}>{botName(item.botId)} · {t('工作中', 'Working')}</Text>
              <IconButton label={t('停止该成员', 'Stop member')} icon={Square} disabled={!writable || busy !== ''} onPress={() => {
                void mutate(`stop:${item.botId}`, 'stop-member-work', { roomId: room.id, botId: item.botId })
              }} /></View>
              <Text selectable numberOfLines={3} style={styles.note}>{item.tool ?? item.text ?? t('等待输出…', 'Waiting for output…')}</Text>
            </View>
          </View>)}
        </>} />
      <KeyboardInset grow={false}>
        {hasNewMessages && <Pressable accessibilityRole="button" style={styles.latest} onPress={() => { setHasNewMessages(false); nearBottom.current = true; list.current?.scrollToEnd({ animated: true }) }}><Text style={{ color: colors.primary }}>{t('新消息 · 回到最新 ↓', 'New messages · Jump to latest ↓')}</Text></Pressable>}
        {images.length > 0 && <GroupAttachmentDrafts items={images} disabled={busy !== ''} zh={zh} onRemove={id => { if (roomId) setImageDrafts(previous => ({ ...previous, [roomId]: (previous[roomId] ?? []).filter(item => item.id !== id) })) }} />}
        {busy === 'send' && <View style={styles.identity}><Text style={styles.note}>{uploadProgress || t('正在发送…', 'Sending…')}</Text><Button label={t('取消', 'Cancel')} variant="quiet" onPress={() => uploadController.current?.abort()} /></View>}
        {mentionOptions.length > 0 && !plusOpen && <ScrollView horizontal keyboardShouldPersistTaps="always" style={styles.mentionBar} contentContainerStyle={styles.mentionOptions}>
          {mentionOptions.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`@${item.name}`} style={styles.mentionOption} onPress={() => mention(item.name)}>
            {item.bot ? <GroupAvatar bot={item.bot} size={26} /> : <AtSign size={22} color={colors.primary} />}
            <Text numberOfLines={1} style={[styles.note, { color: colors.ink, maxWidth: 120 }]}>{item.label}</Text>
          </Pressable>)}
        </ScrollView>}
        <View style={[styles.composer, { maxWidth: contentMaxWidth }]}>
        <IconButton label={t('添加或提及成员', 'Add or mention a member')} icon={Plus} disabled={!writable} onPress={() => { Keyboard.dismiss(); setPlusOpen(true) }} />
        <TextInput ref={input} accessibilityLabel={t('群聊消息', 'Group message')} style={styles.draft} value={draft} onChangeText={value => { setMentionSelection(undefined); setDraft(value) }} onSelectionChange={event => { setCursor(event.nativeEvent.selection.start); setMentionSelection(undefined) }} selection={mentionSelection} multiline
          placeholder={t('发送消息', 'Message')} placeholderTextColor={colors.muted} editable={writable} />
        <IconButton label={t('发送', 'Send')} icon={Send} disabled={!writable || busy !== '' || pickingImages || (!draft.trim() && images.length === 0)} onPress={() => { void sendMessage() }} />
      </View></KeyboardInset>
      <Modal visible={plusOpen} transparent animationType="slide" onRequestClose={() => setPlusOpen(false)}>
        <View style={styles.modal}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('关闭菜单', 'Close menu')} style={StyleSheet.absoluteFill} onPress={() => setPlusOpen(false)} />
          <View style={[styles.sheet, { maxHeight: sheetMaxHeight, paddingBottom: Math.max(insets.bottom, spacing.md), maxWidth: contentMaxWidth }]}>
            <View style={styles.sheetHeader}><Text style={styles.heading}>{t('添加内容', 'Add to message')}</Text><IconButton label={t('关闭', 'Close')} icon={X} onPress={() => setPlusOpen(false)} /></View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.menuBody}>
              <Button label={t('发送图片', 'Send images')} icon={ImagePlus} variant="quiet" disabled={!writable || pickingImages || busy !== '' || images.length >= 8} onPress={() => { void pickImages() }} />
              <Button label={t('添加文件', 'Add files')} icon={Paperclip} variant="quiet" disabled={!writable || pickingImages || busy !== '' || images.length >= 8} onPress={() => { void pickImages(true) }} />
              <Pressable accessibilityRole="button" accessibilityLabel={t('@所有人', '@Everyone')} disabled={!writable} style={styles.menuItem} onPress={() => mention('all')}>
                <View style={styles.allIcon}><AtSign size={22} color={colors.primary} /></View>
                <View style={styles.memberCopy}><Text style={styles.author}>{t('@所有人', '@Everyone')}</Text><Text style={styles.note}>{t('让群内所有成员参与', 'Invite every member to reply')}</Text></View><ChevronRight size={16} color={colors.muted} />
              </Pressable>
              {room.members.map(id => {
                const bot = snapshot?.bots.find(item => item.id === id)
                if (!bot) return null
                return <Pressable key={id} accessibilityRole="button" accessibilityLabel={`@${bot.name}`} disabled={!writable} style={styles.menuItem} onPress={() => mention(bot.name)}>
                  <GroupAvatar bot={bot} size={40} /><View style={styles.memberCopy}><Text style={styles.author}>{bot.name}</Text>{!!bot.role && <Text style={styles.note}>{bot.role}</Text>}</View><AtSign size={18} color={colors.muted} />
                </Pressable>
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>}
    <Modal visible={detailsOpen && room !== undefined} animationType="slide" onRequestClose={() => setDetailsOpen(false)}>
      <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
        {errors}
        {room && <GroupDetails key={room.id} room={room} bots={snapshot?.bots ?? []} permissions={snapshot?.permissions} zh={zh}
          writable={writable} busy={busy !== ''} onBack={() => setDetailsOpen(false)}
          onUpdate={patch => mutate('settings', 'update-room', { id: room.id, ...patch })}
          onFlags={patch => mutate('flags', 'set-flags', { id: room.id, ...patch })}
          onDelete={() => mutate('delete', 'delete-room', { id: room.id }, () => chooseRoom())} />}
      </View>
    </Modal>
  </View>
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    body: { width: '100%', alignSelf: 'center', padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
    heading: { ...type.heading, color: colors.ink },
    note: { ...type.small, color: colors.muted },
    error: { padding: spacing.sm, backgroundColor: colors.dangerSoft, maxHeight: 112 },
    errorText: { ...type.small, color: colors.danger },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, flexWrap: 'wrap' },
    card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, gap: spacing.xs, marginBottom: spacing.xs },
    messages: { width: '100%', alignSelf: 'center', paddingTop: spacing.md, paddingBottom: spacing.sm, flexGrow: 1 },
    identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    memberChoice: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.sm },
    memberSelect: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 68, paddingVertical: 10 },
    checkbox: { width: 22, height: 22, flexShrink: 0, borderWidth: 1, borderColor: colors.border, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
    moderatorPick: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minHeight: 36, paddingBottom: 6 },
    memberCopy: { flex: 1, minWidth: 0 },
    menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, minHeight: 60 },
    workRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginHorizontal: 16, marginBottom: spacing.md },
    workCard: { flexShrink: 1, minWidth: 0, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
    workHeader: { flexDirection: 'row', alignItems: 'center', width: '100%', minHeight: 44, gap: 6 },
    workTitle: { flex: 1, minWidth: 0 },
    author: { ...type.smallStrong, color: colors.ink },
    messageText: { ...type.body, color: colors.ink },
    latest: { alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.primarySoft },
    mentionBar: { flexGrow: 0, maxHeight: 58, borderTopWidth: 1, borderColor: colors.separator, backgroundColor: colors.surface },
    mentionOptions: { paddingHorizontal: 12, paddingVertical: 8, gap: 10 },
    mentionOption: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, minHeight: 38, borderRadius: 12, backgroundColor: colors.surfaceStrong },
    modal: { flex: 1, backgroundColor: colors.modalBackdrop, justifyContent: 'flex-end' },
    sheet: { width: '100%', alignSelf: 'center', backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing.md },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.xs },
    menuBody: { paddingBottom: spacing.xs },
    allIcon: { width: 40, height: 40, backgroundColor: colors.primarySoft, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    composer: { width: '100%', alignSelf: 'center', flexDirection: 'row', alignItems: 'flex-end', padding: spacing.xs, gap: spacing.xs, borderTopWidth: 1, borderColor: colors.separator },
    draft: { ...type.body, color: colors.ink, backgroundColor: colors.surfaceStrong, flex: 1, minHeight: 46, maxHeight: 136, padding: spacing.sm, borderRadius: radius.md },
  })
}
