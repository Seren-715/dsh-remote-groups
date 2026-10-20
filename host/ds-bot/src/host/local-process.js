// Modified by Seren-715 for DSH Remote Groups (2026-10-20): local Agent group integration, mobile history and attachments. Original work: Fei2411/DeepSeek-Bot, Apache-2.0.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { posix, win32 } from 'node:path'

const require = createRequire(import.meta.url)

export function resolveLocalCommand(command, args = [], {
  platform = process.platform,
  pathEnv = process.env.PATH || process.env.Path || '',
  exists = existsSync,
  resolvePackage = name => require.resolve(name),
  nodePath = process.execPath,
} = {}) {
  const paths = platform === 'win32' ? win32 : posix
  const throughNode = entry => ({ command: nodePath, args: [entry, ...args] })
  if (command === 'claude-agent-acp') {
    let entry
    try {
      entry = paths.join(paths.dirname(resolvePackage('@agentclientprotocol/claude-agent-acp/package.json')), 'dist', 'index.js')
    } catch {
      try { entry = paths.join(paths.dirname(resolvePackage('@agentclientprotocol/claude-agent-acp')), 'index.js') } catch {}
    }
    if (entry && exists(entry)) return throughNode(entry)
  }
  if (platform === 'win32' && (command === 'codex' || command === 'claude-agent-acp')) {
    const packageParts = command === 'codex'
      ? ['@openai', 'codex', 'bin', 'codex.js']
      : ['@agentclientprotocol', 'claude-agent-acp', 'dist', 'index.js']
    for (const directory of pathEnv.split(';').filter(Boolean)) {
      const clean = directory.replace(/^"|"$/g, '')
      const candidates = [paths.join(clean, 'node_modules', ...packageParts)]
      if (paths.basename(clean).toLowerCase() === '.bin') candidates.push(paths.join(paths.dirname(clean), ...packageParts))
      const entry = candidates.find(exists)
      if (entry) return throughNode(entry)
    }
  }
  return { command, args: [...args] }
}

export function createLocalProcessSpawner({ spawnProcess = spawn, platform = process.platform, resolveCommand = resolveLocalCommand, isElectron = Boolean(process.versions.electron), nodePath = process.execPath } = {}) {
  return (command, args = [], options = {}) => {
    const resolved = resolveCommand(command, args, { platform, nodePath, pathEnv: options.env?.PATH || options.env?.Path || process.env.PATH || process.env.Path || '' })
    const spawnOptions = { ...options, shell: false, windowsHide: true }
    // Electron's executable must run npm entry scripts as Node instead of opening another app window.
    if (isElectron && resolved.command === nodePath) spawnOptions.env = { ...(options.env || process.env), ELECTRON_RUN_AS_NODE: '1' }
    const child = spawnProcess(resolved.command, resolved.args, spawnOptions)
    if (platform !== 'win32') return child
    const nativeKill = child.kill.bind(child)
    let running = true
    let killing = false
    for (const event of ['exit', 'close', 'error']) child.once(event, () => { running = false })
    child.kill = signal => {
      // Never target a PID after its original child has exited and it can be reused.
      if (!running || killing || !Number.isInteger(child.pid) || child.pid <= 0 || child.exitCode != null || child.signalCode != null) return false
      killing = true
      const taskkill = win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe')
      try {
        const killer = spawnProcess(taskkill, ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' })
        killer.once('error', () => { if (running) nativeKill(signal) })
        killer.once('exit', code => { if (code !== 0 && running) nativeKill(signal) })
        return true
      } catch {
        return running ? nativeKill(signal) : false
      }
    }
    return child
  }
}

const spawnLocal = createLocalProcessSpawner()
export function spawnLocalProcess(command, args, options) {
  return spawnLocal(command, args, options)
}
