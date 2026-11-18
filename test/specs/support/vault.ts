import { browser } from '@wdio/globals'
import { obsidianPage } from 'wdio-obsidian-service'

/** Put the fixture vault back and clear the previous test's notices. */
export async function resetVault() {
	await obsidianPage.resetVault()
	// The previous test's notices (undo, change…) would cover the view.
	await browser.execute(() => {
		document.querySelectorAll('.notice').forEach((notice) => notice.remove())
	})
}
