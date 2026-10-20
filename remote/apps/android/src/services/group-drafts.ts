import { File, Paths } from 'expo-file-system'

export function groupDraftKey(server: string, account: string, host: string, room: string): string {
  return JSON.stringify([server.replace(/\/+$/, ''), account, host, room])
}

export function decodeGroupDrafts(value: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  } catch { return {} }
}

// App-private documents survive screen unmount and process restart; no model/connection secret is stored.
export function loadGroupDrafts(): Record<string, string> {
  const file = new File(Paths.document, 'group-drafts-v1.json')
  return file.exists ? decodeGroupDrafts(file.textSync()) : {}
}

export function saveGroupDrafts(drafts: Record<string, string>): void {
  const file = new File(Paths.document, 'group-drafts-v1.json')
  if (!file.exists) file.create()
  file.write(JSON.stringify(Object.fromEntries(Object.entries(drafts).filter(([, text]) => text !== ''))))
}
