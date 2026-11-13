import * as path from 'path'

/**
 * On macOS every Obsidian the run starts takes the focus from the app you
 * are typing in. Hiding it right away hands the focus back; the tests drive
 * it through WebDriver, which needs no focus. `E2E_FOREGROUND=1` keeps the
 * windows visible, to watch a run.
 */
const inBackground =
	process.platform === 'darwin' && process.env.E2E_FOREGROUND !== '1'

type ElectronRemote = {
	app: { hide(): void }
	getCurrentWebContents(): { setBackgroundThrottling(allowed: boolean): void }
}

async function sendToBackground() {
	await browser.execute(() => {
		const electron = (
			window as unknown as {
				require(id: 'electron'): { remote: ElectronRemote }
			}
		).require('electron')
		// A hidden window otherwise pauses its timers and animation frames,
		// which the views (and the tests waiting on them) rely on.
		electron.remote.getCurrentWebContents().setBackgroundThrottling(false)
		electron.remote.app.hide()
	})
}

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

	before: async () => {
		if (inBackground) await sendToBackground()
	},
	// A reload starts a new Obsidian, which takes the focus again.
	afterCommand: async (command) => {
		if (inBackground && command === 'reloadObsidian') await sendToBackground()
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
