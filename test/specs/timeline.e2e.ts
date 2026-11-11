import assert from 'node:assert'
import { browser, expect } from '@wdio/globals'
import { obsidianPage } from 'wdio-obsidian-service'
import { resetVault } from './support/vault'

/**
 * The timeline tab rewrites clock lines when blocks are moved or resized,
 * from the keyboard and with the pointer. At the default zoom (60 px per
 * hour) the snap step is 15 minutes, so one arrow press or 15 px of drag
 * moves an edge by a quarter of an hour.
 */

const NOTE = '2026-08-03.md'

const block = (label: string) => browser.$(`[aria-label="${label}"]`)

async function openTimeline() {
	await obsidianPage.openFile(NOTE)
	await browser.executeObsidianCommand(
		'obsidian-task-time-tracker:open-daily-view'
	)
	const tab = browser.$('button[role="tab"]=Timeline')
	await tab.click()
	await expect(tab).toHaveAttribute('aria-selected', 'true')
	await expect(block('Task A, 09:00 to 09:30')).toBeDisplayed()
}

async function focus(label: string) {
	// Focus without clicking: a click on a block jumps to its line.
	const element = await block(label).getElement()
	await browser.execute((el) => el.focus(), element)
	await expect(element).toBeFocused()
}

/** Wait for the timeline's write to land in the file. */
async function waitForChange(before: string) {
	await browser.waitUntil(
		async () => (await obsidianPage.read(NOTE)) !== before,
		{
			timeout: 10000,
			timeoutMsg: `${NOTE} was not rewritten`,
		}
	)
	return obsidianPage.read(NOTE)
}

