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
