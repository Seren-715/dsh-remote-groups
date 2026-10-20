import { RemoteClientCore } from '@dsh-remote/client-core'
import type { RemoteWorkspaceView } from './client-runtime-contract.js'
import { ClientModeError, isRecord } from './client-runtime-contract.js'
import { uuidV7 } from './ids.js'
import { RemoteTypertGateway } from './remote-typert-gateway.js'
import type { TypertGatewayLike } from './typert-gateway-contract.js'

export async function invokeRemoteCommand(
  client: RemoteClientCore,
  request: Parameters<TypertGatewayLike['invoke']>[0],
): Promise<unknown> {
  const rpcId = uuidV7()
  const response = await client.rpc<{ rpcId: string; result: unknown }>('harness.api.call', {
    method: `${request.namespace}.${request.method}`,
    rpcId,
    payload: request.args,
  }, request.signal)
  if (response.rpcId !== rpcId) {
    throw new ClientModeError('INVALID_MESSAGE', 'The remote Host returned an invalid command response.')
  }
  return unwrapNativeResult(response)
}

export async function readRemoteWorkspaceBaseline(
  gateway: RemoteTypertGateway,
  signal?: AbortSignal,
): Promise<RemoteWorkspaceView[]> {
  const lifetime = new AbortController()
  const activeSignal = signal === undefined
    ? lifetime.signal
    : AbortSignal.any([signal, lifetime.signal])
  const source = await gateway.open('workspace/follow', { args: {} }, activeSignal)
  const iterator = source[Symbol.asyncIterator]()
  try {
    const first = await iterator.next()
    if (first.done || !isRecord(first.value) || first.value.type !== 'baseline'
      || !isRecord(first.value.value) || !Array.isArray(first.value.value.items)) {
      throw new ClientModeError('INVALID_MESSAGE', 'The remote Host returned an invalid Workspace baseline.')
    }
    return first.value.value.items.map((item: unknown) => {
      if (!isRecord(item) || typeof item.workspaceId !== 'string'
        || typeof item.path !== 'string' || typeof item.title !== 'string') {
        throw new ClientModeError('INVALID_MESSAGE', 'The remote Host returned an invalid Workspace row.')
      }
      return { workspaceId: item.workspaceId, path: item.path, title: item.title }
    })
  } finally {
    lifetime.abort('workspace-baseline-read')
    await iterator.return?.()
  }
}

export function unwrapNativeResult<T>(response: { result: unknown }): T {
  const result = response.result
  if (typeof result !== 'object' || result === null || !('ok' in result)) {
    throw new ClientModeError('INVALID_MESSAGE', 'The remote Host returned an invalid response.')
  }
  if (result.ok !== true || !('value' in result)) {
    const message = 'error' in result && typeof result.error === 'object' && result.error !== null
      && 'message' in result.error && typeof result.error.message === 'string'
      ? result.error.message
      : 'The remote Host rejected the request.'
    throw new ClientModeError('REMOTE_API_ERROR', message)
  }
  return result.value as T
}

export function workspaceRecordId(value: unknown): string {
  if (typeof value !== 'object' || value === null || !('workspaceId' in value)
    || typeof value.workspaceId !== 'string' || value.workspaceId.length === 0) {
    throw new ClientModeError('INVALID_MESSAGE', 'The remote Host returned an invalid Workspace.')
  }
  return value.workspaceId
}

export function remoteWorkspaceTitle(path: string): string {
  const normalized = path.replace(/[\\/]+$/u, '')
  return normalized.split(/[\\/]+/u).filter(Boolean).at(-1) ?? path
}
