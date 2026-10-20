import { describe, expect, it, vi } from 'vitest'
import type { RemoteClientCore } from '@dsh-remote/client-core'
import { callGroupRoute } from '../src/services/group-bot'
import { PluginRouteBridge } from '../../../packages/plugin/src/plugin-route-bridge'

describe('Android group route contract', () => {
  it('uses the released Host allowlist for history, sends and one-time approval', async () => {
    const dispatch = vi.fn(async (_route: string, body: unknown) => ({ status: 200, json: { ok: true, value: body } }))
    const bridge = new PluginRouteBridge(dispatch)
    const rpc = vi.fn(async (method: string, params: unknown) => {
      expect(method).toBe('plugin.route.call')
      return bridge.call(params)
    })
    const core = { rpc } as unknown as RemoteClientCore
    for (const [endpoint, payload] of [
      ['earlier', { roomId: 'room-1' }], ['send', { sessionId: 'room-1', text: '@Hermes hello' }],
      ['approval-answer', { id: 'approval-1', choice: 'allow' }],
      ['update-room', { id: 'room-1', notice: 'Shared instructions', add: ['bot-2'], admin: 'bot-2', maxTurns: 4 }],
      ['set-flags', { id: 'room-1', pinned: true }], ['delete-room', { id: 'room-1' }],
    ] as const) {
      expect(await callGroupRoute(core, endpoint, payload)).toEqual({ endpoint, payload })
    }
    expect(dispatch).toHaveBeenCalledTimes(6)
    await expect(callGroupRoute(core, 'provider-key', { value: 'not-a-secret' })).rejects.toThrow('Unsupported')
    await expect(callGroupRoute(core, 'approval-answer', { choice: 'allow-always' })).rejects.toThrow('one-time')
    expect(dispatch).toHaveBeenCalledTimes(6)
  })

  it('preserves abort, missing-plugin and refused-request outcomes', async () => {
    const signal = new AbortController().signal
    const rpc = vi.fn().mockResolvedValue({ status: 404, json: {} })
    const core = { rpc } as unknown as RemoteClientCore
    await expect(callGroupRoute(core, 'state', {}, signal)).rejects.toThrow('Enable the group chat plugin')
    expect(rpc.mock.calls[0]?.[2]).toBe(signal)
    for (const [value, reason] of [
      [{ status: 200, json: { ok: false, error: { message: 'Read-only team' } } }, 'Read-only team'],
      [{ status: 503, json: {} }, '503'], [{ status: 200, json: {} }, 'Invalid group response'],
    ] as const) {
      rpc.mockResolvedValueOnce(value)
      await expect(callGroupRoute(core, 'state')).rejects.toThrow(reason)
    }
    rpc.mockRejectedValueOnce(new Error('RPC_ABORTED'))
    await expect(callGroupRoute(core, 'state', {}, signal)).rejects.toThrow('RPC_ABORTED')
  })
})
