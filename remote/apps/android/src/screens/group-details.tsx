import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { ChevronRight, Crown, Minus, Plus } from 'lucide-react-native'
import { Button, TopBar } from '../ui/components'
import { KeyboardInset } from '../ui/keyboard-inset'
import { useTheme } from '../ui/theme-context'
import { GroupAvatar, RoomAvatar } from './group-display'
import type { GroupBot, GroupRoom, GroupState } from './group-types'

interface Props {
  room: GroupRoom
  bots: GroupBot[]
  permissions: GroupState['permissions']
  zh: boolean
  writable: boolean
  busy: boolean
  onBack: () => void
  onUpdate: (patch: Record<string, unknown>) => Promise<boolean>
  onFlags: (patch: Record<string, unknown>) => Promise<boolean>
  onDelete: () => Promise<boolean>
}

type Editing = 'name' | 'notice' | 'maxTurns' | 'workDir'

/** The desktop group settings, presented as a separate mobile details page. */
export function GroupDetails({ room, bots, permissions, zh, writable, busy, onBack, onUpdate, onFlags, onDelete }: Props) {
  const { colors } = useTheme()
  const t = (cn: string, en: string) => zh ? cn : en
  const [editing, setEditing] = useState<Editing>()
  const [draft, setDraft] = useState('')
  const [validation, setValidation] = useState('')
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState<string>()
  const disabled = !writable || busy
  const live = useRef({ active: true, disabled, roomId: room.id })
  live.current.disabled = disabled
  live.current.roomId = room.id
  useEffect(() => { live.current.active = true; return () => { live.current.active = false } }, [])
  const members = room.members.map(id => bots.find(bot => bot.id === id)).filter((bot): bot is GroupBot => bot !== undefined)
  const outside = bots.filter(bot => !room.members.includes(bot.id))
  const admin = members.find(bot => bot.id === room.admin)
  const member = members.find(bot => bot.id === selected)
  const mode = admin ? room.mode : 'everyone'

  function begin(field: Editing) {
    if (disabled) return
    setEditing(field)
    setDraft(field === 'maxTurns' ? room.maxTurns === undefined ? '' : String(room.maxTurns)
      : field === 'name' ? room.named === false ? '' : room.name : room[field] ?? '')
    setValidation('')
  }

  async function save() {
    if (!editing || disabled) return
    const value = editing === 'maxTurns' ? draft.trim() === '' ? null : Number(draft.trim())
      : editing === 'workDir' && draft.trim() === '' ? null : draft
    if (editing === 'maxTurns' && value !== null && (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 40)) {
      setValidation(t('请输入 1–40 的整数，留空使用默认值', 'Enter an integer from 1 to 40, or leave blank for the default'))
      return
    }
    if (await onUpdate({ [editing]: value })) { setEditing(undefined); setValidation('') }
  }

  function editor(field: Editing, hint: string) {
    if (editing !== field) return null
    return <View style={styles.editor}>
      <TextInput accessibilityLabel={hint} autoFocus value={draft} onChangeText={setDraft} editable={!disabled}
        multiline={field === 'notice'} maxLength={field === 'name' ? 60 : field === 'notice' ? 2000 : field === 'maxTurns' ? 2 : 4096}
        keyboardType={field === 'maxTurns' ? 'number-pad' : 'default'} placeholder={hint} placeholderTextColor={colors.subtle}
        style={[styles.input, { color: colors.ink, borderColor: colors.border, backgroundColor: colors.background }, field === 'notice' && styles.multiline]} />
      {validation !== '' && <Text accessibilityRole="alert" style={[styles.hint, { color: colors.danger }]}>{validation}</Text>}
      <View style={styles.editorActions}>
        <Button label={t('取消', 'Cancel')} variant="secondary" onPress={() => setEditing(undefined)} disabled={busy} />
        <Button label={t('保存', 'Save')} onPress={() => { void save() }} disabled={disabled} />
      </View>
    </View>
  }

  function removeMember(bot: GroupBot) {
    if (disabled || room.members.length <= 2) return
    Alert.alert(t('移除成员', 'Remove member'), t(`将 ${bot.name} 移出群聊？`, `Remove ${bot.name} from this group?`), [
      { text: t('取消', 'Cancel'), style: 'cancel' },
      { text: t('移除', 'Remove'), style: 'destructive', onPress: () => {
        if (!live.current.active || live.current.disabled || live.current.roomId !== room.id) return
        void onUpdate({ remove: [bot.id] }).then(done => { if (done && live.current.active) setSelected(undefined) })
      } },
    ])
  }

  function deleteGroup() {
    if (disabled) return
    Alert.alert(t(`删除「${room.name}」？`, `Delete ${room.name}?`), t('群聊记录将归档，成员仍保留在团队中。', 'Its history is archived. Its members stay on the team.'), [
      { text: t('取消', 'Cancel'), style: 'cancel' },
      { text: t('删除群聊', 'Delete group'), style: 'destructive', onPress: () => {
        if (!live.current.active || live.current.disabled || live.current.roomId !== room.id) return
        void onDelete().then(done => { if (done && live.current.active) onBack() })
      } },
    ])
  }

  return <View style={[styles.screen, { backgroundColor: colors.background }]}>
    <TopBar title={t('群聊信息', 'Group info')} onBack={onBack} backLabel={t('返回群聊', 'Back to chat')} />
    <KeyboardInset><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: 24 }]}>
      <View style={styles.hero}><RoomAvatar bots={members} size={64} /><Text style={[styles.name, { color: colors.ink }]}>{room.name}</Text>
        <Text style={[styles.hint, { color: colors.subtle }]}>{t(`${members.length} 位成员`, `${members.length} members`)} · {admin ? t(`主持：${admin.name}`, `Admin: ${admin.name}`) : t('无主持人', 'No admin')}</Text></View>
      {!writable && <Text style={[styles.readOnly, { color: colors.warning, backgroundColor: colors.warningSoft }]}>{t('当前只读，暂不能修改群设置。', 'Read only. Group settings cannot be changed right now.')}</Text>}

      <Card title={t('群成员', 'Members')}>
        <View style={styles.memberGrid}>{members.map(bot => <Pressable key={bot.id} disabled={disabled} accessibilityRole="button" accessibilityLabel={t(`管理成员 ${bot.name}`, `Manage ${bot.name}`)} onPress={() => setSelected(value => value === bot.id ? undefined : bot.id)} style={[styles.member, selected === bot.id && { backgroundColor: colors.primarySoft }]}>
          <GroupAvatar bot={bot} size={44} /><View style={styles.memberName}><Text numberOfLines={1} style={[styles.memberLabel, { color: colors.ink }]}>{bot.name}</Text>{room.admin === bot.id && <Crown size={11} color={colors.warning} />}</View>
          {bot.role && <Text numberOfLines={1} style={[styles.role, { color: colors.subtle }]}>{bot.role}</Text>}
        </Pressable>)}
          {outside.length > 0 && room.members.length < 12 && <Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={t('添加成员', 'Add member')} onPress={() => setAdding(value => !value)} style={styles.member}>
            <View style={[styles.addAvatar, { borderColor: colors.border }]}><Plus size={22} color={colors.muted} /></View><Text style={[styles.memberLabel, { color: colors.muted }]}>{t('添加', 'Add')}</Text>
          </Pressable>}
        </View>
        {member && <View style={styles.memberActions}><Text style={[styles.hint, { color: colors.muted }]}>{member.name}</Text>
          <Button variant="secondary" label={room.admin === member.id ? t('取消主持', 'Unset admin') : t('设为主持', 'Make admin')} disabled={disabled} onPress={() => { void onUpdate({ admin: room.admin === member.id ? null : member.id }) }} />
          {room.members.length > 2 && <Button icon={Minus} variant="secondary" label={t('移出群聊', 'Remove')} disabled={disabled} onPress={() => removeMember(member)} />}
        </View>}
        {adding && <View style={styles.addPicker}><Text style={[styles.hint, { color: colors.muted }]}>{t('从桌面端团队中添加成员', 'Add from the desktop team')}</Text>
          {outside.map(bot => <Pressable key={bot.id} disabled={disabled || room.members.length >= 12} accessibilityRole="button" onPress={() => { void onUpdate({ add: [bot.id] }).then(done => { if (done) setAdding(false) }) }} style={styles.addRow}>
            <GroupAvatar bot={bot} size={32} /><View style={styles.rowCopy}><Text style={[styles.label, { color: colors.ink }]}>{bot.name}</Text>{bot.role && <Text style={[styles.hint, { color: colors.subtle }]}>{bot.role}</Text>}</View><Plus size={17} color={colors.primary} />
          </Pressable>)}<Button label={t('取消', 'Cancel')} variant="secondary" onPress={() => setAdding(false)} />
        </View>}
        <Text style={[styles.cardHint, { color: colors.subtle }]}>{admin ? t(`${admin.name} 可通过 @ 调用成员、修改群设置和发言。`, `${admin.name} can call members with @mentions, change the group and post here.`) : t('可选择一位主持人，通过 @ 调用其他成员。', 'Choose an admin to call members with @mentions.')}</Text>
      </Card>

      <Card title={t('群资料', 'Profile')}>
        <Row disabled={disabled} label={t('群聊名称', 'Group name')} value={room.name} onPress={() => begin('name')} />{editor('name', t('留空按成员命名', 'Leave blank to name after members'))}
        <Row disabled={disabled} label={t('群公告', 'Notice')} value={room.notice || t('未设置', 'Not set')} hint={t('每位成员发言前都会阅读', 'Every member reads this before speaking')} onPress={() => begin('notice')} />{editor('notice', t('群成员共同遵循的说明…', 'Shared instructions for every member…'))}
      </Card>
      <Card title={t('谁来回答', 'Who answers')}>
        <View style={styles.choices}>{[['admin', t('主持人调度', 'Admin leads')], ['everyone', t('依次回答', 'Everyone')]].map(([value, label]) => <Pressable key={value} disabled={disabled || value === 'admin' && !admin} accessibilityRole="radio" accessibilityState={{ checked: mode === value, disabled: disabled || value === 'admin' && !admin }} onPress={() => { if (mode !== value) void onUpdate({ mode: value }) }} style={[styles.choice, { backgroundColor: mode === value ? colors.primarySoft : colors.surfaceStrong, opacity: value === 'admin' && !admin ? .4 : 1 }]}><Text style={[styles.choiceLabel, { color: mode === value ? colors.primary : colors.muted }]}>{label}</Text></Pressable>)}</View>
        <Text style={[styles.cardHint, { color: colors.subtle }]}>{mode === 'admin' ? t('普通消息交给主持人，由主持人 @ 其他成员。', 'Plain messages go to the admin, who calls others with @mentions.') : t('每位成员依次回答，主持人优先。', 'Every member answers in turn, admin first.')} {t('@ 始终指定回答者。', '@mentions always pick who answers.')}</Text>
        <Row disabled={disabled} label={t('最多回复轮数', 'Maximum turns')} value={room.maxTurns === undefined ? t('默认', 'Default') : String(room.maxTurns)} hint={t('每条消息的成员回复总数，包含 @ 接力；1 表示只听首位成员。', 'Total replies per message including @ relays. Set 1 for only the first speaker.')} onPress={() => begin('maxTurns')} />{editor('maxTurns', t('1–40，留空使用默认值', '1–40; blank for default'))}
      </Card>
      <Card title={t('工作目录', 'Working folder')}><Row disabled={disabled} label={t('目录', 'Folder')} value={room.workDir || t('跟随成员', 'Each member’s folder')} onPress={() => begin('workDir')} />{editor('workDir', t('电脑上的绝对目录，留空跟随成员', 'Host absolute path; blank for each member’s folder'))}</Card>

      {!!permissions?.options?.length && <Card title={t('权限', 'Permissions')}>
        <Text style={[styles.cardHint, { color: colors.subtle }]}>{t('DSH 预设适用于 DSH 成员；本地 Agent 使用自身权限，审批请求会发送到群聊。', 'DSH presets apply to DSH members. Local agents use their own permissions and send approval requests to this group.')}</Text>
        <View style={styles.row}><View style={styles.rowCopy}><Text style={[styles.label, { color: colors.ink }]}>{t('所有成员使用相同权限', 'Same for every member')}</Text><Text style={[styles.hint, { color: colors.subtle }]}>{t('覆盖成员在此群中的独立预设', 'Replaces each member’s preset in this group')}</Text></View><Switch disabled={disabled} value={room.permission !== undefined} onValueChange={on => { void onUpdate({ permission: on ? permissions.defaultPreset ?? permissions.options[0]?.value : null }) }} /></View>
        {room.permission !== undefined && <View style={styles.permissionChoices}>{permissions.options.map(option => <Pressable key={option.value} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: room.permission === option.value }} onPress={() => { void onUpdate({ permission: option.value }) }} style={[styles.permission, { backgroundColor: room.permission === option.value ? colors.primarySoft : colors.surfaceStrong }]}><Text style={[styles.label, { color: room.permission === option.value ? option.value === 'danger-full-access' ? colors.danger : colors.primary : colors.ink }]}>{option.value === 'read-only' ? t('只读', 'Read only') : option.value === 'workspace-write' ? t('工作区', 'Workspace') : option.value === 'danger-full-access' ? t('完全访问', 'Full access') : option.name ?? option.label ?? option.value}</Text>{option.description && <Text style={[styles.hint, { color: colors.subtle }]}>{option.description}</Text>}</Pressable>)}</View>}
      </Card>}
      <Card title={t('侧栏', 'Sidebar')}>
        <View style={styles.row}><View style={styles.rowCopy}><Text style={[styles.label, { color: colors.ink }]}>{t('置顶群聊', 'Pin group')}</Text><Text style={[styles.hint, { color: colors.subtle }]}>{t('显示在其他会话上方', 'Kept above other chats')}</Text></View><Switch disabled={disabled} value={room.pinned === true} onValueChange={pinned => { void onFlags({ pinned }) }} /></View>
        <View style={styles.row}><View style={styles.rowCopy}><Text style={[styles.label, { color: colors.ink }]}>{t('从侧栏隐藏', 'Hide from sidebar')}</Text><Text style={[styles.hint, { color: colors.subtle }]}>{t('仍可通过搜索找到', 'Search still finds it')}</Text></View><Switch disabled={disabled} value={room.hidden === true} onValueChange={hidden => { void onFlags({ hidden }) }} /></View>
      </Card>
      <Pressable disabled={disabled} accessibilityRole="button" onPress={deleteGroup} style={[styles.delete, { backgroundColor: colors.dangerSoft }, disabled && styles.disabled]}><Text style={[styles.label, { color: colors.danger }]}>{t('删除群聊', 'Delete group')}</Text></Pressable>
    </ScrollView></KeyboardInset>
  </View>
}

