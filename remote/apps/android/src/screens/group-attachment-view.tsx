import { useEffect, useRef, useState } from 'react'
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { File, Paths } from 'expo-file-system'
import { getContentUriAsync } from 'expo-file-system/legacy'
import * as IntentLauncher from 'expo-intent-launcher'
import { Download, FileText, X } from 'lucide-react-native'
import { callGroupBot, getGroupConnectionScope } from '../state/store'
import { readGroupAttachment } from '../services/group-attachment'
import { Button, IconButton } from '../ui/components'
import { useTheme } from '../ui/theme-context'
import type { GroupAttachment } from './group-types'
import { throwIfAborted } from '../services/abort-signal'

export function GroupAttachmentView({ roomId, seq, attachment, image = false, zh }: { roomId: string; seq: number; attachment: GroupAttachment; image?: boolean; zh: boolean }) {
  const { colors } = useTheme()
  const [uri, setUri] = useState<string>()
  const [preview, setPreview] = useState(false)
  const [progress, setProgress] = useState<number>()
  const [error, setError] = useState('')
  const controller = useRef<AbortController | undefined>(undefined)
  useEffect(() => () => controller.current?.abort(), [])
  async function load(open = false) {
    if (progress !== undefined) return
    const signalController = new AbortController()
    controller.current = signalController
    const scope = getGroupConnectionScope()
    setProgress(0); setError('')
    try {
      let saved = uri
      if (!saved) {
        const bytes = await readGroupAttachment((payload, signal) => {
          if (scope !== getGroupConnectionScope()) throw new Error('Connection changed')
          return callGroupBot('earlier', payload, signal)
        }, roomId, seq, attachment, signalController.signal, received => setProgress(Math.round(attachment.bytes ? received / attachment.bytes * 100 : 100)))
        throwIfAborted(signalController.signal)
        if (scope !== getGroupConnectionScope()) return
        const leaf = (attachment.name ?? 'attachment').replace(/[\\/:*?"<>|\u0000-\u001f]/gu, '_').slice(-100)
        const file = new File(Paths.cache, `group-${Date.now()}-${leaf}`)
        file.write(bytes)
        saved = file.uri
        setUri(saved)
      }
      if (open) {
        if (image) setPreview(true)
        else await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: await getContentUriAsync(saved), type: attachment.mediaType ?? mimeOf(attachment.name), flags: 1 })
      }
    } catch (cause) {
      if (!signalController.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause))
    } finally { if (!signalController.signal.aborted) setProgress(undefined) }
  }
  return <View style={{ marginVertical: 5, minWidth: 160, maxWidth: 240, gap: 5 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={attachment.name ?? (zh ? '图片附件' : 'Image attachment')} onPress={() => { void load(true) }} style={{ padding: image && uri ? 0 : 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, gap: 6 }}>
      {image && uri ? <Image source={{ uri }} style={{ width: 215, height: 155, maxWidth: '100%', borderRadius: 8 }} resizeMode="contain" /> : <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><FileText size={24} color={colors.primary} /><Text numberOfLines={2} style={{ flex: 1, color: colors.ink, fontSize: 13 }}>{attachment.name ?? (zh ? '图片' : 'Image')}</Text><Download size={16} color={colors.muted} /></View>}
      {!uri && <Text style={{ color: colors.muted, fontSize: 11 }}>{(attachment.bytes / 1024).toFixed(1)} KiB · {zh ? '点击加载并打开' : 'Tap to load and open'}</Text>}
    </Pressable>
    {progress !== undefined && <View><Text style={{ color: colors.muted, fontSize: 12 }}>{progress}%</Text><Button variant="quiet" label={zh ? '取消' : 'Cancel'} onPress={() => { controller.current?.abort(); setProgress(undefined) }} /></View>}
    {!!error && <Text selectable style={{ color: colors.danger, fontSize: 12 }}>{error}</Text>}
    <Modal visible={preview} transparent onRequestClose={() => setPreview(false)}><View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 36 }}><IconButton label={zh ? '关闭' : 'Close'} icon={X} onPress={() => setPreview(false)} /><ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>{uri && <Image source={{ uri }} style={{ width: '100%', height: 500 }} resizeMode="contain" />}</ScrollView></View></Modal>
  </View>
}

function mimeOf(name = '') {
  const extension = name.split('.').at(-1)?.toLowerCase() ?? ''
  return ({ pdf: 'application/pdf', txt: 'text/plain', md: 'text/plain', csv: 'text/csv', json: 'application/json', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } as Record<string, string>)[extension] ?? 'application/octet-stream'
}
