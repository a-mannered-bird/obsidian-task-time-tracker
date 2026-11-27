import assert from 'node:assert'
import { browser, expect } from '@wdio/globals'
import { obsidianPage } from 'wdio-obsidian-service'
import { openDailyView } from './support/dailyView'
import { resetVault } from './support/vault'

/** Each tab of the daily view has a command showing it, and teaches its shortcut. */

const NOTE = '2026-08-03.md'

const tab = (name: string) => browser.$(`button[role="tab"]=${name}`)
const selectedTab = () => browser.$('button[role="tab"][aria-selected="true"]')

/**
 * Obsidian's private hotkey manager, as verified on 1.15.1 (see
 * src/ui/hotkeys.ts). Asserted: the callbacks run inside Obsidian, out of
 * reach of a guard written here, and a test sets the shortcut a user would.
 */
type WithHotkeys = {
	hotkeyManager: {
		setHotkeys(id: string, keys: { modifiers: string[]; key: string }[]): void
		removeHotkeys(id: string): void
	}
}

describe('daily view tabs', function () {
	beforeEach(async function () {
		await resetVault()
		await obsidianPage.openFile(NOTE)
	})

	it('switches to a tab from its command', async function () {
		await openDailyView('Tracker')
		await expect(selectedTab()).toHaveText('Tracker')

		await browser.executeObsidianCommand(
			'obsidian-task-time-tracker:open-goals-tab'
		)
		await expect(selectedTab()).toHaveText('Goals')

		await browser.executeObsidianCommand(
			'obsidian-task-time-tracker:open-timeline-tab'
		)
		await expect(selectedTab()).toHaveText('Timeline')
		await expect(
			browser.$('[aria-label="Task A, 09:00 to 09:30"]')
		).toBeDisplayed()

		await browser.executeObsidianCommand(
			'obsidian-task-time-tracker:open-tracker-tab'
		)
		await expect(selectedTab()).toHaveText('Tracker')
	})

	it('opens the daily view on a tab when it is closed', async function () {
		const openViews = await browser.executeObsidian(({ app }) => {
			app.workspace.detachLeavesOfType('task-time-tracker-daily-view')
			return app.workspace.getLeavesOfType('task-time-tracker-daily-view')
				.length
		})
		assert.strictEqual(openViews, 0)

		await browser.executeObsidianCommand(
			'obsidian-task-time-tracker:open-goals-tab'
		)
		await expect(selectedTab()).toHaveText('Goals')
	})

	it('shows the shortcut of a tab in its tooltip', async function () {
		await openDailyView('Tracker')
		await browser.executeObsidian(({ app }) => {
			const { hotkeyManager } = app as unknown as WithHotkeys
			hotkeyManager.setHotkeys('obsidian-task-time-tracker:open-goals-tab', [
				{ modifiers: ['Mod', 'Shift'], key: 'G' },
			])
		})

		await tab('Goals').moveTo()
		await expect(browser.$('.tooltip')).toHaveText(
			expect.stringMatching(/^Shortcut: \S/)
		)

		await browser.executeObsidian(({ app }) => {
			const { hotkeyManager } = app as unknown as WithHotkeys
			hotkeyManager.removeHotkeys('obsidian-task-time-tracker:open-goals-tab')
		})
	})
})
