import { SerialSend } from '@dsh-remote/webrtc'
import { NoiseIkSession, createNoisePrologue } from '@dsh-remote/crypto'
import { SecureMessageCodec, MAX_SECURE_MESSAGE_BYTES } from '@dsh-remote/protocol'
import type { RemoteTransport, SecureHandshakeTransport } from '@dsh-remote/webrtc'
import type { HostIdentity, TrustedPeer } from './identity-store.js'

/** Client-side Noise IK wrapper used by the local Harness remote-mode runtime. */
export class ClientSecureTransport implements RemoteTransport {
  private noise?: NoiseIkSession
  private unsubscribeInner?: () => void
  private readonly incoming = new SecureMessageCodec()
  private readonly outgoing = new SecureMessageCodec()
  private closed = false
  private lifetime?: AbortController
  private readonly sends = new SerialSend()

  constructor(
    private readonly inner: SecureHandshakeTransport,
    private readonly identity: HostIdentity,
    private readonly host: TrustedPeer,
  ) {}

  async connect(): Promise<void> {
    const lifetime = new AbortController()
    this.lifetime = lifetime
    this.closed = false
    this.incoming.reset()
    this.outgoing.reset()
    await this.inner.connect()
    lifetime.signal.throwIfAborted()
    const info = this.inner.connectionInfo()
    if (info.localDeviceId !== this.identity.deviceId || info.remoteDeviceId !== this.host.deviceId) {
      await this.inner.close()
      throw new Error('The relay connection is bound to an unexpected device.')
    }
    const noise = new NoiseIkSession({
      role: 'initiator',
      localPrivateKey: this.identity.privateKey,
      localPublicKey: this.identity.publicKey,
      remotePublicKey: this.host.publicKey,
      prologue: createNoisePrologue(info.connectionId, this.host.deviceId, this.identity.deviceId),
    })
    this.noise = noise
    try {
      await waitForResponder(this.inner, noise, lifetime.signal)
    } catch (error) {
      noise.destroy()
      if (this.lifetime === lifetime) {
        this.noise = undefined
        await this.inner.close()
      }
      throw error
    }
  }

  async send(data: Uint8Array): Promise<void> {
    if (data.byteLength > MAX_SECURE_MESSAGE_BYTES) throw new Error('Secure message exceeds the reassembly limit.')
    const noise = this.requireNoise()
    try {
      await this.sends.run(data.byteLength, async () => {
        if (this.closed || this.noise !== noise) throw new Error('Secure transport replaced')
        for (const plaintext of this.outgoing.encode(data)) await this.inner.send(noise.encrypt(plaintext))
      })
    } catch (error) {
      await this.close().catch(() => undefined)
      throw error
    }
  }

  onMessage(handler: (data: Uint8Array) => void): () => void {
    this.unsubscribeInner?.()
    this.unsubscribeInner = this.inner.onMessage(data => {
      const noise = this.noise
      if (noise === undefined || !noise.complete || this.closed) return
      try {
        const message = this.incoming.decode(noise.decrypt(data))
        if (message !== undefined) handler(message)
      } catch {
        void this.close()
      }
    })
    return () => {
      this.unsubscribeInner?.()
      this.unsubscribeInner = undefined
    }
  }

  onClose(handler: () => void): () => void {
    return this.inner.onClose?.(handler) ?? (() => undefined)
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.lifetime?.abort()
    this.lifetime = undefined
    this.unsubscribeInner?.()
    this.unsubscribeInner = undefined
    this.incoming.reset()
    this.outgoing.reset()
    this.noise?.destroy()
    this.noise = undefined
    await this.inner.close()
  }

  getStats() { return this.inner.getStats() }

  private requireNoise(): NoiseIkSession {
    if (this.noise === undefined || !this.noise.complete || this.closed) {
      throw new Error('The authenticated Noise channel is not connected.')
    }
    return this.noise
  }
}

async function waitForResponder(inner: SecureHandshakeTransport, noise: NoiseIkSession, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false
    let unsubscribe = () => {}
    let unsubscribeClose = () => {}
    const timer = setTimeout(() => finish(new Error('Noise IK handshake timed out.')), 10_000)
    const onAbort = () => finish(new Error('Noise IK handshake was aborted.'))
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      unsubscribe()
      unsubscribeClose()
      signal.removeEventListener('abort', onAbort)
      if (error === undefined) resolve()
      else reject(error)
    }
    unsubscribe = inner.onHandshake((step, data) => {
      if (settled) return
      try {
        if (step !== 2) throw new Error('Noise IK responder sent an out-of-order handshake message.')
        noise.readHandshake(data)
        if (!noise.complete) throw new Error('Noise IK handshake did not complete.')
        finish()
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Noise IK handshake failed.'))
      }
    })
    unsubscribeClose = inner.onClose?.(() => finish(new Error('Control channel closed during Noise IK handshake.'))) ?? (() => {})
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) { onAbort(); return }
    void inner.sendHandshake(1, noise.writeHandshake()).catch(error => {
      finish(error instanceof Error ? error : new Error('Noise IK handshake failed.'))
    })
  })
}
