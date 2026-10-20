import type { RemoteClientCore } from '@dsh-remote/client-core'
import { bytesToBase64 } from './api-proxy'
import { throwIfAborted } from './abort-signal'

/** The Host's workspace.upload.v1 bounds; the Host stays the authority. */
export const WORKSPACE_UPLOAD_MAX_BYTES = 20 * 1024 * 1024
export const WORKSPACE_UPLOAD_CHUNK_BYTES = 64 * 1024

export interface WorkspaceUploadRequest {
  /** Session whose Host-verified workspace root receives the file (a group room id included). */
  sessionId: string
  name: string
  data: Uint8Array
}

export interface WorkspaceUploadResult {
  name: string
  path: string
  bytes: number
}

export interface WorkspaceUploadProgress {
  receivedBytes: number
  totalBytes: number
  phase: 'uploading' | 'committing' | 'complete'
}

/** The uploadId travels through a UUID schema on the Host. */
function createUploadId(): string {
  if (globalThis.crypto?.randomUUID === undefined) throw new Error('Secure uploads need a newer app runtime. Update the app.')
  return globalThis.crypto.randomUUID()
}

/**
 * Sequential open → chunk → commit over the authenticated carrier the caller captured,
 * so a swapped connection can never receive a continuation. A transfer that started
 * is aborted on failure; a cancelled signal stops the loop and the cleanup runs without
 * it, because an already-aborted signal must not skip the abort.
 */
export async function runWorkspaceUpload(
  core: RemoteClientCore,
  request: WorkspaceUploadRequest,
  signal?: AbortSignal,
  onProgress?: (progress: WorkspaceUploadProgress) => void,
): Promise<WorkspaceUploadResult> {
  const { sessionId, name, data } = request
  throwIfAborted(signal)
  if (!sessionId || sessionId.length > 512 || !safeName(name)) throw new Error('Invalid upload name or session.')
  if (data.byteLength > WORKSPACE_UPLOAD_MAX_BYTES) throw new Error('That file is larger than the 20 MiB upload limit.')
  const uploadId = createUploadId()
  // An open response can be lost after the Host created its partial file.
  // Always clean up the known id, including this uncertain-open case.
  let attempted = false
  try {
    attempted = true
    const started = await core.rpc<{ uploadId: string; chunkBytes: number }>(
      'workspace.upload.open',
      { sessionId, uploadId, name, totalBytes: data.byteLength },
      signal,
    )
    throwIfAborted(signal)
    if (started?.uploadId !== uploadId || !Number.isInteger(started.chunkBytes)
      || started.chunkBytes <= 0 || started.chunkBytes > WORKSPACE_UPLOAD_CHUNK_BYTES) throw new Error('Invalid upload acknowledgement from this Host.')
    const chunkBytes = started.chunkBytes
    onProgress?.({ receivedBytes: 0, totalBytes: data.byteLength, phase: 'uploading' })
    for (let offset = 0; offset < data.byteLength; offset += chunkBytes) {
      throwIfAborted(signal)
      const chunk = data.subarray(offset, Math.min(offset + chunkBytes, data.byteLength))
      const ack = await core.rpc<{ uploadId: string; receivedBytes: number }>(
        'workspace.upload.chunk',
        { sessionId, uploadId, offset, data: bytesToBase64(chunk) },
        signal,
      )
      throwIfAborted(signal)
      if (ack?.uploadId !== uploadId || ack.receivedBytes !== offset + chunk.byteLength) throw new Error('Invalid upload acknowledgement from this Host.')
      onProgress?.({ receivedBytes: ack.receivedBytes, totalBytes: data.byteLength, phase: 'uploading' })
    }
    throwIfAborted(signal)
    onProgress?.({ receivedBytes: data.byteLength, totalBytes: data.byteLength, phase: 'committing' })
    // Once committed, keep the receipt even if the user cancels while awaiting it.
    // The caller can retain the uploaded file without submitting a chat message.
    const result = await core.rpc<WorkspaceUploadResult>('workspace.upload.commit', { sessionId, uploadId }, undefined, { timeoutMs: 30_000 })
    if (!result || !safeName(result.name) || result.path !== `./${result.name}` || result.bytes !== data.byteLength) throw new Error('Invalid uploaded file receipt from this Host.')
    attempted = false
    onProgress?.({ receivedBytes: data.byteLength, totalBytes: data.byteLength, phase: 'complete' })
    return result
  } catch (error) {
    if (attempted) await core.rpc('workspace.upload.abort', { sessionId, uploadId }, undefined, { timeoutMs: 5_000 }).catch(() => undefined)
    throw error
  }
}

function safeName(name: unknown): name is string {
  return typeof name === 'string' && name.length > 0 && name !== '.' && name !== '..'
    && !/[\\/:*?"<>|\u0000-\u001f]/u.test(name) && !/[. ]$/u.test(name)
}
