import { browser, expect } from '@wdio/globals'

type DailyViewTab = 'Tracker' | 'Timeline'

/**
 * Pressed through the DOM, not with a real click: on CI a late notice of the
 * previous test can cover the tab bar, or the tab can stay reported "not
 * interactable" past WebDriver's wait while the sidebar settles. Which tab
 * is shown is what the specs depend on, not how the tab was reached.
 */
export async function selectDailyViewTab(name: DailyViewTab) {
	const tab = browser.$(`button[role="tab"]=${name}`)
	await browser.execute((el) => el.click(), await tab.getElement())
	await expect(tab).toHaveAttribute('aria-selected', 'true')
}

export async function openDailyView(tab: DailyViewTab) {
	await browser.executeObsidianCommand(
		'obsidian-task-time-tracker:open-daily-view'
	)
	await selectDailyViewTab(tab)
}
