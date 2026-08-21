import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import process from 'process'

const ASSETS = ['main.js', 'manifest.json', 'styles.css']
const ENV_FILE = '.env'

function fail(message) {
	console.error(`deploy: ${message}`)
	process.exit(1)
}

// Values already in the shell win: loadEnvFile skips variables that are set.
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE)

const vaultPath = process.env.OBSIDIAN_VAULT
if (!vaultPath) {
	fail(`no target vault. Set OBSIDIAN_VAULT in ${ENV_FILE} or in your shell.`)
}

const vault = resolve(vaultPath.replace(/^~/, process.env.HOME ?? '~'))
if (!existsSync(join(vault, '.obsidian'))) {
	fail(`${vault} has no .obsidian folder, so it is not a vault.`)
}

const { id } = JSON.parse(readFileSync('manifest.json', 'utf8'))
const dest = join(vault, '.obsidian', 'plugins', id)
if (dest === resolve(process.cwd())) {
	fail('target resolves to this repo; nothing to copy.')
}

mkdirSync(dest, { recursive: true })
for (const asset of ASSETS) {
	if (!existsSync(asset)) fail(`${asset} is missing. Run the build first.`)
	copyFileSync(asset, join(dest, asset))
}

console.log(`deploy: copied ${ASSETS.join(', ')} to ${dest}`)
