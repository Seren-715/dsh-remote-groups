import { describe, expect, it, vi } from 'vitest'
import type { RemoteClientCore } from '@dsh-remote/client-core'
import { runWorkspaceUpload, WORKSPACE_UPLOAD_CHUNK_BYTES, WORKSPACE_UPLOAD_MAX_BYTES } from '../src/services/workspace-upload'
import { createRequire } from 'node:module'

const { AbortController: NativeAbortController } = createRequire(import.meta.url)('abort-controller') as {
  AbortController: new () => { signal: AbortSignal; abort(): void }
}

function host() {
  const received: Uint8Array[] = []
  let receivedBytes = 0
  const rpc = vi.fn(async (method: string, input: unknown, _signal?: AbortSignal, _options?: unknown): Promise<unknown> => {
    const p = input as { uploadId: string; data?: string; offset?: number; name?: string }
    if (method === 'workspace.upload.open') return { uploadId: p.uploadId, chunkBytes: WORKSPACE_UPLOAD_CHUNK_BYTES }
    if (method === 'workspace.upload.chunk') {
      expect(p.offset).toBe(receivedBytes)
      const chunk = new Uint8Array(Buffer.from(p.data!, 'base64'))
      received.push(chunk)
      receivedBytes += chunk.length
      return { uploadId: p.uploadId, receivedBytes }
    }
    if (method === 'workspace.upload.commit') return { name: 'report (1).pdf', path: './report (1).pdf', bytes: receivedBytes }
    return { aborted: true }
  })
  return { rpc, received, core: { rpc } as unknown as RemoteClientCore }
}

