import { create } from 'zustand'
import { getActiveLanguage } from '../locales/i18n'
import { createAccountActions } from './account-actions'
import { createConnectionActions } from './connection-actions'
import { createPreferenceActions } from './preference-actions'
import { createPromptActions } from './prompt-actions'
import { createSessionActions } from './session-actions'
import { createSessionEventActions } from './session-event-actions'
import { SessionRuntime } from './session-runtime'
import type { AppState } from './store-state'
import { disconnected } from './store-state'
import { createWorkspaceActions } from './workspace-actions'

const runtime: SessionRuntime = new SessionRuntime({
  get: (): AppState => useAppStore.getState(),
  set: partial => useAppStore.setState(partial),
})

/** Only exposes the authenticated native carrier of the current connection. */
export const requireSessionTools = (sessionId?: string) => runtime.connection.requireSessionTools(sessionId)

export const getGroupConnectionScope = () => `${runtime.connectionGeneration}:${useAppStore.getState().selectedDevice?.deviceId ?? ''}`
export async function uploadGroupFile(
  request: import('../services/workspace-upload').WorkspaceUploadRequest,
  signal?: AbortSignal,
  onProgress?: (progress: import('../services/workspace-upload').WorkspaceUploadProgress) => void,
) {
  const scope = getGroupConnectionScope()
  if (useAppStore.getState().connection.phase !== 'connected') throw new Error('Connect to your computer before uploading files.')
  const result = await runtime.connection.uploadWorkspace(request, signal, progress => {
    if (scope === getGroupConnectionScope()) onProgress?.(progress)
  })
  if (scope !== getGroupConnectionScope() || useAppStore.getState().connection.phase !== 'connected') throw new Error('The connection changed. Reopen group chats.')
  return result
}
export async function callGroupBot<T = unknown>(endpoint: string, payload?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const scope = getGroupConnectionScope()
  if (useAppStore.getState().connection.phase !== 'connected') throw new Error('Connect to your computer before opening group chats.')
  const result = await runtime.connection.callGroupBot<T>(endpoint, payload, signal)
  if (scope !== getGroupConnectionScope() || useAppStore.getState().connection.phase !== 'connected') throw new Error('The connection changed. Reopen group chats.')
  return result
}

export const useAppStore = create<AppState>((set, get) => ({
  ...createConnectionActions({ set, get, runtime }),
  ...createSessionActions({ set, get, runtime }),
  ...createPromptActions({ set, get, runtime }),
  ...createSessionEventActions({ set, get, runtime }),
  ...createAccountActions({ set, get }),
  ...createPreferenceActions({ set, get }),
  ...createWorkspaceActions({
    set, get, connection: runtime.connection,
    getConnectionGeneration: () => runtime.connectionGeneration,
    closeActiveCursorStream: notifyRemote => runtime.closeActiveCursorStream(notifyRemote),
  }),
  bootPhase: 'loading',
  devices: [],
  connection: disconnected,
  connectionProbeOrder: [],
  codexAvailable: false,
  cursorAvailable: false,
  antigravityAvailable: false,
  piAvailable: false,
  opencodeAvailable: false,
  claudeAvailable: false,
  workspaces: [],
  favoriteWorkspaces: [],
  recentWorkspaces: [],
  archivedSessionIds: [],
  sessions: [],
  currentWorkSessionIds: [],
  messages: {},
  sessionLifecycles: {},
  sessionProjectionSeqs: {},
  feedbackBySession: {},
  modelSelecting: false,
  permissionSelecting: false,
  agentPresetOptions: undefined,
  agentPresetLoading: false,
  agentPresetSelecting: false,
  historyHasMore: false,
  historyLoadingOlder: false,
  transportPreference: 'auto',
  languagePreference: 'system',
  language: getActiveLanguage(),
  themePreference: 'system',
  defaultPermissionPreset: 'default',
  authPhase: 'idle',
  refreshing: false,
  reauthRequired: false,
  clearError() {
    set({ error: undefined })
  },
}))
