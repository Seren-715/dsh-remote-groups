/** React Native's AbortSignal supports `aborted` but may not implement `throwIfAborted`. */
export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  if (signal.reason !== undefined) throw signal.reason
  const error = new Error('Operation cancelled')
  error.name = 'AbortError'
  throw error
}
