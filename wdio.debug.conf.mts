import { config as base } from './wdio.conf.mts'

/**
 * E2E run with the WebdriverIO DevTools attached: `live` opens the DevTools
 * dashboard while the run happens (commands, per-command screenshots, DOM);
 * `trace` writes `test-results/trace-<session>.zip` to replay step by step
 * with `npx show-trace <file>`. One Obsidian at a time keeps it readable.
 */
export const config: WebdriverIO.Config = {
	...base,
	maxInstances: 1,
	// The trace player rebuilds the DOM outside Electron, where Obsidian's
	// `app://` stylesheets cannot load; inlining them makes the replay styled.
	before: async () => {
		await inlineStylesheets()
	},
	services: [
		...(base.services ?? []),
		[
			'devtools',
			{ mode: process.env.WDIO_DEVTOOLS_MODE === 'trace' ? 'trace' : 'live' },
		],
	],
}

async function inlineStylesheets() {
	await browser.execute(async () => {
		const links = document.querySelectorAll<HTMLLinkElement>(
			'link[rel="stylesheet"]'
		)
		for (const link of links) {
			try {
				const css = await (await fetch(link.href)).text()
				const style = document.createElement('style')
				style.textContent = css
				link.after(style)
			} catch {
				// A stylesheet that cannot be fetched stays a link.
			}
		}
	})
}
