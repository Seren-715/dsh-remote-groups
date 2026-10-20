// Modified by Seren-715 for DSH Remote Groups (2026-10-20): local Agent group integration, mobile history and attachments. Original work: Fei2411/DeepSeek-Bot, Apache-2.0.
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import { createLocalProcessSpawner, resolveLocalCommand } from '../src/host/local-process.js'

test('Windows resolves bare Codex npm entry through Node without a shell', () => {
  const args = ['app-server', '--listen', 'stdio://']
  const entry = 'C:\\Users\\Example User\\npm\\node_modules\\@openai\\codex\\bin\\codex.js'
  const result = resolveLocalCommand('codex', args, {
    platform: 'win32', pathEnv: 'C:\\Windows;"C:\\Users\\Example User\\npm"', exists: path => path === entry, nodePath: 'C:\\node\\node.exe',
  })
  assert.deepEqual(result, { command: 'C:\\node\\node.exe', args: [entry, ...args] })
  assert.deepEqual(args, ['app-server', '--listen', 'stdio://'])
})

test('Windows finds Codex in npm local .bin PATH and preserves explicit commands', () => {
  const entry = 'D:\\project\\node_modules\\@openai\\codex\\bin\\codex.js'
  assert.equal(resolveLocalCommand('codex', [], {
    platform: 'win32', pathEnv: 'D:\\project\\node_modules\\.bin', exists: path => path === entry,
  }).args[0], entry)
  for (const command of ['codex.exe', 'C:\\tools\\codex.exe', 'node', 'opencode', 'hermes']) {
    assert.deepEqual(resolveLocalCommand(command, ['a;$(b)'], { platform: 'win32', exists: () => true }), { command, args: ['a;$(b)'] })
  }
  assert.deepEqual(resolveLocalCommand('codex', ['app-server'], { platform: 'linux' }), { command: 'codex', args: ['app-server'] })
})

test('Claude ACP resolves package.json before falling back to its package entry', () => {
  const resolved = []
  const direct = resolveLocalCommand('claude-agent-acp', ['--help'], {
    platform: 'linux', exists: () => true, nodePath: '/node', resolvePackage: name => { resolved.push(name); return '/app/node_modules/acp/package.json' },
  })
  assert.deepEqual(resolved, ['@agentclientprotocol/claude-agent-acp/package.json'])
  assert.deepEqual(direct, { command: '/node', args: ['/app/node_modules/acp/dist/index.js', '--help'] })
  const fallback = resolveLocalCommand('claude-agent-acp', [], {
    platform: 'linux', exists: () => true, nodePath: '/node', resolvePackage: name => {
      if (name.endsWith('package.json')) throw new Error('exports blocked')
      return '/app/node_modules/acp/dist/lib.js'
    },
  })
  assert.deepEqual(fallback, { command: '/node', args: ['/app/node_modules/acp/dist/index.js'] })
})

test('Unresolved bare commands remain PATH executables', () => {
  for (const command of ['codex', 'claude-agent-acp']) {
    assert.deepEqual(resolveLocalCommand(command, ['--version'], {
      platform: 'win32', pathEnv: 'C:\\empty', exists: () => false, resolvePackage: () => { throw new Error('not installed') },
    }), { command, args: ['--version'] })
  }
})

function setup(platform = 'win32') {
  const calls = []
  const child = Object.assign(new EventEmitter(), { pid: 4321, exitCode: null, signalCode: null, nativeKills: [] })
  child.kill = signal => { child.nativeKills.push(signal); return true }
  const killer = new EventEmitter()
  const spawn = createLocalProcessSpawner({ platform, resolveCommand: (command, args) => ({ command, args }), spawnProcess: (...args) => {
    calls.push(args)
    return calls.length === 1 ? child : killer
  } })
  return { spawn, child, killer, calls }
}

