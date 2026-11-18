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
	await waitForViewToSettle()
}

/**
 * The sidebar slides open with the view: pointing at a button before it
 * stops lands on whatever slid under the pointer meanwhile.
 */
async function waitForViewToSettle() {
	let last = ''
	await browser.waitUntil(
		async () => {
			const rect = await browser.execute(() =>
				JSON.stringify(
					document.querySelector('[role="tabpanel"]')?.getBoundingClientRect()
				)
			)
			const settled = rect === last
			last = rect
			return settled
		},
		{ interval: 100, timeoutMsg: 'the daily view kept moving' }
	)
}

export async function openDailyView(tab: DailyViewTab) {
	await browser.executeObsidianCommand(
		'obsidian-task-time-tracker:open-daily-view'
	)
	await selectDailyViewTab(tab)
}
