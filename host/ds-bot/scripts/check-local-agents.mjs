// Modified by Seren-715 for DSH Remote Groups (2026-10-20): local Agent group integration, mobile history and attachments. Original work: Fei2411/DeepSeek-Bot, Apache-2.0.
// A deliberately small live check. No tools or approvals are granted.
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createAcpRuntime } from '../src/host/local-acp.js'
import { createCodexRuntime } from '../src/host/local-codex.js'

const cwd = resolve(import.meta.dirname, '../../.dsh-test-local-agents')
await mkdir(cwd, { recursive: true })
const specifications = [
  ['codex', createCodexRuntime, 'codex', ['app-server', '--listen', 'stdio://']],
  ['claude', createAcpRuntime, 'claude-agent-acp', []],
  ['opencode', createAcpRuntime, 'opencode', ['acp']],
  ['hermes', createAcpRuntime, 'hermes', ['acp']],
]
const wanted = new Set(process.argv.slice(2))
await Promise.all(specifications.filter(([name]) => wanted.size === 0 || wanted.has(name)).map(async ([name, factory, command, args]) => {
  const runtime = factory({ command, args, timeoutMs: 60_000 })
  const started = Date.now()
  try {
    const result = await runtime.run({ cwd, text: 'Do not use tools or access files. Reply with exactly: DSH-GROUP-AGENT-OK', onApproval: () => 'reject' })
    const matched = result.text.trim() === 'DSH-GROUP-AGENT-OK'
    console.log(JSON.stringify({ agent: name, status: matched ? 'passed' : 'unexpected-reply', hasSession: Boolean(result.sessionId), elapsedMs: Date.now() - started }))
    if (!matched) process.exitCode = 1
  } catch (error) {
    console.log(JSON.stringify({ agent: name, status: 'failed', error: String(error.message).slice(0, 180), elapsedMs: Date.now() - started }))
    process.exitCode = 1
  } finally {
    await runtime.close()
  }
}))