describe('timeline tab', function () {
	beforeEach(async function () {
		await resetVault()
	})

	it('moves a block with the arrow keys, then undoes it from the notice', async function () {
		await openTimeline()
		const before = await obsidianPage.read(NOTE)

		await focus('Task A, 09:00 to 09:30')
		await browser.keys('ArrowDown')
		await expect(block('Task A, 09:15 to 09:45')).toBeDisplayed()
		const moved = await waitForChange(before)
		assert.strictEqual(
			moved,
			before.replace(
				'[clock::2026-08-03T09:00:00--2026-08-03T09:30:00]',
				'[clock::2026-08-03T09:15:00--2026-08-03T09:45:00]'
			)
		)
		// The block got a new id from its new start; the focus followed it.
		await expect(block('Task A, 09:15 to 09:45')).toBeFocused()

		const notice = browser.$('.notice*=Task A 09:00–09:30 → 09:15–09:45')
		await expect(notice).toBeDisplayed()
		await notice.$('button=Undo').click()
		await expect(block('Task A, 09:00 to 09:30')).toBeDisplayed()
		assert.strictEqual(await waitForChange(moved), before)
	})

	it('resizes an end with Shift and a running start with Alt', async function () {
		await obsidianPage.openFile(NOTE)
		const fixture = await obsidianPage.read(NOTE)
		const before = `${fixture.trimEnd()}\n- [ ] Lunch\n      [clock::2026-08-03T12:00:00]\n`
		await browser.executeObsidian(
			({ app }, path, content) => app.vault.adapter.write(path, content),
			NOTE,
			before
		)
		await openTimeline()
		await expect(block('Lunch, 12:00 to now')).toBeDisplayed()

		await focus('Task B, 09:15 to 09:45')
		await browser.keys(['Shift', 'ArrowDown'])
		await expect(block('Task B, 09:15 to 10:00')).toBeDisplayed()
		const resized = await waitForChange(before)
		assert.strictEqual(
			resized,
			before.replace(
				'[clock::2026-08-03T09:15:00--2026-08-03T09:45:00]',
				'[clock::2026-08-03T09:15:00--2026-08-03T10:00:00]'
			)
		)

		// A running clock cannot move as a whole (it ends now); Alt moves its
		// start, and it keeps running.
		await focus('Lunch, 12:00 to now')
		await browser.keys('ArrowDown')
		await browser.keys(['Alt', 'ArrowUp'])
		await expect(block('Lunch, 11:45 to now')).toBeDisplayed()
		assert.strictEqual(
			await waitForChange(resized),
			resized.replace(
				'[clock::2026-08-03T12:00:00]',
				'[clock::2026-08-03T11:45:00]'
			)
		)
	})

	it('zooms in to a finer snap step and remembers the zoom', async function () {
		await openTimeline()
		const before = await obsidianPage.read(NOTE)

		// Two steps of 1.5 take 60 px per hour to 135, where the step is 5 min.
		const zoomIn = browser.$('button[aria-label="Zoom in"]')
		await expect(zoomIn).toBeEnabled()
		await zoomIn.click()
		await zoomIn.click()
		await focus('Task A, 09:00 to 09:30')
		await browser.keys('ArrowDown')
		await expect(block('Task A, 09:05 to 09:35')).toBeDisplayed()
		assert.strictEqual(
			await waitForChange(before),
			before.replace(
				'[clock::2026-08-03T09:00:00--2026-08-03T09:30:00]',
				'[clock::2026-08-03T09:05:00--2026-08-03T09:35:00]'
			)
		)
		await browser.waitUntil(() =>
			browser
				.executeObsidian(
					({ plugins }) => plugins.obsidianTaskTimeTracker.settings.timelineZoom
				)
				.then((zoom) => zoom === 135)
		)

		// Leave the zoom as found for the other tests.
		await browser.executeObsidian(async ({ plugins }) => {
			plugins.obsidianTaskTimeTracker.settings.timelineZoom = 60
			await plugins.obsidianTaskTimeTracker.saveSettings()
			await plugins.obsidianTaskTimeTracker.refreshViews()
		})
	})

	it('zooms out around the middle of the view, not the pointer', async function () {
		await openTimeline()
		/** Where the middle of the visible timeline falls, as a share of the day. */
		const middleOfView = () =>
			browser.execute(() => {
				const panel = document.querySelector('[role="tabpanel"]')
				const canvas = panel?.querySelector('.timeline')
				const toolbar = panel?.querySelector('.timeline-toolbar')
				if (
					!panel ||
					!(canvas instanceof HTMLElement) ||
					!(toolbar instanceof HTMLElement)
				)
					return NaN
				const view = panel.getBoundingClientRect()
				const bar = toolbar.offsetHeight
				const middle = view.top + bar + (view.height - bar) / 2
				const top = canvas.getBoundingClientRect().top
				return (middle - top) / canvas.offsetHeight
			})
		const before = await middleOfView()

		// The pointer rests on the button, at the top of the view.
		const zoomOut = browser.$('button[aria-label="Zoom out"]')
		await zoomOut.click()
		await expect(zoomOut).toBeEnabled()
		await zoomOut.click()
		assert.strictEqual(
			Math.round((await middleOfView()) * 1000),
			Math.round(before * 1000)
		)

		await browser.executeObsidian(async ({ plugins }) => {
			plugins.obsidianTaskTimeTracker.settings.timelineZoom = 60
			await plugins.obsidianTaskTimeTracker.saveSettings()
			await plugins.obsidianTaskTimeTracker.refreshViews()
		})
	})

	it('moves a block and resizes its end with the pointer', async function () {
		await openTimeline()
		const before = await obsidianPage.read(NOTE)

		// 30 px down is half an hour: Task A 09:00–09:30 lands on 09:30–10:00.
		await browser
			.action('pointer', { parameters: { pointerType: 'mouse' } })
			.move({ origin: block('Task A, 09:00 to 09:30') })
			.down()
			.move({ origin: 'pointer', y: 30 })
			.up()
			.perform()
		await expect(block('Task A, 09:30 to 10:00')).toBeDisplayed()
		const moved = await waitForChange(before)
		assert.strictEqual(
			moved,
			before.replace(
				'[clock::2026-08-03T09:00:00--2026-08-03T09:30:00]',
				'[clock::2026-08-03T09:30:00--2026-08-03T10:00:00]'
			)
		)

		// Grab Task B (30 px tall) 2 px above its bottom, on the resize
		// handle, and pull 15 px down: its end goes from 09:45 to 10:00.
		await browser
			.action('pointer', { parameters: { pointerType: 'mouse' } })
			.move({ origin: block('Task B, 09:15 to 09:45'), y: 13 })
			.down()
			.move({ origin: 'pointer', y: 15 })
			.up()
			.perform()
		await expect(block('Task B, 09:15 to 10:00')).toBeDisplayed()
		assert.strictEqual(
			await waitForChange(moved),
			moved.replace(
				'[clock::2026-08-03T09:15:00--2026-08-03T09:45:00]',
				'[clock::2026-08-03T09:15:00--2026-08-03T10:00:00]'
			)
		)
	})
})