test('Windows terminates only its spawned child tree with shell disabled', () => {
  const f = setup()
  assert.equal(f.spawn('codex.exe', ['app-server'], { shell: true, windowsHide: false, cwd: 'D:/work' }), f.child)
  assert.equal(f.calls[0][2].shell, false)
  assert.equal(f.calls[0][2].windowsHide, true)
  assert.equal(f.calls[0][2].cwd, 'D:/work')
  assert.equal(f.child.kill(), true)
  assert.match(f.calls[1][0], /System32\\taskkill\.exe$/)
  assert.deepEqual(f.calls[1][1], ['/PID', '4321', '/T', '/F'])
  assert.deepEqual(f.calls[1][2], { shell: false, windowsHide: true, stdio: 'ignore' })
  assert.equal(f.child.kill(), false)
  assert.equal(f.calls.length, 2)
})

test('Windows never taskkills after exit, close, spawn error, or missing PID', () => {
  for (const event of ['exit', 'close', 'error']) {
    const f = setup()
    f.spawn('agent', [])
    f.child.emit(event, event === 'error' ? new Error('spawn failed') : 0)
    assert.equal(f.child.kill(), false)
    assert.equal(f.calls.length, 1)
  }
  for (const pid of [undefined, 0, -1]) {
    const f = setup()
    f.child.pid = pid
    f.spawn('agent', [])
    assert.equal(f.child.kill(), false)
    assert.equal(f.calls.length, 1)
  }
})

test('Windows taskkill fallback cannot kill an exited or reused PID', () => {
  const f = setup()
  f.spawn('agent', [])
  f.child.kill('SIGTERM')
  f.killer.emit('error', new Error('taskkill missing'))
  assert.deepEqual(f.child.nativeKills, ['SIGTERM'])
  const exited = setup()
  exited.spawn('agent', [])
  exited.child.kill()
  exited.child.emit('exit', 0)
  exited.killer.emit('exit', 1)
  assert.deepEqual(exited.child.nativeKills, [])
})

test('Unix retains native child kill and disables shell execution', () => {
  const f = setup('linux')
  f.spawn('hermes', ['acp'], { shell: true })
  assert.equal(f.child.kill('SIGTERM'), true)
  assert.deepEqual(f.child.nativeKills, ['SIGTERM'])
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0][2].shell, false)
})

test('Electron runs npm JS entries in Node mode while preserving the supplied environment', () => {
  const nodePath = 'C:\\DSH\\DeepSeek Harness.exe'
  const environment = { PATH: 'C:\\npm', HOME: 'C:\\profile', ELECTRON_RUN_AS_NODE: '0' }
  let seen
  const spawn = createLocalProcessSpawner({
    platform: 'linux', isElectron: true, nodePath,
    resolveCommand: (command, args, options) => {
      assert.equal(options.nodePath, nodePath)
      return { command: options.nodePath, args: ['C:\\npm\\agent.js', ...args] }
    },
    spawnProcess: (...args) => { seen = args; return {} },
  })
  spawn('claude-agent-acp', [], { env: environment })
  assert.equal(seen[0], nodePath)
  assert.deepEqual(seen[2].env, { ...environment, ELECTRON_RUN_AS_NODE: '1' })
  assert.equal(environment.ELECTRON_RUN_AS_NODE, '0')
  assert.notEqual(seen[2].env, environment)
  spawn('claude-agent-acp', [])
  assert.deepEqual(seen[2].env, { ...process.env, ELECTRON_RUN_AS_NODE: '1' })
})

test('Node and ordinary executables keep their exact environment in an Electron host', () => {
  for (const [isElectron, executable] of [[false, '/node'], [true, '/opencode']]) {
    let seen
    const spawn = createLocalProcessSpawner({
      platform: 'linux', isElectron, nodePath: '/node',
      resolveCommand: (command, args) => ({ command, args }),
      spawnProcess: (...args) => { seen = args; return {} },
    })
    const environment = { PATH: '/bin', ELECTRON_RUN_AS_NODE: '0' }
    spawn(executable, [], { env: environment })
    assert.equal(seen[2].env, environment)
    spawn(executable, [])
    assert.equal(seen[2].env, undefined)
  }
})
