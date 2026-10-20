import type { SafeLogger } from '../../logging.js'
import { OpencodeAcpClient } from './opencode-process.js'
import { adaptCursorProcess, type AcpBackendAdapter } from '../adapter.js'
import type { CursorAcpLike } from './cursor-process.js'

/** OpenCode ACP backend: OpenCode CLI `opencode acp` over Host stdio. */
export function createOpencodeAcpAdapter(
  binary: string = 'opencode',
  logger?: SafeLogger,
  createProcess: (binary: string, logger?: SafeLogger) => CursorAcpLike = (path, targetLogger) => (
    new OpencodeAcpClient(path, targetLogger)
  ),
): AcpBackendAdapter {
  return adaptCursorProcess(createProcess(binary, logger), 'opencode')
}

export { OpencodeAcpClient, OpencodeAcpError } from './opencode-process.js'
export type {
  OpencodeAcpInbound,
  OpencodeAcpLike,
  OpencodeAcpNotification,
  OpencodeAcpRequest,
  SpawnOpencodeAcp,
} from './opencode-process.js'