function Card({ title, children }: { title: string; children: ReactNode }) {
    const { colors } = useTheme()
    return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
      <Text style={[styles.section, { color: colors.subtle }]}>{title}</Text>{children}
    </View>
  }

function Row({ label, value, hint, onPress, disabled = false }: { label: string; value?: string; hint?: string; onPress?: () => void; disabled?: boolean }) {
    const { colors } = useTheme()
    const body = <><View style={styles.rowCopy}><Text style={[styles.label, { color: colors.ink }]}>{label}</Text>
      {hint && <Text style={[styles.hint, { color: colors.subtle }]}>{hint}</Text>}</View>
      {value !== undefined && <Text numberOfLines={3} style={[styles.value, { color: colors.muted }]}>{value}</Text>}
      {onPress && <ChevronRight size={16} color={colors.subtle} />}</>
    return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} style={[styles.row, disabled && styles.disabled]} onPress={onPress}>{body}</Pressable>
      : <View style={styles.row}>{body}</View>
  }


const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { padding: 16, gap: 14 }, hero: { alignItems: 'center', gap: 10, paddingVertical: 16 }, name: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden' }, section: { fontSize: 12, fontWeight: '500', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14 }, rowCopy: { flex: 1, gap: 4 }, label: { fontSize: 15, lineHeight: 21 }, value: { maxWidth: '53%', fontSize: 14, lineHeight: 20, textAlign: 'right' }, hint: { fontSize: 12, lineHeight: 18 },
  memberGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 10, gap: 2 }, member: { width: '24%', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 3, gap: 6, borderRadius: 8 }, memberName: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: '100%' }, memberLabel: { fontSize: 12, lineHeight: 16, flexShrink: 1 }, role: { fontSize: 10, lineHeight: 14, maxWidth: '100%' }, addAvatar: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  memberActions: { padding: 14, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, addPicker: { padding: 14, gap: 10 }, addRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 }, cardHint: { fontSize: 12, lineHeight: 19, paddingHorizontal: 16, paddingVertical: 10 },
  editor: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 }, input: { borderWidth: 1, borderRadius: 9, padding: 12, fontSize: 15, lineHeight: 22 }, multiline: { minHeight: 120, textAlignVertical: 'top' }, editorActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  choices: { flexDirection: 'row', gap: 8, padding: 14 }, choice: { flex: 1, borderRadius: 8, padding: 11, alignItems: 'center' }, choiceLabel: { fontSize: 14 }, permissionChoices: { padding: 14, gap: 8 }, permission: { borderRadius: 8, padding: 12, gap: 4 },
  delete: { padding: 16, alignItems: 'center', borderRadius: 12 }, disabled: { opacity: .45 }, readOnly: { fontSize: 12, lineHeight: 18, padding: 12, borderRadius: 8 },
})
