export interface GroupBot {
  id: string
  name: string
  role?: string
  color?: string
  avatar?: { image?: string; shape?: string }
  runtime?: unknown
}

export interface GroupRoom {
  id: string
  name: string
  members: string[]
  notice?: string
  admin?: string
  mode?: string
  maxTurns?: number
  workDir?: string
  permission?: string
  preview?: unknown
  named?: boolean
  pinned?: boolean
  hidden?: boolean
}

export interface GroupAttachment { attachmentId: string; name?: string; bytes: number; mediaType?: string; width?: number; height?: number }
export interface GroupEntry { seq: number; who: string; botId?: string; text: string; length?: number; displayText?: string; displayLength?: number; time?: number | string; kind?: string; images?: GroupAttachment[]; files?: GroupAttachment[] }
export interface GroupApproval { id: string; botId: string; roomId?: string; tool?: string; reason?: string; detail?: { text?: string; code?: string }; answerable?: boolean }
export interface GroupWork { botId: string; since?: number; tool?: string; text?: string }
export interface GroupState {
  bots: GroupBot[]
  rooms: GroupRoom[]
  readOnly?: string | null
  permissions?: { defaultPreset?: string; options: Array<{ value: string; name?: string; label?: string; description?: string }> } | null
  work?: { rooms?: Record<string, GroupWork[]>; approvals?: GroupApproval[] }
}
