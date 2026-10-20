import { reduceCodexTimelineFrame } from '@dsh-remote/client-core'
import { strings as zhCN } from '../locales/i18n'
import {
  codexItemsToChat,
  codexPermissionPresetFromResponse,
  mergeCodexLive,
  updateCodexSession,
  withCodexPermission,
} from '../services/codex'
import { applyCursorFrame, cursorNativeId } from '../services/cursor'
import type { ChatItem, RemoteSession } from '../types'
import { applyMuxFrameToMessages, sessionRunningForMuxFrame } from './event-reducer'
import { inboxRpcIds } from './message-helpers'
import type { SessionAccess } from './session-runtime'
import { isHarnessPromptStarted, isRecord, record } from './session-state'
import type { AppState } from './store-state'

/** SessionEvent actions use the store's single connection/session runtime. */
export function createSessionEventActions({ get, set, runtime }: SessionAccess): Pick<AppState,
  'handleMuxFrame' | 'handleCodexFrame' | 'handleCursorFrame'> {
  return {
    handleMuxFrame(frame) {
      set(state => {
        const sessionId = frame.payload.sessionId
        if (frame.payload.type === 'session/projection' && sessionId !== undefined && typeof frame.payload.key === 'string') {
          const { key, value, seq } = frame.payload
          const previous = state.sessionProjectionSeqs[sessionId]?.[key]
          if (seq !== undefined && previous !== undefined && seq < previous) return {}
          const update = (session: RemoteSession): RemoteSession => session.sessionId !== sessionId ? session : {
            ...session,
            projections: { ...session.projections, values: { ...session.projections?.values, [key]: value } },
          }
          // Distinguish "never received" from "received and then dropped": an
          // rpcId the inbox adopted is marked on its local row and must never
          // re-enter the queue fallback. If it later vanishes from the inbox
          // without its echo replacing the row (removed elsewhere), the Host
          // dropped it — retire the row after one update of grace so a consumed
          // prompt's echo can land first.
          const settle = key === 'inbox' ? (() => {
            const followed = state.selectedSession?.sessionId === sessionId
            const current = new Set(inboxRpcIds(value))
            const adopted = runtime.adoptedQueueRpcIds.get(sessionId) ?? new Set<string>()
            const vanishing = runtime.vanishingQueueRpcIds.get(sessionId) ?? new Set<string>()
            const retire = new Set<string>()
            const mark = new Set<string>()
            for (const rpcId of current) {
              if (!adopted.has(rpcId)) mark.add(rpcId)
              adopted.add(rpcId)
              vanishing.delete(rpcId)
            }
            // Retire only while the session is followed: its echo travels the
            // follow stream whose ordering against the control projection is not
            // guaranteed elsewhere — unfollowed sessions are reconciled on open.
            for (const rpcId of followed ? [...adopted] : []) {
              if (current.has(rpcId)) continue
              if (vanishing.has(rpcId)) {
                // Retired: the row is settled (or already replaced by its echo) —
                // forget the rpcId so it stops re-entering the retire path on
                // every following projection update.
                retire.add(rpcId)
                adopted.delete(rpcId)
                vanishing.delete(rpcId)
              } else vanishing.add(rpcId)
            }
            runtime.adoptedQueueRpcIds.set(sessionId, adopted)
            runtime.vanishingQueueRpcIds.set(sessionId, vanishing)
            if (mark.size === 0 && retire.size === 0) return undefined
            return (items: ChatItem[]): ChatItem[] => items.map(item =>
              item.kind === 'message' && item.requestRpcId !== undefined
                && (mark.has(item.requestRpcId) || (retire.has(item.requestRpcId)
                  && (item.sendState === 'queued' || item.sendState === 'unconfirmed' || item.sendState === 'failed')))
                ? {
                  ...item,
                  ...(mark.has(item.requestRpcId) ? { queuedAdopted: true as const } : {}),
                  ...(retire.has(item.requestRpcId) ? { sendState: 'canceled' as const } : {}),
                }
                : item)
          })() : undefined
          return {
            sessions: state.sessions.map(update),
            selectedSession: state.selectedSession === undefined ? undefined : update(state.selectedSession),
            ...(settle === undefined ? {} : {
              messages: {
                ...state.messages,
                [sessionId]: settle(state.messages[sessionId] ?? []),
              },
            }),
            ...(seq === undefined ? {} : {
              sessionProjectionSeqs: {
                ...state.sessionProjectionSeqs,
                [sessionId]: { ...state.sessionProjectionSeqs[sessionId], [key]: seq },
              }
            }),
          }
        }
        const running = sessionRunningForMuxFrame(frame)
        const seq = frame.payload.event?.seq
        const previousLifecycle = sessionId === undefined ? undefined : state.sessionLifecycles[sessionId]
        if (running !== undefined && seq !== undefined && previousLifecycle !== undefined && seq < previousLifecycle.seq) return {}
        const releasePrompt = state.busyAction === 'send-message'
          && sessionId !== undefined
          && state.selectedSession?.sessionId === sessionId
          && (isHarnessPromptStarted(frame) || running !== undefined)
        // Row status marks mirror the official session dots: a finished turn
        // leaves a "done" reminder (green) until the session is opened; a failed
        // turn leaves the red mark instead.
        const turnReason = running === false && frame.payload.event?.type === 'turn/end'
          ? frame.payload.event.data.reason
          : undefined
        const finishedMark = running === undefined ? undefined
          : running ? undefined
            : isRecord(turnReason) && (turnReason.kind === 'failed' || turnReason.kind === 'error') ? 'failed' as const
              : turnReason === undefined ? undefined : 'completed' as const
        const updateRunning = (session: RemoteSession): RemoteSession => (
          sessionId !== undefined && running !== undefined && session.sessionId === sessionId
            ? { ...session, running }
            : session
        )
        return {
          messages: applyMuxFrameToMessages(state.messages, frame),
          ...(sessionId === undefined || running === undefined ? {} : {
            sessions: state.sessions.map(updateRunning),
            selectedSession: state.selectedSession === undefined ? undefined : updateRunning(state.selectedSession),
            ...(seq === undefined ? {} : {
              sessionLifecycles: {
                ...state.sessionLifecycles,
                [sessionId]: {
                  seq,
                  running,
                  ...(frame.payload.event?.data.turn === undefined ? {} : { turn: String(frame.payload.event.data.turn) }),
                  ...(finishedMark === undefined ? {} : { finished: finishedMark }),
                },
              }
            }),
          }),
          ...(releasePrompt ? { busyAction: undefined } : {}),
        }
      })
    },

    handleCodexFrame(frame) {
      const timeline = runtime.activeCodexTimeline
      if (timeline === undefined) return
      const framePermission = codexPermissionPresetFromResponse(record(frame).params)
      const next = reduceCodexTimelineFrame(timeline, frame)
      runtime.activeCodexTimeline = next
      const live = codexItemsToChat(next.items)
      set(state => {
        const current = state.sessions.find(item => item.sessionId === next.session.id)
          ?? state.selectedSession
        if (current === undefined || current.backend !== 'codex') return {}
        const session = framePermission === undefined
          ? updateCodexSession(current, next.session)
          : withCodexPermission(updateCodexSession(current, next.session), framePermission)
        return {
          sessions: state.sessions.map(item => item.sessionId === session.sessionId ? session : item),
          selectedSession: state.selectedSession?.sessionId === session.sessionId ? session : state.selectedSession,
          messages: {
            ...state.messages,
            [session.sessionId]: mergeCodexLive(state.messages[session.sessionId] ?? [], live),
          },
        }
      })
    },

    handleCursorFrame(frame) {
      const session = get().selectedSession
      if (session === undefined || (session.backend !== 'cursor' && session.backend !== 'antigravity' && session.backend !== 'pi' && session.backend !== 'opencode' && session.backend !== 'claude')) return
      const params = isRecord(frame.frame.params) ? frame.frame.params : undefined
      if (params?.sessionId !== undefined && params.sessionId !== cursorNativeId(session)) return
      const update = params === undefined
        ? undefined
        : (isRecord(params.update) ? params.update : params)
      let kind: string | undefined
      if (update !== undefined && typeof update.sessionUpdate === 'string') {
        kind = update.sessionUpdate
        const catchUpCount = Array.isArray(update.catchUp) ? update.catchUp.length : 0
        // Diagnostic only: kind + catch-up size, never prompt or tool payloads.
        console.info('[dsh-remote] acp frame:', session.backend, kind, catchUpCount > 0 ? `catchUp=${catchUpCount}` : '')
      }
      set(state => ({
        messages: {
          ...state.messages,
          [session.sessionId]: applyCursorFrame(state.messages[session.sessionId] ?? [], session.sessionId, frame),
        },
        ...(kind === 'prompt_completed' || kind === 'prompt_failed'
          ? {
            sessions: state.sessions.map(item => item.sessionId === session.sessionId ? { ...item, running: false } : item),
            selectedSession: state.selectedSession?.sessionId === session.sessionId
              ? { ...state.selectedSession, running: false }
              : state.selectedSession,
            ...(kind === 'prompt_failed'
              ? { error: session.backend === 'claude' ? zhCN.runtime.claudeUnavailable : session.backend === 'opencode' ? zhCN.runtime.opencodeUnavailable : session.backend === 'pi' ? zhCN.runtime.piUnavailable : session.backend === 'antigravity' ? zhCN.runtime.antigravityUnavailable : zhCN.runtime.cursorUnavailable }
              : {}),
          }
          : {}),
      }))
      if (session.backend === 'antigravity' && kind === 'prompt_completed') void runtime.refreshAntigravityCatalog()
      if (session.backend === 'pi' && kind === 'prompt_completed') void runtime.refreshPiCatalog()
      if (session.backend === 'opencode' && kind === 'prompt_completed') void runtime.refreshOpencodeCatalog()
      if (session.backend === 'claude' && kind === 'prompt_completed') void runtime.refreshClaudeCatalog()
    },
  }
}
