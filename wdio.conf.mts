import * as path from 'path'

export const config: WebdriverIO.Config = {
	runner: 'local',
	framework: 'mocha',
	specs: ['./test/specs/**/*.e2e.ts'],
	// CI runners have fewer cores; the workflow lowers this via the env var.
	maxInstances: Number(process.env.WDIO_MAX_INSTANCES ?? 4),

	capabilities: [
		{
			browserName: 'obsidian',
			browserVersion: 'latest',
			'wdio:obsidianOptions': {
				installerVersion: 'latest',
				plugins: ['.'],
				vault: 'test/vaults/daily',
			},
		},
	],

	/**
	 * The launcher copies this folder's data.json (the developer's own
	 * settings) into the sandbox; start every spec from the defaults. (A
	 * `before` hook is too early: the service's commands are not there yet.)
	 */
	beforeSuite: async () => {
		await browser.executeObsidian(async ({ app, plugins }) => {
			const plugin = plugins.obsidianTaskTimeTracker
			const dataPath = `${app.vault.configDir}/plugins/${plugin.manifest.id}/data.json`
			if (await app.vault.adapter.exists(dataPath)) {
				await app.vault.adapter.remove(dataPath)
			}
			await plugin.loadSettings()
			await plugin.saveSettings()
		})
	},

	services: ['obsidian'],
	reporters: ['obsidian'],

	// Downloaded Obsidian versions land here (gitignored).
	cacheDir: path.resolve('.obsidian-cache'),
	mochaOpts: {
		ui: 'bdd',
		timeout: 60000,
	},
	logLevel: 'warn',
}
