import type { RemoteClientCore } from '@dsh-remote/client-core'

const operations = new Set(['state', 'earlier', 'create-room', 'update-room', 'delete-room', 'set-flags', 'send', 'room-progress', 'approval-answer', 'stop-member-work'])
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Uses the same pinned, authenticated Noise channel as ordinary Remote sessions. */
export async function callGroupRoute<T>(core: RemoteClientCore, endpoint: string, payload: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  if (!operations.has(endpoint)) throw new Error('Unsupported group operation')
  if (endpoint === 'approval-answer' && payload.choice !== 'allow' && payload.choice !== 'reject') throw new Error('Choose a one-time approval or rejection')
  const result = await core.rpc<unknown, { route: string; body: unknown }>('plugin.route.call', { route: 'api/bot', body: { endpoint, payload } }, signal)
  if (!record(result) || typeof result.status !== 'number') throw new Error('Invalid group response from this Host')
  if (result.status === 404) throw new Error('Enable the group chat plugin on the connected computer, then reconnect.')
  if (result.status < 200 || result.status >= 300) throw new Error(`Group request failed (HTTP ${result.status})`)
  const body = result.json
  if (!record(body) || typeof body.ok !== 'boolean') throw new Error('Invalid group response from this Host')
  if (!body.ok) {
    const message = record(body.error) && typeof body.error.message === 'string' ? body.error.message : 'The Host refused the group request'
    throw new Error(message)
  }
  return body.value as T
}
