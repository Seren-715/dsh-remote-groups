import { ChevronRight, X } from 'lucide-react-native'
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { strings as zhCN } from '../../locales/i18n'
import type { RemoteSession, TeamMemberSnapshot, TeamTaskSnapshot } from '../../types'
import { IconButton } from '../../ui/components'
import { useTheme } from '../../ui/theme-context'
import { useThemedStyles } from '../../ui/use-themed-styles'
import { resolveSessionDisplayTitle } from '../session-title'
import { ModalSurface, usePickerListMaxHeight } from './modal'
import { createStyles } from './styles'

/** Popover listing the session's subagent (child) conversations (title-bar entry). */
export function ChildAgentPanel({ visible, sessions, onClose, onOpen }: {
  visible: boolean
  sessions: RemoteSession[]
  onClose: () => void
  onOpen: (session: RemoteSession) => void
}) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const listMaxHeight = usePickerListMaxHeight()
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <ModalSurface onClose={onClose}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{zhCN.chat.subagentsTitle(sessions.length)}</Text>
          <IconButton label={zhCN.common.close} icon={X} onPress={onClose} />
        </View>
        <ScrollView style={[styles.subagentList, { maxHeight: listMaxHeight }]} keyboardShouldPersistTaps="handled">
          {sessions.map(item => {
            const parsed = parseAgentLabel(resolveSessionDisplayTitle(item) ?? item.title)
            const role = parsed.role ?? item.title ?? zhCN.sessions.child
            return (
              <Pressable
                key={item.sessionId}
                accessibilityRole="button"
                accessibilityLabel={`${role} ${parsed.task}`}
                onPress={() => onOpen(item)}
                style={({ pressed }) => [styles.subagentRow, pressed && styles.resendRowPressed]}
              >
                <View style={styles.teamRowCopy}>
                  <View style={styles.teamRowTitleLine}>
                    <Text style={styles.teamRowRole} numberOfLines={1}>{role}</Text>
                    {item.running
                      ? <Text style={styles.subagentRunning}>{zhCN.status.running}</Text>
                      : <Text style={styles.subagentIdle}>{zhCN.sessions.child}</Text>}
                  </View>
                  {parsed.task.length > 0 && (
                    <Text style={styles.teamRowTask} numberOfLines={2}>{parsed.task}</Text>
                  )}
                </View>
                <ChevronRight size={15} color={colors.subtle} />
              </Pressable>
            )
          })}
        </ScrollView>
      </ModalSurface>
    </Modal>
  )
}

/** Split a team member label into role and task ("你是X。任务：Y" / "You are X. Task: Y"). */
function parseAgentLabel(raw: string | undefined): { role?: string; task: string } {
  const text = (raw ?? '').replace(/\s+/gu, ' ').trim()
  const zh = /^你是(.+?)(?:。|，|,|：)(?:你的任务|任务)[：:]\s*(.+)$/u.exec(text)
  if (zh?.[1] !== undefined && zh[2] !== undefined) return { role: zh[1].trim(), task: zh[2].trim() }
  const en = /^You are (?:an?|the)\s+(.+?)(?:\.|。)\s*(?:Your task|Task)[：:]\s*(.+)$/iu.exec(text)
  if (en?.[1] !== undefined && en[2] !== undefined) return { role: en[1].trim(), task: en[2].trim() }
  return { task: text }
}

/** Agent-team popover: roster (role + claimed tasks per member) over the task board. */
export function TeamAgentPanel({ visible, members, tasks, sessions, onClose, onOpen }: {
  visible: boolean
  members: TeamMemberSnapshot[]
  tasks: TeamTaskSnapshot[]
  sessions: RemoteSession[]
  onClose: () => void
  onOpen: (session: RemoteSession) => void
}) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const listMaxHeight = usePickerListMaxHeight()
  const taskStatusLabel = (status: TeamTaskSnapshot['status']) => status === 'completed'
    ? zhCN.chat.teamTaskCompleted
    : status === 'in_progress'
      ? zhCN.chat.teamTaskInProgress
      : zhCN.chat.teamTaskPending
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <ModalSurface onClose={onClose}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{zhCN.chat.teamTitle(members.length)}</Text>
          <IconButton label={zhCN.common.close} icon={X} onPress={onClose} />
        </View>
        <ScrollView style={[styles.subagentList, { maxHeight: listMaxHeight }]} keyboardShouldPersistTaps="handled">
          {members.map(member => {
            const session = sessions.find(item => item.sessionId === member.id)
            // Role is the member's description; its open tasks are the board
            // rows the member owns (deleted rows never surface).
            const owned = tasks.filter(task => task.ownerId === member.id && task.status !== 'deleted')
            const active = owned.find(task => task.status === 'in_progress')
              ?? owned.find(task => task.status === 'pending')
              ?? owned[0]
            // Official member status (TeamMemberView.status): failed/provisioning
            // come from the durable phase; otherwise the LIVE agent decides
            // running vs inactive. Task progress is row content, not state.
            const liveRunning = session?.running === true
            const stateLabel = member.phase === 'failed'
              ? zhCN.chat.teamPhaseFailed
              : member.phase === 'provisioning'
                ? zhCN.chat.teamPhaseProvisioning
                : liveRunning
                  ? zhCN.status.running
                  : zhCN.chat.teamIdle
            const stateStyle = member.phase === 'failed'
              ? styles.subagentRunningFailed
              : member.phase === 'provisioning'
                ? styles.subagentProvisioning
                : liveRunning
                  ? styles.subagentRunning
                  : styles.subagentIdle
            // Wire rows may omit `description` despite the declared type — treat
            // every member field as possibly absent (this crashed the panel).
            const description = typeof member.description === 'string' ? member.description.trim() : ''
            const role = description.length > 0
              ? description
              : member.name === 'lead' ? zhCN.chat.teamLead
                : typeof member.name === 'string' && member.name.length > 0 ? member.name : member.id
            const row = (
              <View style={styles.teamRowCopy}>
                <View style={styles.teamRowTitleLine}>
                  <Text style={styles.teamRowRole} numberOfLines={1}>{role}</Text>
                  <Text style={stateStyle}>{stateLabel}</Text>
                </View>
                {active !== undefined && typeof active.subject === 'string' && (
                  <Text style={styles.teamRowTask} numberOfLines={2}>
                    {active.subject} · {taskStatusLabel(active.status)}
                  </Text>
                )}
                {owned.length > 1 && (
                  <Text style={styles.teamRowTask}>{zhCN.chat.teamMoreTasks(owned.length)}</Text>
                )}
                {member.phase === 'failed' && typeof member.error === 'string' && member.error.length > 0 && (
                  <Text style={styles.teamRowTask} numberOfLines={2}>{member.error}</Text>
                )}
              </View>
            )
            return session === undefined
              ? <View key={member.id} style={styles.subagentRow} accessibilityLabel={`${role} ${active?.subject ?? ''} ${stateLabel}`}>
                {row}
                <View style={{ width: 15 }} />
              </View>
              : <Pressable
                key={member.id}
                accessibilityRole="button"
                accessibilityLabel={`${role} ${active?.subject ?? ''} ${stateLabel}`}
                onPress={() => onOpen(session)}
                style={({ pressed }) => [styles.subagentRow, pressed && styles.resendRowPressed]}
              >
                {row}
                <ChevronRight size={15} color={colors.subtle} />
              </Pressable>
          })}
        </ScrollView>
      </ModalSurface>
    </Modal>
  )
}
