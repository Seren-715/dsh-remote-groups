import { useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { X } from 'lucide-react-native'
import { Button, IconButton } from '../ui/components'
import { useTheme } from '../ui/theme-context'
import type { GroupApproval } from './group-types'

/** Lives outside the message list so an approval stays visible while reading history. */
export function GroupApprovals({ items, botName, zh, disabled, onAnswer }: {
  items: GroupApproval[]; botName: (id: string) => string; zh: boolean; disabled: boolean
  onAnswer: (id: string, choice: 'allow' | 'reject') => void
}) {
  const { colors } = useTheme()
  const { height } = useWindowDimensions()
  const [detailId, setDetailId] = useState<string>()
  const detail = items.find(item => item.id === detailId)
  const actions = (item: GroupApproval) => <View style={styles.actions}>
    <Button label={zh ? '允许一次' : 'Allow once'} disabled={disabled || !item.answerable} onPress={() => onAnswer(item.id, 'allow')} />
    <Button label={zh ? '拒绝' : 'Reject'} variant="danger" disabled={disabled || !item.answerable} onPress={() => onAnswer(item.id, 'reject')} />
    {!item.answerable && <Text style={{ color: colors.muted }}>{zh ? '请在电脑处理' : 'Handle on computer'}</Text>}
  </View>
  if (!items.length) return null
  return <View style={[styles.dock, { backgroundColor: colors.surface, borderColor: colors.warning, maxHeight: Math.min(260, height * .34) }]}>
    <Text accessibilityLiveRegion="polite" style={[styles.title, { color: colors.warning }]}>{zh ? `待审批 · ${items.length}` : `Approval required · ${items.length}`}</Text>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.cards}>
      {items.map(item => <View key={item.id} style={styles.card}>
        <Pressable accessibilityRole="button" accessibilityLabel={zh ? '查看审批详情' : 'Approval details'} onPress={() => setDetailId(item.id)}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.ink }]}>{botName(item.botId)} · {item.tool || (zh ? '请求权限' : 'Permission request')}</Text>
          <Text numberOfLines={2} style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{item.detail?.text || item.detail?.code || item.reason || (zh ? '点击查看详情' : 'Tap for details')}</Text>
          <Text style={{ color: colors.primary, fontSize: 12 }}>{zh ? '查看详情' : 'View details'}</Text>
        </Pressable>
        {actions(item)}
      </View>)}
    </ScrollView>
    <Modal visible={detail !== undefined} transparent animationType="fade" onRequestClose={() => setDetailId(undefined)}>
      <View style={[styles.backdrop, { backgroundColor: colors.modalBackdrop }]}>
        <View style={[styles.dialog, { backgroundColor: colors.surface, maxHeight: height * .8 }]}>
          <View style={styles.header}><Text style={[styles.title, { color: colors.ink, flex: 1 }]}>{detail && botName(detail.botId)} · {zh ? '审批详情' : 'Approval details'}</Text><IconButton label={zh ? '关闭' : 'Close'} icon={X} onPress={() => setDetailId(undefined)} /></View>
          <ScrollView contentContainerStyle={styles.cards}>{detail && [detail.tool, detail.detail?.text, detail.detail?.code, detail.reason].filter(Boolean).map((text, i) => <Text selectable key={i} style={{ color: colors.ink, fontSize: 15, lineHeight: 23 }}>{text}</Text>)}</ScrollView>
          {detail && actions(detail)}
        </View>
      </View>
    </Modal>
  </View>
}

const styles = StyleSheet.create({
  dock: { flexShrink: 0, borderBottomWidth: 1, borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 6 },
  cards: { gap: 10, paddingBottom: 8 }, card: { gap: 5 },
  title: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  backdrop: { flex: 1, justifyContent: 'center', padding: 16 },
  dialog: { padding: 12, borderRadius: 16, width: '100%', maxWidth: 760, alignSelf: 'center', gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center' },
})
