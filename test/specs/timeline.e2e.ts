import assert from 'node:assert'
import { browser, expect } from '@wdio/globals'
import { obsidianPage } from 'wdio-obsidian-service'
import { clickNoticeButton } from './support/notices'
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
	await waitForSteadyTimeline()
}

/**
 * Wait until the timeline stops moving. It scrolls to the note's start only
 * after its blocks are drawn; a pointer aimed at a block before that lands
 * hours away from it once the scroll comes in.
 */
async function waitForSteadyTimeline() {
	const element = await block('Task A, 09:00 to 09:30').getElement()
	let last = NaN
	await browser.waitUntil(
		async () => {
			const top = await browser.execute(
				(el) => el.getBoundingClientRect().top,
				element
			)
			const steady = top === last
			last = top
			return steady
		},
		{ interval: 150, timeoutMsg: 'the timeline kept moving' }
	)
}

async function focus(label: string) {
	// Focus without clicking: a click on a block opens its menu.
	const element = await block(label).getElement()
	await browser.execute((el) => el.focus(), element)
	await expect(element).toBeFocused()
}

/** Open notes at the remembered zoom, or fitted to their day. */
async function setFitOnOpen(fit: boolean) {
	await browser.executeObsidian(async ({ plugins }, fit) => {
		plugins.obsidianTaskTimeTracker.settings.timelineFitOnOpen = fit
		await plugins.obsidianTaskTimeTracker.saveSettings()
	}, fit)
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
	// The pixel arithmetic of these tests needs the default zoom, not one
	// fitted to the window.
	before(async function () {
		await setFitOnOpen(false)
	})

	after(async function () {
		await setFitOnOpen(true)
	})

	beforeEach(async function () {
		await resetVault()
	})

	it('opens a note fitted to its day', async function () {
		await setFitOnOpen(true)
		await openTimeline()
		// The note has no wake or bed time: its clocks, 09:00 to 09:45, fill
		// the view from its top (or as much of it as the zoom limit allows).
		const fitted = () =>
			browser.execute(() => {
				const panel = document.querySelector('[role="tabpanel"]')
				const toolbar = panel?.querySelector('.timeline-toolbar')
				const first = panel?.querySelector(
					'[aria-label="Task A, 09:00 to 09:30"]'
				)
				const last = panel?.querySelector(
					'[aria-label="Task B, 09:15 to 09:45"]'
				)
				if (!panel || !(toolbar instanceof HTMLElement) || !first || !last)
					return 'missing elements'
				const view = panel.getBoundingClientRect()
				const top = view.top + toolbar.offsetHeight
				const start = first.getBoundingClientRect().top
				const end = last.getBoundingClientRect().bottom
				return Math.abs(start - top) < 1 && end <= view.bottom
					? 'fitted'
					: `09:00 at ${start - top} px below the toolbar, 09:45 at ${end} of ${view.bottom}`
			})
		await browser.waitUntil(async () => (await fitted()) === 'fitted', {
			timeoutMsg: 'the day was not fitted',
		})
		assert.strictEqual(await fitted(), 'fitted')

		// Reopen the view at the remembered zoom for the other tests.
		await setFitOnOpen(false)
		await browser.executeObsidian(({ plugins }) =>
			plugins.obsidianTaskTimeTracker.refreshViews()
		)
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

		await clickNoticeButton(
			browser.$('.notice*=Task A 09:00–09:30 → 09:15–09:45'),
			'Undo'
		)
		await expect(block('Task A, 09:00 to 09:30')).toBeDisplayed()
		assert.strictEqual(await waitForChange(moved), before)
	})

	it('keeps the clock lines of a task in time order when a block moves above another', async function () {
		await obsidianPage.openFile(NOTE)
		const fixture = await obsidianPage.read(NOTE)
		const before = [
			fixture.trimEnd(),
			'- [ ] Lunch',
			'      [clock::2026-08-03T12:05:00--2026-08-03T12:10:00]',
			'      [clock::2026-08-03T12:10:00--2026-08-03T12:20:00]',
			'',
		].join('\n')
		await browser.executeObsidian(
			({ app }, path, content) => app.vault.adapter.write(path, content),
			NOTE,
			before
		)
		await openTimeline()
		await expect(block('Lunch, 12:10 to 12:20')).toBeDisplayed()

		// One step up lands on the 12:00 grid line, before the 12:05 clock:
		// the moved line goes first.
		await focus('Lunch, 12:10 to 12:20')
		await browser.keys('ArrowUp')
		await expect(block('Lunch, 12:00 to 12:10')).toBeDisplayed()
		const moved = await waitForChange(before)
		assert.strictEqual(
			moved,
			[
				fixture.trimEnd(),
				'- [ ] Lunch',
				'      [clock::2026-08-03T12:00:00--2026-08-03T12:10:00]',
				'      [clock::2026-08-03T12:05:00--2026-08-03T12:10:00]',
				'',
			].join('\n')
		)

		await clickNoticeButton(
			browser.$('.notice*=Lunch 12:10–12:20 → 12:00–12:10'),
			'Undo'
		)
		await expect(block('Lunch, 12:10 to 12:20')).toBeDisplayed()
		assert.strictEqual(await waitForChange(moved), before)
	})

	it('resizes an end with Shift, a running start with Alt, and finishes a running clock', async function () {
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

		// A running clock cannot move later (it would end past now); Alt
		// moves its start, and it keeps running.
		await focus('Lunch, 12:00 to now')
		await browser.keys('ArrowDown')
		await browser.keys(['Alt', 'ArrowUp'])
		await expect(block('Lunch, 11:45 to now')).toBeDisplayed()
		const started = await waitForChange(resized)
		assert.strictEqual(
			started,
			resized.replace(
				'[clock::2026-08-03T12:00:00]',
				'[clock::2026-08-03T11:45:00]'
			)
		)

		// Pulling its end up finishes it. On a past day the running block
		// ends at the end of the axis, midnight, so one step up is 23:45.
		await browser.keys(['Shift', 'ArrowUp'])
		await expect(block('Lunch, 11:45 to 23:45')).toBeDisplayed()
		assert.strictEqual(
			await waitForChange(started),
			started.replace(
				'[clock::2026-08-03T11:45:00]',
				'[clock::2026-08-03T11:45:00--2026-08-03T23:45:00]'
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
		// scrollTop holds whole pixels, so each zoom step may round the
		// middle by a pixel: allow a thousandth of the day either way.
		const drift = Math.abs((await middleOfView()) - before)
		assert.ok(drift <= 0.001, `the middle moved by ${drift} of the day`)

		await browser.executeObsidian(async ({ plugins }) => {
			plugins.obsidianTaskTimeTracker.settings.timelineZoom = 60
			await plugins.obsidianTaskTimeTracker.saveSettings()
			await plugins.obsidianTaskTimeTracker.refreshViews()
		})
	})

	/**
	 * Drag over empty space from `fromCenter` px off Task A's center (09:15)
	 * down by `length` px, then wait for the task picker.
	 */
	async function draw(fromCenter: number, length: number, times: string) {
		await browser
			.action('pointer', { parameters: { pointerType: 'mouse' } })
			.move({ origin: block('Task A, 09:00 to 09:30'), y: fromCenter })
			.down()
			.move({ origin: 'pointer', y: length })
			.up()
			.perform()
		const picker = browser.$('.prompt')
		await expect(picker).toBeDisplayed()
		await expect(picker.$('input')).toHaveAttribute(
			'placeholder',
			`Task for ${times}`
		)
		return picker
	}

	it('draws a clock on empty space and files it among the task clocks', async function () {
		await openTimeline()
		const before = await obsidianPage.read(NOTE)

		// 45 px above 09:15 is 08:30; 15 px more is the 15 min step.
		const picker = await draw(-45, 15, '08:30–08:45')
		await browser.keys([...'Task B'])
		const taskB = picker.$('.suggestion-item*=Task B')
		await expect(taskB).toBeDisplayed()
		await taskB.click()

		await expect(block('Task B, 08:30 to 08:45')).toBeDisplayed()
		// Before Task B's 09:15 clock, not after it: in time order.
		assert.strictEqual(
			await waitForChange(before),
			before.replace(
				'      [clock::2026-08-03T09:15:00--2026-08-03T09:45:00]',
				'      [clock::2026-08-03T08:30:00--2026-08-03T08:45:00]\n' +
					'      [clock::2026-08-03T09:15:00--2026-08-03T09:45:00]'
			)
		)
	})

	it('draws a clock for a new task, then undoes it', async function () {
		await openTimeline()
		const before = await obsidianPage.read(NOTE)

		// 45 px below 09:15 is 10:00; 30 px more is half an hour.
		const picker = await draw(45, 30, '10:00–10:30')
		await browser.keys([...'Retro #team'])
		const create = picker.$('.suggestion-item*=Create')
		await expect(create).toHaveText('➕ Create "Retro #team"')
		await create.click()

		await expect(block('Retro, 10:00 to 10:30')).toBeDisplayed()
		const added = await waitForChange(before)
		assert.strictEqual(
			added,
			`${before.trimEnd()}\n- [ ] Retro #team\n      [clock::2026-08-03T10:00:00--2026-08-03T10:30:00]\n`
		)

		// Undo takes the task line it added away with the clock.
		await clickNoticeButton(
			browser.$('.notice*=Added Retro 10:00–10:30'),
			'Undo'
		)
		await expect(block('Task A, 09:00 to 09:30')).toBeDisplayed()
		assert.strictEqual(await waitForChange(added), before)
	})

	/** Click a block, check its menu lists `items`, and pick `choice`. */
	async function chooseFromMenu(
		label: string,
		items: string[],
		choice: string
	) {
		await block(label).click()
		const menu = browser.$('.menu')
		await expect(menu).toBeDisplayed()
		const list = menu.$('.menu-group')
		await expect(list).toHaveChildren(items.length)
		for (const [index, item] of items.entries()) {
			await expect(list.$(`.menu-item:nth-child(${index + 1})`)).toHaveText(
				item
			)
		}
		await menu.$(`.menu-item*=${choice}`).click()
	}

	it('deletes a clock line from the block menu, then undoes it', async function () {
		await openTimeline()
		const before = await obsidianPage.read(NOTE)

		await chooseFromMenu(
			'Task A, 09:00 to 09:30',
			['Go to clock line', 'Remove end time', 'Delete clock line'],
			'Delete clock line'
		)
		// The task line stays, without its only clock.
		const deleted = await waitForChange(before)
		assert.strictEqual(
			deleted,
			before.replace(
				'      [clock::2026-08-03T09:00:00--2026-08-03T09:30:00]\n',
				''
			)
		)
		await expect(block('Task B, 09:15 to 09:45')).toBeDisplayed()

		await clickNoticeButton(
			browser.$('.notice*=Deleted Task A 09:00–09:30'),
			'Undo'
		)
		await expect(block('Task A, 09:00 to 09:30')).toBeDisplayed()
		assert.strictEqual(await waitForChange(deleted), before)
	})

	it('removes the end time of a clock from the block menu', async function () {
		await openTimeline()
		const before = await obsidianPage.read(NOTE)

		await chooseFromMenu(
			'Task B, 09:15 to 09:45',
			['Go to clock line', 'Remove end time', 'Delete clock line'],
			'Remove end time'
		)
		await expect(block('Task B, 09:15 to now')).toBeDisplayed()
		assert.strictEqual(
			await waitForChange(before),
			before.replace(
				'[clock::2026-08-03T09:15:00--2026-08-03T09:45:00]',
				'[clock::2026-08-03T09:15:00]'
			)
		)
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
