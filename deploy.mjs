import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import process from 'process'

const ASSETS = ['main.js', 'manifest.json', 'styles.css']
const TARGET_FILE = '.deploy-target'

function fail(message) {
	console.error(`deploy: ${message}`)
	process.exit(1)
}

function readVaultPath() {
	if (process.env.OBSIDIAN_VAULT) return process.env.OBSIDIAN_VAULT
	if (existsSync(TARGET_FILE)) {
		const path = readFileSync(TARGET_FILE, 'utf8').trim()
		if (path) return path
	}
	fail(
		`no target vault. Set OBSIDIAN_VAULT, or write the vault path into ${TARGET_FILE}.`
	)
}

const vault = resolve(readVaultPath().replace(/^~/, process.env.HOME ?? '~'))
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
