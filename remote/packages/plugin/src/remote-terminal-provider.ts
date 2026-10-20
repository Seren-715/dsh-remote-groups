import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { userInfo } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'
import { PassThrough } from 'node:stream'
import { RpcError } from './safe-error.js'

export interface TerminalShell { path: string; args: string[]; name: string }
export interface TerminalActivity { state: 'idle' | 'busy' | 'unknown'; revision: number }
export interface RemoteTerminalSpec {
  argv: readonly string[]
  cwd: string
  cols: number
  rows: number
  terminalType: string
  env: Record<string, string>
  signal: AbortSignal
}
export interface RemoteTerminalProcess {
  output: AsyncIterable<string>
  write(data: string): void | Promise<void>
  resize(cols: number, rows: number): void | Promise<void>
  terminate(): void | Promise<void>
  completed: Promise<{ exitCode: number | null }>
  inspectActivity?(): Promise<TerminalActivity>
}
/** Injectable process seam; shell discovery stays in the same execution environment. */
export type RemoteTerminalSpawner = ((spec: RemoteTerminalSpec) => Promise<RemoteTerminalProcess>) & {
  shells?(signal: AbortSignal): Promise<TerminalShell[]>
}
export interface HostSubprocessLike {
  spawnTerminal(spec: Record<string, unknown>): Promise<unknown>
  terminalEnvironment?(signal?: AbortSignal): Promise<{ platform: 'posix' | 'windows'; defaultShell?: string }>
  resolveExecutable?(file: string, env?: Record<string, string>, signal?: AbortSignal): Promise<string>
}
interface HostTerminalHandleLike {
  output: PassThrough
  write(data: string): void | Promise<void>
  resize(cols: number, rows: number): void | Promise<void>
  terminate(): void | Promise<void>
  done: Promise<{ exitCode?: number | null } | undefined>
  inspectActivity?(): Promise<TerminalActivity>
}

/** Match official shell profiles: ordinary shells are explicitly interactive. */
function profile(path: string): TerminalShell {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
  const kind = name.toLowerCase().replace(/\.exe$/u, '')
  return { path, name, args: kind === 'cmd' ? [] : ['pwsh', 'powershell'].includes(kind) ? ['-NoLogo'] : ['-i'] }
}

async function localExecutable(file: string, _env?: Record<string, string>, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted()
  const extensions = process.platform === 'win32' && !/\.[^\\/]+$/.test(file)
    ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';') : ['']
  const paths = isAbsolute(file) ? [file] : (process.env.PATH ?? '').split(delimiter).filter(Boolean).map(dir => join(dir, file))
  for (const path of paths) for (const extension of extensions) {
    try { await access(path + extension, process.platform === 'win32' ? constants.F_OK : constants.X_OK); signal?.throwIfAborted(); return path + extension }
    catch (error) { if (signal?.aborted) throw error }
  }
  throw new RpcError('TERMINAL_SHELL_UNAVAILABLE', 'The terminal shell is unavailable.')
}

export async function discoverTerminalShells(provider?: HostSubprocessLike, signal = new AbortController().signal): Promise<TerminalShell[]> {
  signal.throwIfAborted()
  if (provider?.terminalEnvironment && !provider.resolveExecutable) throw new RpcError('TERMINAL_SHELL_UNAVAILABLE', 'The terminal provider cannot verify its shells.')
  // Older providers lack discovery. Only that compatibility path uses Host-local facts.
  const environment = provider?.terminalEnvironment === undefined
    ? { platform: process.platform === 'win32' ? 'windows' as const : 'posix' as const,
        defaultShell: process.platform === 'win32' ? process.env.ComSpec : process.env.SHELL || userInfo().shell || undefined }
    : await provider.terminalEnvironment(signal)
  const resolve = provider?.resolveExecutable?.bind(provider) ?? localExecutable
  const preferred = profile(environment.defaultShell || (environment.platform === 'windows' ? 'cmd.exe' : '/bin/sh'))
  preferred.path = await resolve(preferred.path, undefined, signal)
  // Legacy providers do not distinguish missing candidates from transport
  // failures. Verify their default, without guessing which errors to swallow.
  if (provider && !provider.terminalEnvironment) return [preferred]
  const candidates = ['zsh', 'bash', 'fish', 'pwsh', 'powershell', 'cmd']
  const found = await Promise.all(candidates.map(async file => {
    try { return { ...profile(file), path: await resolve(file, undefined, signal) } }
    catch (error) {
      if (error instanceof RpcError && error.code === 'TERMINAL_SHELL_UNAVAILABLE'
        || error instanceof Error && error.name === 'SubprocessExecutableNotFoundError') return undefined
      throw error
    }
  }))
  signal.throwIfAborted()
  const shells = new Map<string, TerminalShell>()
  for (const shell of [preferred, ...found]) if (shell) {
    const kind = shell.name.toLowerCase().replace(/\.exe$/u, '')
    if (!shells.has(kind)) shells.set(kind, shell)
  }
  return [...shells.values()]
}

