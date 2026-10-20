// Modified by Seren-715 for DSH Remote Groups (2026-10-20): local Agent group integration, mobile history and attachments. Original work: Fei2411/DeepSeek-Bot, Apache-2.0.
import { spawnLocalProcess } from './local-process.js'
import { StringDecoder } from 'node:string_decoder'

const approvalMethods = new Map([
  ['item/commandExecution/requestApproval', 'commandExecution'],
  ['item/fileChange/requestApproval', 'fileChange'],
])

export function createCodexRuntime({ command, args = ['app-server', '--listen', 'stdio://'], spawnProcess = spawnLocalProcess, timeoutMs = 300000 } = {}) {
  if (typeof command !== 'string' || !command.trim()) throw new Error('Codex command is required')
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Codex timeout must be finite and positive')
  const active = new Set()
  let closed = false

  async function run({ sessionId, cwd, text, signal, onEvent, onApproval }) {
    if (closed) throw new Error('Codex runtime is closed')
    if (signal?.aborted) throw abortError()
    const child = spawnProcess(command, args, { cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    return new Promise((resolve, reject) => {
      const pending = new Map()
      const decoder = new StringDecoder('utf8')
      const messages = new Map()
      const buffered = []
      let nextId = 1
      let threadId
      let turnId
      let lineBuffer = ''
      let done = false
      const cancel = error => {
        if (threadId && turnId) {
          try { send({ id: nextId++, method: 'turn/interrupt', params: { threadId, turnId } }) } catch {}
        }
        finish(error)
      }
      active.add(cancel)
      const timer = setTimeout(() => cancel(new Error('Codex turn timed out')), timeoutMs)
      function finish(error) {
        if (done) return
        done = true
        clearTimeout(timer)
        signal?.removeEventListener('abort', aborted)
        active.delete(cancel)
        for (const request of pending.values()) request.reject(error || new Error('Codex turn ended'))
        pending.clear()
        child.kill()
        if (error) reject(error)
        else resolve({ sessionId: threadId, text: [...messages.values()].join('\n\n') })
      }
      function send(message) {
        if (done) throw new Error('Codex connection is closed')
        child.stdin.write(`${JSON.stringify(message)}\n`)
      }
      function request(method, params) {
        return new Promise((yes, no) => {
          const id = nextId++
          pending.set(id, { resolve: yes, reject: no })
          try { send({ id, method, params }) } catch (error) { pending.delete(id); no(error) }
        })
      }
      function emit(event) {
        try { onEvent?.(event) } catch (error) { cancel(error) }
      }
      async function approval(message) {
        const tool = approvalMethods.get(message.method)
        if (!tool) {
          send({ id: message.id, error: { code: -32601, message: 'Unsupported server request' } })
          return
        }
        const params = message.params || {}
        // A permission answer must never leak into another thread or turn.
        if (params.threadId !== threadId || params.turnId !== turnId) {
          send({ id: message.id, result: { decision: 'cancel' } })
          return
        }
        let decision = 'reject'
        if (onApproval) decision = await onApproval({ tool, reason: params.reason || params.command || 'Codex requests approval', options: ['allow', 'reject', 'cancel'] })
        if (done) return
        const wireDecision = decision === 'allow' ? 'accept' : decision === 'cancel' ? 'cancel' : 'decline'
        send({ id: message.id, result: { decision: wireDecision } })
      }
      function notification(message) {
        const params = message.params || {}
        if (params.threadId !== threadId || (params.turnId && params.turnId !== turnId)) return
        if (message.method === 'item/agentMessage/delta') {
          const delta = typeof params.delta === 'string' ? params.delta : ''
          const id = params.itemId || 'message'
          messages.set(id, (messages.get(id) || '') + delta)
          emit({ type: 'text', text: delta })
        } else if (message.method === 'item/completed' && params.item?.type === 'agentMessage') {
          if (typeof params.item.text === 'string') messages.set(params.item.id || 'message', params.item.text)
        } else if (message.method === 'item/started' && params.item?.type !== 'agentMessage') {
          emit({ type: 'tool', name: params.item?.type || 'unknown' })
        } else if (message.method === 'turn/completed') {
          const turn = params.turn
          if (turn?.id !== turnId) return
          if (turn.status === 'completed') finish()
          else if (turn.status === 'interrupted') finish(abortError())
          else finish(new Error(turn?.error?.message || `Codex turn ${turn?.status || 'failed'}`))
        }
      }
      function receive(message) {
        if (done) return
        if (message.method && message.id != null) {
          if (!turnId) buffered.push(message)
          else approval(message).catch(cancel)
        } else if (message.method) {
          // Notifications can share a stdout chunk with the turn/start response.
          if (!turnId) buffered.push(message)
          else notification(message)
        } else if (message.id != null) {
          const entry = pending.get(message.id)
          if (!entry) return
          pending.delete(message.id)
          if (message.error) entry.reject(new Error(message.error.message || 'Codex request failed'))
          else entry.resolve(message.result)
        }
      }
      function aborted() { cancel(abortError()) }
      child.on('error', error => finish(new Error(`Codex process error: ${error.message}`)))
      child.on('close', code => finish(new Error(`Codex process closed before turn completion (${code})`)))
      child.stdin.on('error', error => finish(new Error(`Codex stdin error: ${error.message}`)))
      child.stderr.on('data', () => {})
      child.stdout.on('data', chunk => {
        if (done) return
        lineBuffer += decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        if (lineBuffer.length > 8 * 1024 * 1024) return cancel(new Error('Codex protocol line is too large'))
        let end
        while (!done && (end = lineBuffer.indexOf('\n')) !== -1) {
          const line = lineBuffer.slice(0, end).trim()
          lineBuffer = lineBuffer.slice(end + 1)
          if (!line) continue
          try { receive(JSON.parse(line)) } catch { cancel(new Error('Invalid Codex protocol message')) }
        }
      })
      signal?.addEventListener('abort', aborted, { once: true })
      if (signal?.aborted) return aborted()
      ;(async () => {
        await request('initialize', { clientInfo: { name: 'ds_bot', title: 'DS Bot', version: '0.1.0' } })
        send({ method: 'initialized', params: {} })
        const config = { cwd, approvalPolicy: 'untrusted', sandbox: 'workspace-write' }
        const result = sessionId
          ? await request('thread/resume', { ...config, threadId: sessionId })
          : await request('thread/start', config)
        threadId = result?.thread?.id
        if (!threadId) throw new Error('Codex did not return a thread id')
        const started = await request('turn/start', { threadId, cwd, input: [{ type: 'text', text }] })
        turnId = started?.turn?.id
        if (!turnId) throw new Error('Codex did not return a turn id')
        for (const message of buffered) receive(message)
        buffered.length = 0
      })().catch(error => finish(error))
    })
  }

  function close() {
    closed = true
    for (const cancel of [...active]) cancel(new Error('Codex runtime is closed'))
  }
  return { run, close }
}

function abortError() {
  const error = new Error('Codex turn was cancelled')
  error.name = 'AbortError'
  return error
}
