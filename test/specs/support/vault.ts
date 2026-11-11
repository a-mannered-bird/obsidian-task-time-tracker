import { readdir, readFile } from 'node:fs/promises'
import * as path from 'node:path'
import { browser } from '@wdio/globals'
import { obsidianPage } from 'wdio-obsidian-service'

const FIXTURE_VAULT = path.resolve('test/vaults/daily')

async function fixtureNotes(configDir: string): Promise<[string, string][]> {
	const entries = await readdir(FIXTURE_VAULT, {
		recursive: true,
		withFileTypes: true,
	})
	const notes = entries
		.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
		.map((entry) => {
			const file = path.join(entry.parentPath, entry.name)
			// Relative: this repository itself sits in a vault's .obsidian.
			const vaultPath = path.relative(FIXTURE_VAULT, file).split(path.sep)
			return { file, vaultPath: vaultPath.join('/') }
		})
		.filter(({ vaultPath }) => !vaultPath.startsWith(`${configDir}/`))
	return Promise.all(
		notes.map(
			async ({ file, vaultPath }): Promise<[string, string]> => [
				vaultPath,
				await readFile(file, 'utf8'),
			]
		)
	)
}

/**
 * Put the fixture vault back, without the plugin crying "clocks
 * disappeared". `obsidianPage.resetVault` rewrites notes from outside
 * Obsidian, which the lost-clock watch cannot tell from a bad sync: every
 * clock a test added or moved would be reported after the next reset.
 * Acknowledging the fixture contents first makes the reset count as the
 * plugin's own write.
 */
export async function resetVault() {
	const configDir = await browser.executeObsidian(
		({ app }) => app.vault.configDir
	)
	const notes = await fixtureNotes(configDir)
	await browser.executeObsidian(({ plugins }, notes) => {
		for (const [path, content] of notes) {
			plugins.obsidianTaskTimeTracker.lostClocks.acknowledge(path, content)
		}
	}, notes)
	await obsidianPage.resetVault()
	// The previous test's notices (undo, restored…) would cover the view.
	await browser.execute(() => {
		document.querySelectorAll('.notice').forEach((notice) => notice.remove())
	})
}
