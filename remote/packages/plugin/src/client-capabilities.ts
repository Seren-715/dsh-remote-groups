import { RemoteClientCore, remoteWorkspaceTypeAvailable } from '@dsh-remote/client-core'
import { parseRemoteWorkspaceTypes } from '@dsh-remote/protocol'
import type { RemoteHostFeatures } from './client-runtime-contract.js'
import { ClientModeError, isRecord } from './client-runtime-contract.js'

const REMOTE_COMMAND_LIST_MIN_VERSION = [0, 3, 16] as const

const REMOTE_FILE_VIEWER_MIN_VERSION = [0, 3, 17] as const

/** Conservative feature profile for Hosts that predate fine-grained capability discovery. */
export function remoteHostFeatures(clientVersion?: string): RemoteHostFeatures {
  return {
    commandList: isVersionAtLeast(clientVersion, REMOTE_COMMAND_LIST_MIN_VERSION),
    fileViewer: isVersionAtLeast(clientVersion, REMOTE_FILE_VIEWER_MIN_VERSION),
    terminal: false,
    apiProxy: true,
    remoteGateway: false,
    codex: false,
    cursor: false,
    antigravity: false,
    opencode: false,
    pluginRoute: false,
  }
}

export async function probeRemoteHostFeatures(
  client: RemoteClientCore,
  clientVersion?: string,
): Promise<RemoteHostFeatures> {
  const fallback = remoteHostFeatures(clientVersion)
  let value: unknown
  try {
    value = await client.rpc('harness.transport.describe', {})
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'METHOD_NOT_FOUND') return fallback
    throw error
  }
  if (!isRecord(value) || !Array.isArray(value.capabilities)
    || value.capabilities.some(capability => typeof capability !== 'string')) {
    throw new ClientModeError('INVALID_MESSAGE', 'The remote Host returned invalid transport capabilities.')
  }
  const capabilities = new Set(value.capabilities as string[])
  const apiProxy = capabilities.has('harness.api.v1')
  const remoteV1 = capabilities.has('harness.remote.v1')
  const remoteV3 = capabilities.has('harness.remote.v3')
  const terminal = capabilities.has('harness.terminal.v1')
  const workspaceTypes = 'workspaceTypes' in value ? parseRemoteWorkspaceTypes(value.workspaceTypes) : undefined
  const available = (id: string, capability: string) => remoteWorkspaceTypeAvailable(value.capabilities as string[], workspaceTypes, id, capability)
  const codex = available('codex', 'codex.appserver.v1')
  const cursor = available('cursor', 'agent.acp.cursor.v1')
  const antigravity = available('antigravity', 'agent.acp.antigravity.v1')
  const pi = available('pi', 'agent.acp.pi.v1')
  const claude = available('claude', 'agent.acp.claude.v1')
  const opencode = available('opencode', 'agent.acp.opencode.v1')
  if (remoteV1 && remoteV3) {
    throw new ClientModeError('INVALID_MESSAGE', 'The remote Host advertised conflicting Harness Session formats.')
  }
  const sessionFormat = remoteV3 ? 3 as const : undefined
  const remoteGateway = remoteV3 || remoteV1
  if (!apiProxy && !remoteGateway && !codex && !cursor && !antigravity && !pi && !opencode && !claude) {
    throw new ClientModeError('FEATURE_NOT_SUPPORTED', 'The remote Host exposes no supported Harness transport.')
  }
  return {
    commandList: remoteGateway || (apiProxy && fallback.commandList),
    fileViewer: capabilities.has('fileviewer.read.v1'),
    terminal,
    apiProxy,
    remoteGateway,
    ...(sessionFormat === undefined ? {} : { sessionFormat }),
    codex,
    cursor,
    antigravity,
    ...(pi ? { pi: true } : {}),
    opencode,
    claude,
    ...(capabilities.has('agent.acp.antigravity.model-load.v1') ? { acpModelLoadsSession: true } : {}),
    ...(workspaceTypes === undefined ? {} : { workspaceTypes }),
    pluginRoute: capabilities.has('plugin.route.v1'),
  }
}

function isVersionAtLeast(value: string | undefined, minimum: readonly [number, number, number]): boolean {
  const match = value?.match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/)
  if (match === undefined || match === null) return false
  const version = match.slice(1, 4).map(part => Number(part))
  for (let index = 0;index < minimum.length;index += 1) {
    const part = version[index] ?? 0
    const expected = minimum[index] ?? 0
    if (part > expected) return true
    if (part < expected) return false
  }
  return true
}
