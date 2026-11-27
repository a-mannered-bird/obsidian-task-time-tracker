import assert from 'node:assert'
import { browser, expect } from '@wdio/globals'
import { obsidianPage } from 'wdio-obsidian-service'
import { TEST_IDS } from '../../src/components/testIds'
import { openDailyView } from './support/dailyView'
import { clickNoticeButton, noticeWith } from './support/notices'
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
	await openDailyView('Timeline')
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

type NoteViews = Record<string, { zoom?: number; top?: number }>

/**
 * Set the zoom and scroll remembered per note (a note without a zoom opens
 * fitted to its day) and reopen the view with them. The view saves what was
 * changed in it as it closes, so it is closed before they are set.
 */
async function setNoteViews(views: NoteViews) {
	await browser.executeObsidian(async ({ plugins }, views) => {
		const plugin = plugins.obsidianTaskTimeTracker
		await plugin.refreshViews()
		plugin.settings.timelineViews = views
		await plugin.saveSettings()
		await plugin.refreshViews()
	}, views)
}

/** The pixel arithmetic of these tests needs the default zoom, not one fitted to the window. */
const DEFAULT_ZOOM = { [NOTE]: { zoom: 60 } }

const savedViews = () =>
	browser.executeObsidian(
		({ plugins }) => plugins.obsidianTaskTimeTracker.settings.timelineViews
	)

async function waitForSavedZoom(zoom: number) {
	await browser.waitUntil(
		async () => (await savedViews())[NOTE]?.zoom === zoom,
		{ timeoutMsg: `the zoom saved for ${NOTE} is not ${zoom}` }
	)
}

/** Where a block stands in the window, from its top. */
async function topOf(label: string) {
	const element = await block(label).getElement()
	return browser.execute((el) => el.getBoundingClientRect().top, element)
}

/**
 * Whether the view shows from the start of `first` at its top, just under
 * the toolbar, to the end of `last` (as much as the zoom limit allows).
 */
function fittedBetween(first: string, last: string) {
	return browser.execute(
		(first, last) => {
			const panel = document.querySelector('[role="tabpanel"]')
			const toolbar = panel?.querySelector('.timeline-toolbar')
			const top = panel?.querySelector(`[aria-label="${first}"]`)
			const bottom = panel?.querySelector(`[aria-label="${last}"]`)
			if (!panel || !(toolbar instanceof HTMLElement) || !top || !bottom)
				return 'missing elements'
			const view = panel.getBoundingClientRect()
			const viewTop = view.top + toolbar.offsetHeight
			const start = top.getBoundingClientRect().top
			const end = bottom.getBoundingClientRect().bottom
			return Math.abs(start - viewTop) < 1 && end < view.bottom + 1
				? 'fitted'
				: `start at ${start - viewTop} px below the toolbar, end at ${end} of ${view.bottom}`
		},
		first,
		last
	)
}