describe('Android workspace upload carrier', () => {
  it('uploads with the native AbortSignal and cleans up native cancellation before commit', async () => {
    const controller = new NativeAbortController()
    const { core, rpc } = host()
    await expect(runWorkspaceUpload(core, { sessionId: 'room', name: 'file.txt', data: new Uint8Array([7]) }, controller.signal)).resolves.toMatchObject({ bytes: 1 })
    rpc.mockClear()
    const original = rpc.getMockImplementation()!
    rpc.mockImplementation(async (method, ...args) => {
      const value = await original(method, ...args)
      if (method === 'workspace.upload.open') controller.abort()
      return value
    })
    await expect(runWorkspaceUpload(core, { sessionId: 'room', name: 'file.txt', data: new Uint8Array([7]) }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(rpc.mock.calls.map(call => call[0])).toEqual(['workspace.upload.open', 'workspace.upload.abort'])
    expect(rpc.mock.calls.at(-1)?.[2]).toBeUndefined()
  })
  it('retains the committed receipt when cancelled while the Host commits', async () => {
    const { core, rpc } = host()
    const controller = new AbortController()
    const original = rpc.getMockImplementation()!
    rpc.mockImplementation(async (method, ...args) => {
      if (method === 'workspace.upload.commit') controller.abort()
      return original(method, ...args)
    })
    await expect(runWorkspaceUpload(core, { sessionId: 'room', name: 'file.txt', data: new Uint8Array([7]) }, controller.signal)).resolves.toMatchObject({ bytes: 1 })
    expect(rpc.mock.calls.some(call => call[0] === 'workspace.upload.abort')).toBe(false)
  })
  it('sends sequential bounded chunks, counts acknowledged progress and preserves the Host receipt', async () => {
    const { core, rpc, received } = host()
    const data = Uint8Array.from({ length: WORKSPACE_UPLOAD_CHUNK_BYTES + 7 }, (_, i) => i % 251)
    const progress = vi.fn()
    const signal = new AbortController().signal
    expect(await runWorkspaceUpload(core, { sessionId: 'room-1', name: 'report.pdf', data }, signal, progress)).toEqual({ name: 'report (1).pdf', path: './report (1).pdf', bytes: data.length })
    expect(Buffer.concat(received)).toEqual(Buffer.from(data))
    expect(rpc.mock.calls.map(call => call[0])).toEqual(['workspace.upload.open', 'workspace.upload.chunk', 'workspace.upload.chunk', 'workspace.upload.commit'])
    expect(rpc.mock.calls.filter(call => call[0] !== 'workspace.upload.commit').every(call => call[2] === signal)).toBe(true)
    expect(rpc.mock.calls.at(-1)?.[2]).toBeUndefined()
    expect(progress.mock.calls.map(([value]) => [value.receivedBytes, value.phase])).toEqual([[0, 'uploading'], [65536, 'uploading'], [65543, 'uploading'], [65543, 'committing'], [65543, 'complete']])
  })

  it('allows an empty document but rejects oversize and invalid local inputs before opening', async () => {
    const { core, rpc } = host()
    await expect(runWorkspaceUpload(core, { sessionId: 'room', name: 'report.pdf', data: new Uint8Array() })).resolves.toMatchObject({ bytes: 0 })
    expect(rpc.mock.calls.map(call => call[0])).toEqual(['workspace.upload.open', 'workspace.upload.commit'])
    rpc.mockClear()
    for (const request of [
      { sessionId: 'room', name: '../other', data: new Uint8Array() },
      { sessionId: 'room', name: 'large.zip', data: new Uint8Array(WORKSPACE_UPLOAD_MAX_BYTES + 1) },
    ]) await expect(runWorkspaceUpload(core, request)).rejects.toThrow()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('aborts the original id even when open was accepted but its acknowledgement was lost', async () => {
    const { core, rpc } = host()
    rpc.mockRejectedValueOnce(new Error('RPC_TIMEOUT'))
    await expect(runWorkspaceUpload(core, { sessionId: 'room', name: 'data.bin', data: new Uint8Array([7]) })).rejects.toThrow('RPC_TIMEOUT')
    expect(rpc.mock.calls.map(call => call[0])).toEqual(['workspace.upload.open', 'workspace.upload.abort'])
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({ sessionId: 'room', uploadId: (rpc.mock.calls[0]?.[1] as { uploadId: string }).uploadId })
    expect(rpc.mock.calls[1]?.[3]).toEqual({ timeoutMs: 5_000 })
  })

  it('does not commit after cancellation or an invalid acknowledgement and cleans up without the aborted signal', async () => {
    for (const scenario of ['cancel-after-open', 'invalid-size', 'invalid-chunk'] as const) {
      const { core, rpc } = host()
      const signal = new AbortController()
      const impl = rpc.getMockImplementation()!
      rpc.mockImplementation(async (method, input, ...rest) => {
        const result = await impl(method, input, ...rest)
        if (scenario === 'cancel-after-open' && method === 'workspace.upload.open') signal.abort()
        if (scenario === 'invalid-size' && method === 'workspace.upload.open') return { ...(result as object), chunkBytes: WORKSPACE_UPLOAD_CHUNK_BYTES + 1 }
        if (scenario === 'invalid-chunk' && method === 'workspace.upload.chunk') return { ...(result as object), receivedBytes: 2 }
        return result
      })
      await expect(runWorkspaceUpload(core, { sessionId: 'room', name: 'data.bin', data: new Uint8Array([7]) }, signal.signal), scenario).rejects.toThrow()
      expect(rpc.mock.calls.some(call => call[0] === 'workspace.upload.commit'), scenario).toBe(false)
      const cleanup = rpc.mock.calls.at(-1)!
      expect(cleanup[0], scenario).toBe('workspace.upload.abort')
      expect(cleanup[2], scenario).toBeUndefined()
    }
  })

  it('does not release a malformed committed file receipt for a subsequent group send', async () => {
    for (const receipt of [
      { name: 'data.bin', path: '../../data.bin', bytes: 1 },
      { name: 'data.bin', path: './data.bin', bytes: 9 },
      { name: '../data.bin', path: './../data.bin', bytes: 1 },
    ]) {
      const { core, rpc } = host()
      const impl = rpc.getMockImplementation()!
      rpc.mockImplementation(async (method, ...rest) => method === 'workspace.upload.commit' ? receipt : impl(method, ...rest))
      await expect(runWorkspaceUpload(core, { sessionId: 'room', name: 'data.bin', data: new Uint8Array([7]) })).rejects.toThrow('receipt')
    }
  })
})
