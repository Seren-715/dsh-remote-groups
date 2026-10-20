import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { throwIfAborted } from '../src/services/abort-signal'

// This is the same implementation React Native installs in Libraries/Core/setUpXHR.js.
const { AbortController: NativeAbortController } = createRequire(import.meta.url)('abort-controller') as {
  AbortController: new () => { signal: AbortSignal; abort(): void }
}

describe('native cancellation compatibility', () => {
  it('works with React Native signals that have no throwIfAborted or reason', () => {
    const controller = new NativeAbortController()
    expect(controller.signal.throwIfAborted).toBeUndefined()
    expect(controller.signal.reason).toBeUndefined()
    expect(() => throwIfAborted(controller.signal)).not.toThrow()
    expect(() => throwIfAborted()).not.toThrow()
    controller.abort()
    expect(() => throwIfAborted(controller.signal)).toThrow(expect.objectContaining({ name: 'AbortError' }))
  })

  it('preserves explicit cancellation reasons on modern signals', () => {
    const controller = new AbortController()
    const reason = new Error('Connection changed')
    controller.abort(reason)
    expect(() => throwIfAborted(controller.signal)).toThrow(reason)
  })
})
