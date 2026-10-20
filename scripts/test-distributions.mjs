// Run against an official DSH development dependency installation, not personal data.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve, join } from 'node:path'
const root = fileURLToPath(new URL('../', import.meta.url))
const harness = process.env.DSH_PACKAGING_HARNESS
if (!harness) throw new Error('Set DSH_PACKAGING_HARNESS to a development directory containing official @deepseek-ai dependencies')
const require = createRequire(join(resolve(harness), 'package.json'))
const { loadOverlayPatches, composeEntries } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-app-boot')).href)
const load = file => loadOverlayPatches('distribution-test', join(root, file))
const remote = load('remote/cordis.patch.yml')
const bot = load('host/ds-bot/cordis.patch.yml')
const companion = load('companion/cordis.patch.yml')
for (const [label, upstream] of [['none', []], ['remote', remote], ['bot', bot], ['both', [...remote, ...bot]]]) {
  const base = [{ insert: [{ id: 'web', name: 'test-web' }] }]
  const entries = composeEntries([...base.map(x => [x]), upstream, companion])
  for (const entry of entries.filter(e => ['ds-harness-remote', 'ds-harness-remote-tui', 'bot', 'web-search-auto'].includes(e.id))) {
    assert.equal(entry.disabled, true, `${label}: ${entry.id} must be suspended`)
  }
  assert.equal(entries.filter(e => e.id === 'groups-companion-bot').length, 1)
  assert.equal(entries.filter(e => e.id === 'groups-companion-remote').length, 1)
  assert.equal(new Set(entries.map(e => e.id)).size, entries.length, `${label}: unique ids`)
  assert.ok(entries.find(e => e.id === 'groups-companion-bot').name.endsWith('/host/ds-bot/index.js'))
  const restored = composeEntries([...base.map(x => [x]), upstream])
  assert.ok(!restored.some(e => e.id.startsWith('groups-companion-')))
  assert.ok(!restored.some(e => e.id === 'bot' && e.disabled === true))
  console.log(`${label}: patch composition and removal passed`)
}
const unrelated = composeEntries([[{ insert: [{ id: 'bot', name: 'unrelated' }] }], companion])
assert.equal(unrelated.find(e => e.id === 'bot').disabled, undefined, 'do not disable unrelated plugins')
// Deliberately demonstrate the documented boundary: user patches run last.
const overridden = composeEntries([bot, companion, [{ id: 'bot', name: 'ds-bot', disabled: false }]])
assert.equal(overridden.find(e => e.id === 'bot').disabled, false)
console.log('name assertion and explicit user-override boundary passed')