/** Compatibility fallback only: pipes cannot provide PTY resize or job control. */
export function pipeTerminalSpawner(): RemoteTerminalSpawner {
  return Object.assign(async (spec: RemoteTerminalSpec): Promise<RemoteTerminalProcess> => {
    spec.signal.throwIfAborted()
    const child = spawn(spec.argv[0]!, spec.argv.slice(1), {
      cwd: spec.cwd, stdio: 'pipe', windowsHide: true,
      env: { ...process.env, ...spec.env, TERM: spec.terminalType },
    })
    const output = new PassThrough()
    output.setEncoding('utf8')
    child.stdout.pipe(output, { end: false })
    child.stderr.pipe(output, { end: false })
    const completed = new Promise<{ exitCode: number | null }>((resolve, reject) => {
      child.once('error', error => { output.destroy(); reject(error) })
      child.once('close', exitCode => { output.end(); resolve({ exitCode }) })
    })
    void completed.catch(() => undefined)
    const abort = () => { child.kill() }
    spec.signal.addEventListener('abort', abort, { once: true })
    try {
      await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject) })
      spec.signal.throwIfAborted()
    } catch (error) { child.kill(); throw error }
    finally { spec.signal.removeEventListener('abort', abort) }
    return {
      output: output as unknown as AsyncIterable<string>,
      write: data => { child.stdin.write(data) }, resize: () => undefined,
      terminate: async () => {
        child.kill()
        const timer = setTimeout(() => { child.kill('SIGKILL') }, 1000)
        timer.unref()
        try { await completed } finally { clearTimeout(timer) }
      },
      completed,
    }
  }, { shells: (signal: AbortSignal) => discoverTerminalShells(undefined, signal) })
}

/** Reuse official PTY, shell activity integration and process-range termination. */
export function subprocessTerminalSpawner(subprocess: HostSubprocessLike): RemoteTerminalSpawner {
  return Object.assign(async (spec: RemoteTerminalSpec): Promise<RemoteTerminalProcess> => {
    spec.signal.throwIfAborted()
    const allocation = new AbortController()
    const abort = () => allocation.abort(spec.signal.reason)
    spec.signal.addEventListener('abort', abort, { once: true })
    let handle: HostTerminalHandleLike
    try {
      handle = await subprocess.spawnTerminal({ ...spec, signal: allocation.signal, argv: [...spec.argv], shellActivity: true, graceMs: 1000 }) as HostTerminalHandleLike
    } finally {
      // A completed allocation belongs to the Host, not the request timeout or
      // the physical connection, including on older subprocess providers.
      spec.signal.removeEventListener('abort', abort)
    }
    handle.output.setEncoding?.('utf8')
    const completed = handle.done.then(outcome => ({ exitCode: typeof outcome?.exitCode === 'number' ? outcome.exitCode : null }))
    void completed.catch(() => { handle.output.destroy() })
    return {
      output: handle.output as unknown as AsyncIterable<string>,
      write: data => handle.write(data), resize: (cols, rows) => handle.resize(cols, rows),
      terminate: () => handle.terminate(),
      completed,
      ...(handle.inspectActivity === undefined ? {} : { inspectActivity: () => handle.inspectActivity!() }),
    }
  }, { shells: (signal: AbortSignal) => discoverTerminalShells(subprocess, signal) })
}
