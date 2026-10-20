import { Image, ScrollView, Text, View } from 'react-native'
import { FileText, X } from 'lucide-react-native'
import { randomUUID } from 'expo-crypto'
import type { WorkspaceUploadResult } from '../services/workspace-upload'
import { IconButton } from '../ui/components'
import { useTheme } from '../ui/theme-context'

export interface GroupAttachmentDraft {
  id: string
  uri: string
  name: string
  uploadName: string
  bytes: number
  kind: 'image' | 'file'
  mediaType?: string
  receipt?: WorkspaceUploadResult
}

export function groupAttachmentDraft(input: Omit<GroupAttachmentDraft, 'id' | 'uploadName'>): GroupAttachmentDraft {
  const id = randomUUID()
  const leaf = input.name.split(/[\\/]/u).at(-1)?.replace(/[\\/:*?"<>|\u0000-\u001f]/gu, '_').replace(/[. ]+$/u, '').slice(-120) || 'file'
  return { ...input, name: leaf, id, uploadName: `dsh-${id}-${leaf}` }
}

export function validateGroupAttachments(items: GroupAttachmentDraft[], zh: boolean): string | undefined {
  if (items.length > 8) return zh ? '每条消息最多添加 8 个附件。' : 'Add up to 8 attachments per message.'
  const images = items.filter(item => item.kind === 'image')
  if (images.length > 4) return zh ? '每条消息最多添加 4 张图片。' : 'Add up to 4 images per message.'
  if (items.some(item => !Number.isFinite(item.bytes) || item.bytes < 0 || item.bytes > 20 * 1024 * 1024)) return zh ? '每个附件不能超过 20 MiB。' : 'Each attachment must be at most 20 MiB.'
  if (images.reduce((sum, item) => sum + item.bytes, 0) > 30 * 1024 * 1024) return zh ? '图片总大小不能超过 30 MiB。' : 'Images must total at most 30 MiB.'
  return undefined
}

export function GroupAttachmentDrafts({ items, disabled, zh, onRemove }: { items: GroupAttachmentDraft[]; disabled: boolean; zh: boolean; onRemove: (id: string) => void }) {
  const { colors } = useTheme()
  return <ScrollView horizontal keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, padding: 10 }}>
    {items.map(item => <View key={item.id} style={{ width: 108, padding: 6, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {item.kind === 'image' ? <Image accessibilityLabel={item.name} source={{ uri: item.uri }} style={{ width: 52, height: 52, borderRadius: 6 }} /> : <FileText size={32} color={colors.primary} />}
        <IconButton label={zh ? `移除 ${item.name}` : `Remove ${item.name}`} icon={X} disabled={disabled} onPress={() => onRemove(item.id)} />
      </View>
      <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 12 }}>{item.name}</Text>
      <Text style={{ color: colors.muted, fontSize: 11 }}>{item.bytes >= 1048576 ? `${(item.bytes / 1048576).toFixed(1)} MiB` : `${Math.ceil(item.bytes / 1024)} KiB`}{item.receipt ? zh ? ' · 已上传' : ' · Uploaded' : ''}</Text>
    </View>)}
  </ScrollView>
}
