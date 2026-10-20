import { mkdirSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
for (const file of ['remote/packages/plugin/dist/index.js', 'remote/packages/plugin/dist/client.github.js', 'host/ds-bot/client.js', 'host/ds-bot/NOTICE']) {
  if (!existsSync(join(root, file))) throw new Error(`Missing release input: ${file}. Build the component first.`)
}
mkdirSync(join(root, 'artifacts'), { recursive: true })
const result = spawnSync(process.execPath, [process.env.npm_execpath, 'pack', '--pack-destination', 'artifacts'], { cwd: root, stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