async function expectFitted(first: string, last: string) {
	let state = ''
	// The assertion says what was seen instead, should the wait run out.
	await browser
		.waitUntil(
			async () => (state = await fittedBetween(first, last)) === 'fitted'
		)
		.catch(() => undefined)
	assert.strictEqual(state, 'fitted')
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
		await setNoteViews(DEFAULT_ZOOM)
		await resetVault()
	})

	after(async function () {
		await setNoteViews({})
	})

	it('opens a note without a zoom of its own fitted to its day', async function () {
		await setNoteViews({})
		await openTimeline()
		// The note has no start or end of day: its clocks, 09:00 to 09:45, fill
		// the view from its top (or as much of it as the zoom limit allows).
		await expectFitted('Task A, 09:00 to 09:30', 'Task B, 09:15 to 09:45')
	})

	it('remembers the zoom of each note', async function () {
		await openTimeline()
		const taskA = block('Task A, 09:00 to 09:30')
		await expect(taskA).toHaveStyle({ height: '30px' })

		// Two steps of 1.5 take 60 px per hour to 135: half an hour is 67.5 px.
		const zoomIn = browser.$('button[aria-label="Zoom in"]')
		await zoomIn.click()
		await expect(zoomIn).toBeEnabled()
		await zoomIn.click()
		await expect(taskA).toHaveStyle({ height: '67.5px' })
		await waitForSavedZoom(135)

		// The day before has no zoom of its own: fitted, and not saved as chosen.
		await browser.$('button[aria-label="Previous daily note"]').click()
		await expect(block('Deep work, 09:00 to 09:45')).toBeDisplayed()
		await expectFitted('Deep work, 09:00 to 09:45', 'Task B, 11:30 to 12:00')
		assert.deepStrictEqual(Object.keys(await savedViews()), [NOTE])

		await browser.$('button[aria-label="Next daily note"]').click()
		await expect(taskA).toHaveStyle({ height: '67.5px' })
	})

	it('remembers the scroll of each note', async function () {
		await openTimeline()
		const opened = await topOf('Task A, 09:00 to 09:30')

		// Five hours further down the day, at 60 px per hour.
		const element = await block('Task A, 09:00 to 09:30').getElement()
		await browser.execute((el) => {
			let node = el.parentElement
			while (
				node &&
				!['auto', 'scroll'].includes(getComputedStyle(node).overflowY)
			)
				node = node.parentElement
			node?.scrollBy(0, 300)
		}, element)
		await browser.waitUntil(
			async () => (await savedViews())[NOTE]?.top !== undefined,
			{ timeoutMsg: `no scroll was saved for ${NOTE}` }
		)
		const scrolled = await topOf('Task A, 09:00 to 09:30')
		assert.ok(
			Math.abs(scrolled - (opened - 300)) <= 1,
			`Task A went from ${opened} to ${scrolled}`
		)

		await browser.$('button[aria-label="Previous daily note"]').click()
		await expect(block('Deep work, 09:00 to 09:45')).toBeDisplayed()
		await browser.$('button[aria-label="Next daily note"]').click()
		await expect(block('Task A, 09:00 to 09:30')).toBeDisplayed()
		await waitForSteadyTimeline()
		const back = await topOf('Task A, 09:00 to 09:30')
		assert.ok(
			Math.abs(back - scrolled) <= 1,
			`Task A came back at ${back}, not ${scrolled}`
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
			noticeWith('"Task A" 09:00–09:30 → 09:15–09:45'),
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
			noticeWith('"Lunch" 12:10–12:20 → 12:00–12:10'),
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
		await waitForSavedZoom(135)
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
	})

	it('zooms with a two-finger pinch, around the fingers', async function () {
		await openTimeline()
		const taskA = block('Task A, 09:00 to 09:30')
		await expect(taskA).toHaveStyle({ height: '30px' })
		const element = await taskA.getElement()
		const centerOf = () =>
			browser.execute((el) => {
				const rect = el.getBoundingClientRect()
				return {
					x: Math.round(rect.left + rect.width / 2),
					y: Math.round(rect.top + rect.height / 2),
				}
			}, element)
		const center = await centerOf()

		// Fingers 50 px apart around Task A's middle (09:15) spread to 100 px:
		// twice the zoom, 120 px per hour, so the half-hour block is 60 px.
		const finger = (from: number, to: number) =>
			browser
				.action('pointer', { parameters: { pointerType: 'touch' } })
				.move({ x: center.x, y: center.y + from })
				.down()
				.pause(50)
				.move({ x: center.x, y: center.y + to, duration: 300 })
				.up()
		await browser.actions([finger(-25, -50), finger(25, 50)])

		await expect(taskA).toHaveStyle({ height: '60px' })
		// 09:15 stayed between the fingers.
		const after = await centerOf()
		assert.ok(
			Math.abs(after.y - center.y) <= 1,
			`09:15 moved from ${center.y} to ${after.y}`
		)
		await waitForSavedZoom(120)
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
		await clickNoticeButton(noticeWith('Added "Retro" 10:00–10:30'), 'Undo')
		await expect(block('Task A, 09:00 to 09:30')).toBeDisplayed()
		assert.strictEqual(await waitForChange(added), before)
	})

	it('outlines the clock a click would add on hovering empty space', async function () {
		await openTimeline()

		// 40 px above 09:15 is 08:35, in the step starting at 08:30: the
		// outline spans 08:30–09:00, ending where Task A starts.
		await browser
			.action('pointer', { parameters: { pointerType: 'mouse' } })
			.move({ origin: block('Task A, 09:00 to 09:30'), y: -40 })
			.perform()
		const slot = browser.$(`[data-testid="${TEST_IDS.timelineClickSlot}"]`)
		await expect(slot).toExist()
		const { slotHeight, gapToTaskA } = await browser.execute(
			(slot, taskA) => {
				const outline = slot.getBoundingClientRect()
				return {
					slotHeight: Math.round(outline.height),
					gapToTaskA: Math.round(
						taskA.getBoundingClientRect().top - outline.bottom
					),
				}
			},
			await slot.getElement(),
			await block('Task A, 09:00 to 09:30').getElement()
		)
		// Half an hour at the default zoom of 60 px per hour.
		assert.strictEqual(slotHeight, 30)
		assert.strictEqual(gapToTaskA, 0)
	})

	it('adds a half-hour clock on a click on empty space', async function () {
		await openTimeline()
		const before = await obsidianPage.read(NOTE)

		// 40 px above 09:15 is 08:35, in the step starting at 08:30.
		await browser
			.action('pointer', { parameters: { pointerType: 'mouse' } })
			.move({ origin: block('Task A, 09:00 to 09:30'), y: -40 })
			.down()
			.up()
			.perform()
		await pickTask('Task for 08:30–09:00', 'Task B', 'Task B')

		await expect(block('Task B, 08:30 to 09:00')).toBeDisplayed()
		assert.strictEqual(
			await waitForChange(before),
			before.replace(
				'      [clock::2026-08-03T09:15:00--2026-08-03T09:45:00]',
				'      [clock::2026-08-03T08:30:00--2026-08-03T09:00:00]\n' +
					'      [clock::2026-08-03T09:15:00--2026-08-03T09:45:00]'
			)
		)
	})

	it('draws a clock beside the clocks of a busy hour, in the space kept free', async function () {
		await openTimeline()
		const before = await obsidianPage.read(NOTE)

		// At 09:15 Task A and Task B share the width; the strip right of
		// them stays empty. Both ends stick to Task B's edges, 09:15 and 09:45.
		const start = await browser.execute(
			(el) => {
				const lanes = el.parentElement?.getBoundingClientRect()
				const rect = el.getBoundingClientRect()
				return {
					x: Math.round((lanes?.right ?? 0) - 6),
					y: Math.round(rect.top + rect.height / 2),
				}
			},
			await block('Task A, 09:00 to 09:30').getElement()
		)
		await browser
			.action('pointer', { parameters: { pointerType: 'mouse' } })
			.move(start)
			.down()
			.move({ origin: 'pointer', y: 30 })
			.up()
			.perform()
		await pickTask('Task for 09:15–09:45', 'Review', 'Create')

		await expect(block('Review, 09:15 to 09:45')).toBeDisplayed()
		assert.strictEqual(
			await waitForChange(before),
			`${before.trimEnd()}\n- [ ] Review\n      [clock::2026-08-03T09:15:00--2026-08-03T09:45:00]\n`
		)
	})

	/** Check the open block menu lists `items`, and pick `choice`. */
	async function chooseFromOpenMenu(items: string[], choice: string) {
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

	/** Click a block, check its menu lists `items`, and pick `choice`. */
	async function chooseFromMenu(
		label: string,
		items: string[],
		choice: string
	) {
		await block(label).click()
		await chooseFromOpenMenu(items, choice)
	}

	const FINISHED_LATEST_CLOCK_MENU = [
		'Go to clock line',
		'Remove end time',
		'Duplicate as…',
		'Delete clock line',
	]

	/** Pick `choice` in the task picker opened with `placeholder`. */
	async function pickTask(placeholder: string, typed: string, choice: string) {
		const picker = browser.$('.prompt')
		await expect(picker).toBeDisplayed()
		await expect(picker.$('input')).toHaveAttribute('placeholder', placeholder)
		await browser.keys([...typed])
		const row = picker.$(`.suggestion-item*=${choice}`)
		await expect(row).toBeDisplayed()
		await row.click()
	}

	it('deletes a clock line from the block menu, then undoes it', async function () {
		await openTimeline()
		const before = await obsidianPage.read(NOTE)

		await chooseFromMenu(
			'Task A, 09:00 to 09:30',
			FINISHED_LATEST_CLOCK_MENU,
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

		await clickNoticeButton(noticeWith('Deleted "Task A" 09:00–09:30'), 'Undo')
		await expect(block('Task A, 09:00 to 09:30')).toBeDisplayed()
		assert.strictEqual(await waitForChange(deleted), before)
	})

	it('removes the end time of a clock from the block menu', async function () {
		await openTimeline()
		const before = await obsidianPage.read(NOTE)

		await chooseFromMenu(
			'Task B, 09:15 to 09:45',
			FINISHED_LATEST_CLOCK_MENU,
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

	it('duplicates a clock as another task of the note, then undoes it', async function () {
		await openTimeline()
		const before = await obsidianPage.read(NOTE)

		await chooseFromMenu(
			'Task A, 09:00 to 09:30',
			FINISHED_LATEST_CLOCK_MENU,
			'Duplicate as…'
		)
		// The picker offers the other tasks only: Task A's copy would count
		// its time twice.
		await pickTask('Duplicate 09:00–09:30 as…', 'Email', 'Email')

		await expect(block('Email, 09:00 to 09:30')).toBeDisplayed()
		await expect(block('Task A, 09:00 to 09:30')).toBeDisplayed()
		const duplicated = await waitForChange(before)
		assert.strictEqual(
			duplicated,
			before.replace(
				'- [ ] Email',
				'- [ ] Email\n      [clock::2026-08-03T09:00:00--2026-08-03T09:30:00]'
			)
		)

		await clickNoticeButton(
			noticeWith('Duplicated "Task A" 09:00–09:30 as "Email"'),
			'Undo'
		)
		await expect(block('Task A, 09:00 to 09:30')).toBeDisplayed()
		assert.strictEqual(await waitForChange(duplicated), before)
	})

	it('opens the block menu from its ⋯ button and duplicates a clock as a new task', async function () {
		await openTimeline()
		const before = await obsidianPage.read(NOTE)

		// With a mouse the button shows while pointing at its block.
		const more = block('Task B, 09:15 to 09:45').$(
			'button[aria-label="More actions for Task B, 09:15 to 09:45"]'
		)
		await block('Task B, 09:15 to 09:45').moveTo()
		await expect(more).toBeDisplayed()
		await more.click()
		await chooseFromOpenMenu(FINISHED_LATEST_CLOCK_MENU, 'Duplicate as…')
		await pickTask('Duplicate 09:15–09:45 as…', 'Retro #team', 'Create')

		await expect(block('Retro, 09:15 to 09:45')).toBeDisplayed()
		assert.strictEqual(
			await waitForChange(before),
			`${before.trimEnd()}\n- [ ] Retro #team\n      [clock::2026-08-03T09:15:00--2026-08-03T09:45:00]\n`
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

	it('drags the end and start of day lines, never past each other', async function () {
		await obsidianPage.write(
			NOTE,
			[
				'---',
				'day_start: 2026-08-03T08:00:00',
				'day_end: 2026-08-03T10:00:00',
				'---',
				'- [ ] Task A #project',
				'      [clock::2026-08-03T09:00:00--2026-08-03T09:30:00]',
				'- [ ] Task B #project',
				'      [clock::2026-08-03T09:15:00--2026-08-03T09:45:00]',
				'',
			].join('\n')
		)
		await openTimeline()
		const end = browser.$(
			'button[aria-label^="End of day"][aria-label$="drag or click to change"]'
		)
		const start = browser.$(
			'button[aria-label^="Start of day"][aria-label$="drag or click to change"]'
		)
		await expect(end).toHaveText('End 10:00')
		await expect(start).toHaveText('Start 08:00')

		// 60 px up is an hour: 09:00, but Task B ends at 09:45 and the day
		// cannot end before its last clock, so the line stops there.
		let content = await obsidianPage.read(NOTE)
		await browser
			.action('pointer', { parameters: { pointerType: 'mouse' } })
			.move({ origin: end })
			.down()
			.move({ origin: 'pointer', y: -60 })
			.up()
			.perform()
		await expect(end).toHaveText('End 09:45')
		content = await waitForChange(content)
		assert.match(content, /\nday_end: 2026-08-03T09:45:00\n/)

		// 120 px down would start the day at 10:00, after its 09:45 end:
		// the start stops at the end.
		await browser
			.action('pointer', { parameters: { pointerType: 'mouse' } })
			.move({ origin: start })
			.down()
			.move({ origin: 'pointer', y: 120 })
			.up()
			.perform()
		await expect(start).toHaveText('Start 09:45')
		content = await waitForChange(content)
		assert.match(content, /\nday_start: 2026-08-03T09:45:00\n/)
	})
})
