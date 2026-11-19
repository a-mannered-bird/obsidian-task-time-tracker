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
 * The sidebar slides open with the view, and the note loads after it: rows
 * can still come in or shift once the panel itself stands still. Pointing
 * at a button before then lands on whatever moved under the pointer, which
 * swallows the click, or closes its tooltip as the pointer leaves the
 * button (seen on CI only).
 */
async function waitForViewToSettle() {
	let last = ''
	await browser.waitUntil(
		async () => {
			const layout = await browser.execute(() => {
				const panel = document.querySelector('[role="tabpanel"]')
				if (!panel || panel.getAttribute('aria-busy') !== 'false') return ''
				const buttons = Array.from(panel.querySelectorAll('button'))
				const rects = [panel, ...buttons].map((el) =>
					el.getBoundingClientRect()
				)
				return JSON.stringify(rects)
			})
			const settled = layout !== '' && layout === last
			last = layout
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
