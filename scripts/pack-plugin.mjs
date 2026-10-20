import { mkdirSync, existsSync, readFileSync, writeFileSync, cpSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
for (const file of ['remote/packages/plugin/dist/index.js', 'remote/packages/plugin/dist/client.github.js', 'host/ds-bot/client.js', 'host/ds-bot/NOTICE']) {
  if (!existsSync(join(root, file))) throw new Error(`Missing release input: ${file}. Build the component first.`)
}
mkdirSync(join(root, 'artifacts'), { recursive: true })
let cwd = root
if (process.argv.includes('--companion')) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  // Stage only the same allowlisted release inputs; never copy development profiles.
  cwd = join(root, 'artifacts', `companion-${manifest.version}`)
  mkdirSync(cwd, { recursive: true })
  for (const file of manifest.files) cpSync(join(root, file), join(cwd, file), { recursive: true })
  cpSync(join(root, 'companion/cordis.patch.yml'), join(cwd, 'plugin/cordis.patch.yml'))
  writeFileSync(join(cwd, 'plugin/index.js'), "export const name = 'dsh-remote-groups-companion'\nexport function apply() {}\n")
  manifest.name = 'dsh-remote-groups-companion'
  manifest.description = 'DSH Remote Groups companion distribution for existing upstream installations'
  delete manifest.scripts
  writeFileSync(join(cwd, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
}
const result = spawnSync(process.execPath, [process.env.npm_execpath, 'pack', '--pack-destination', join(root, 'artifacts')], { cwd, stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
