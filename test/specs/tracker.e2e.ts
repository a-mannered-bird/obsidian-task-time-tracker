import assert from 'node:assert'
import { browser, expect } from '@wdio/globals'
import { obsidianPage } from 'wdio-obsidian-service'
import { dayNote } from './support/days'
import { clickNoticeButton } from './support/notices'
import { resetVault } from './support/vault'

/**
 * The tracker tab drives the engine from its bar, rows and cards. Clocks
 * started here carry the current time, so the assertions check which
 * clocks run and which closed rather than exact timestamps.
 */

const today = dayNote(0)
/** A fixture note followed by a later one (2026-08-03). */
const pastNote = { path: '2026-08-02.md', date: '2026-08-02' }

type Clock = { start: string; end: string | null }

/** The clock lines below a task line, in note order. */
function clocksOf(content: string, line: string): Clock[] {
	const lines = content.split('\n')
	const clocks: Clock[] = []
	for (const text of lines.slice(lines.indexOf(line) + 1)) {
		const match = /^\s+\[clock::([^\]]+?)(?:--([^\]]+))?\]$/.exec(text)
		if (!match) break
		clocks.push({ start: match[1]!, end: match[2] ?? null })
	}
	return clocks
}

/** Running or closed, clock by clock. */
function states(content: string, line: string): string[] {
	return clocksOf(content, line).map((clock) =>
		clock.end === null ? 'running' : 'closed'
	)
}

async function writeToday(lines: string[]): Promise<string> {
	const content = `${lines.join('\n')}\n`
	await obsidianPage.write(today.path, content)
	return content
}

async function openTracker(path = today.path) {
	await obsidianPage.openFile(path)
	await browser.executeObsidianCommand(
		'obsidian-task-time-tracker:open-daily-view'
	)
	const tab = browser.$('button[role="tab"]=Tracker')
	// Pressed through the DOM: a late notice of the previous test can still
	// cover the tab and swallow a real click.
	const element = await tab.getElement()
	await browser.execute((el) => el.click(), element)
	await expect(tab).toHaveAttribute('aria-selected', 'true')
}

async function waitForChange(
	before: string,
	path = today.path
): Promise<string> {
	await browser.waitUntil(
		async () => (await obsidianPage.read(path)) !== before,
		{ timeoutMsg: `${path} was not rewritten` }
	)
	return obsidianPage.read(path)
}

const button = (label: string) => browser.$(`button[aria-label="${label}"]`)

/** The modal on top of the stack, if any. */
async function topModal() {
	const containers = await browser.$$('.modal-container').getElements()
	return containers[containers.length - 1]?.$('.modal')
}

/**
 * The top modal once it is the one titled so: a modal opened by a click
 * takes a moment, and the one it replaces lingers while closing.
 */
async function modalTitled(title: string) {
	await browser.waitUntil(
		async () =>
			(await (await topModal())?.$('.modal-title').getText()) === title,
		{ timeoutMsg: `no "${title}" modal opened` }
	)
	const modal = await topModal()
	assert.ok(modal)
	await expect(modal.$('.modal-title')).toHaveText(title)
	return modal
}

/** Open a row's ⋯ menu and pick the item titled `choice`. */
async function chooseFromRowMenu(taskName: string, choice: string) {
	// Pressed through the DOM: a notice of an earlier step can cover the row.
	const more = await button(`More actions for ${taskName}`).getElement()
	await browser.execute((el) => el.click(), more)
	const item = browser.$('.menu').$(`.menu-item-title=${choice}`)
	await expect(item).toBeDisplayed()
	await item.click()
}

/** The plan's rows, by name, in the order shown. */
async function expectPlan(names: string[]) {
	const rows = browser.$('section[aria-labelledby="plan-title"] > ul')
	await expect(rows).toHaveChildren(names.length)
	for (const [index, name] of names.entries()) {
		// A row reads its name first, then its total.
		await expect(rows.$(`li:nth-child(${index + 1})`)).toHaveText(
			new RegExp(`^${name}(\\s|$)`)
		)
	}
}

/**
 * Drag a plan row's name onto another row, `offset` px from its middle:
 * above the middle drops before that row, below it after.
 */
async function dragName(name: string, onto: string, offset: number) {
	const plan = browser.$('section[aria-labelledby="plan-title"] > ul')
	const pointer = () =>
		browser.action('pointer', { parameters: { pointerType: 'mouse' } })
	await pointer()
		.move({ origin: plan.$(`span=${name}`) })
		.down()
		.move({ origin: plan.$(`span=${onto}`), y: offset })
		.perform(true)
	// Held mid-drag: a copy of the dragged row follows the pointer.
	const ghost = browser.$('body > li[aria-hidden="true"]')
	await expect(ghost).toBeDisplayed()
	await expect(ghost).toHaveText(new RegExp(`^${name}(\\s|$)`))
	await pointer().up().perform()
	// Positive matchers only (see AGENTS.md): the trace mislabels `.not`.
	assert.strictEqual(await ghost.isExisting(), false)
}

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

describe('tracker tab', function () {
	beforeEach(async function () {
		await resetVault()
	})

	afterEach(async function () {
		// The reset deletes today's note and restores the fixtures: forget
		// the clocks started here.
		await browser.executeObsidian(
			({ plugins }, paths) => {
				for (const path of paths) {
					plugins.obsidianTaskTimeTracker.lostClocks.forget(path)
				}
			},
			[today.path, pastNote.path]
		)
	})

	it('starts a task, adds one alongside, then switches to a third', async function () {
		let content = await writeToday([
			'- [ ] Chores',
			'- [ ] German podcast',
			'- [ ] Email',
		])
		await openTracker()
		await expect(browser.$("h2=Today's plan")).toBeDisplayed()

		// Nothing runs: each row offers a single Start.
		await button('Start Chores').click()
		content = await waitForChange(content)
		assert.deepStrictEqual(states(content, '- [ ] Chores'), ['running'])
		await expect(button('Stop Chores')).toBeDisplayed()

		// Now rows switch, or start alongside.
		await expect(button('Start German podcast alongside')).toBeEnabled()
		await button('Start German podcast alongside').click()
		content = await waitForChange(content)
		assert.deepStrictEqual(states(content, '- [ ] Chores'), ['running'])
		assert.deepStrictEqual(states(content, '- [ ] German podcast'), ['running'])
		await expect(browser.$('button=Stop all')).toBeDisplayed()

		await button('Switch to Email').click()
		content = await waitForChange(content)
		assert.deepStrictEqual(states(content, '- [ ] Chores'), ['closed'])
		assert.deepStrictEqual(states(content, '- [ ] German podcast'), ['closed'])
		assert.deepStrictEqual(states(content, '- [ ] Email'), ['running'])
		await expect(button('Stop Email')).toBeDisplayed()
	})

	it('pauses two tasks for an interruption and resumes both', async function () {
		let content = await writeToday([
			'- [ ] Chores',
			`      [clock::${today.date}T00:00:00]`,
			'- [ ] German podcast',
			`      [clock::${today.date}T00:00:00]`,
		])
		await openTracker()

		const interruption = browser.$('button=Interruption')
		await expect(interruption).toHaveAttribute('aria-pressed', 'false')
		await interruption.click()
		content = await waitForChange(content)
		assert.deepStrictEqual(states(content, '- [ ] Chores'), ['closed'])
		assert.deepStrictEqual(states(content, '- [ ] German podcast'), ['closed'])
		await expect(interruption).toHaveAttribute('aria-pressed', 'true')
		// The paused tasks say so in the plan; the interruption is one row.
		await expect(browser.$('li*=Chores').$('span=paused')).toBeDisplayed()
		await expect(
			browser.$('li*=German podcast').$('span=paused')
		).toBeDisplayed()

		// Notices open over the sidebar's top, where the running rows are:
		// press the button through the DOM.
		const end = await button('End interruption').getElement()
		await browser.execute((el) => el.click(), end)
		const picker = browser.$('.prompt')
		await expect(picker).toBeDisplayed()
		await browser.keys([...'Phone call'])
		await expect(picker.$('.suggestion-item.is-selected')).toHaveText(
			'➕ Create "Phone call"'
		)
		await browser.keys('Enter')

		content = await waitForChange(content)
		// Both resume, and the interruption's time went to the task named.
		assert.deepStrictEqual(states(content, '- [ ] Chores'), [
			'closed',
			'running',
		])
		assert.deepStrictEqual(states(content, '- [ ] German podcast'), [
			'closed',
			'running',
		])
		assert.deepStrictEqual(states(content, '- [ ] Phone call'), ['closed'])
		await expect(interruption).toHaveAttribute('aria-pressed', 'false')
	})

	it('lists the bar suggestions in the task switcher order', async function () {
		await writeToday([
			'- [x] Breakfast',
			`      [clock::${today.date}T07:30:00--${today.date}T07:50:00]`,
			'- [ ] Email',
			'- [ ] Write',
			`      [clock::${today.date}T08:00:00]`,
		])
		await openTracker()

		const bar = browser.$('input[aria-label="Task to start"]')
		await browser.execute((el) => el.focus(), await bar.getElement())
		await expect(bar).toBeFocused()
		// The list redraws once the other notes' tasks have loaded.
		await expect(browser.$('li=Other notes')).toBeDisplayed()
		// Running first, then open, then done: not the note's line order.
		const option = (index: number) => browser.$$('[role="option"]')[index]!
		await expect(option(0)).toHaveText(expect.stringContaining('Write'))
		await expect(option(1)).toHaveText(expect.stringContaining('Email'))
		await expect(option(2)).toHaveText(expect.stringContaining('Breakfast'))
	})

	it('starts the tasks picked from the bar alongside until Switch is pressed', async function () {
		let content = await writeToday([
			'- [ ] Chores',
			`      [clock::${today.date}T00:00:00]`,
			'- [ ] Email',
			'- [ ] Run',
		])
		await openTracker()
		const bar = browser.$('input[aria-label="Task to start"]')
		const list = browser.$('[role="listbox"]')
		const switchButton = button('Switch')
		const alongside = button('Start alongside')
		// Pressed through the DOM: notices of earlier steps can cover the bar.
		const press = async (target: typeof alongside) =>
			browser.execute((el) => el.click(), await target.getElement())
		await expect(switchButton).toHaveAttribute('aria-pressed', 'true')

		// With nothing typed, a button only opens the list to pick from.
		await press(switchButton)
		await expect(bar).toBeFocused()
		await expect(list).toBeDisplayed()
		assert.strictEqual(await obsidianPage.read(today.path), content)

		await press(alongside)
		await expect(alongside).toHaveAttribute('aria-pressed', 'true')
		await expect(switchButton).toHaveAttribute('aria-pressed', 'false')
		await expect(bar).toHaveAttribute('placeholder', 'Are you multi-tasking?')
		await expect(list).toBeDisplayed()
		assert.strictEqual(await obsidianPage.read(today.path), content)

		await browser.keys([...'Email'])
		await expect(bar).toHaveValue('Email')
		await browser.keys('Enter')
		content = await waitForChange(content)
		assert.deepStrictEqual(states(content, '- [ ] Chores'), ['running'])
		assert.deepStrictEqual(states(content, '- [ ] Email'), ['running'])
		// The mode outlives the pick.
		await expect(alongside).toHaveAttribute('aria-pressed', 'true')

		await press(switchButton)
		await expect(switchButton).toHaveAttribute('aria-pressed', 'true')
		await expect(bar).toHaveAttribute(
			'placeholder',
			'What task will you focus on?'
		)
		await expect(bar).toBeFocused()
		await browser.keys([...'Run'])
		await expect(bar).toHaveValue('Run')
		await browser.keys('Enter')
		content = await waitForChange(content)
		assert.deepStrictEqual(states(content, '- [ ] Chores'), ['closed'])
		assert.deepStrictEqual(states(content, '- [ ] Email'), ['closed'])
		assert.deepStrictEqual(states(content, '- [ ] Run'), ['running'])
	})

	it('unfolds the done tasks when nothing else is left', async function () {
		await writeToday([
			'- [x] Breakfast',
			`      [clock::${today.date}T07:30:00--${today.date}T07:50:00]`,
			'- [x] Read news',
		])
		await openTracker()

		await expect(browser.$('summary=Done (2)')).toBeDisplayed()
		await expect(browser.$('span=Read news')).toBeDisplayed()
	})

	it('marks a task done, adds one to the plan, then ends the day', async function () {
		let content = await writeToday([
			'- [ ] Write',
			`      [clock::${today.date}T00:00:00]`,
			'- [ ] Run',
		])
		await openTracker()

		await button('Done: stop and tick Write').click()
		content = await waitForChange(content)
		assert.deepStrictEqual(states(content, '- [x] Write'), ['closed'])
		await expect(browser.$('summary=Done (1)')).toBeDisplayed()

		const bar = browser.$('input[aria-label="Task to start"]')
		// Pressed through the DOM: the notice of the previous step can still
		// cover the bar.
		const plan = button('Plan task without starting timer')
		await browser.execute((el) => el.click(), await plan.getElement())
		await expect(plan).toHaveAttribute('aria-pressed', 'true')
		await expect(bar).toHaveAttribute(
			'placeholder',
			"Add a task to today's plan"
		)
		await expect(bar).toBeFocused()
		await browser.keys([...'Call the bank'])
		await expect(bar).toHaveValue('Call the bank')
		const create = browser.$('[role="option"][aria-selected="true"]')
		await expect(create).toHaveText(
			expect.stringContaining('➕ Create "Call the bank"')
		)
		await browser.keys('Enter')
		content = await waitForChange(content)
		assert.deepStrictEqual(content.trimEnd().split('\n').slice(-2), [
			'- [ ] Run',
			'- [ ] Call the bank',
		])
		await expect(button('Start Call the bank')).toBeDisplayed()

		// No end of day yet: End day asks for it, then confirms the deletion
		// of the two tasks never clocked.
		await browser.$('button=End day').click()
		const setEnd = await modalTitled('Set end of day')
		const endInput = setEnd.$('input[placeholder="14:30 or 15"]')
		await endInput.setValue('0')
		await expect(endInput).toHaveValue('0')
		await setEnd.$('button=OK').click()
		const modal = await modalTitled('End day')
		await expect(modal.$('li=Call the bank')).toBeDisplayed()
		await modal.$('button=End day').click()

		await browser.waitUntil(
			async () => !(await obsidianPage.read(today.path)).includes('- [ ] Run'),
			{ timeoutMsg: 'the day was not ended' }
		)
		content = await obsidianPage.read(today.path)
		assert.match(content, new RegExp(`^---\\nday_end: ${today.date}T`))
		assert.deepStrictEqual(
			content.split('\n').filter((line) => line.startsWith('- [')),
			['- [x] Write']
		)
	})

	it('ends the day no earlier than the last clock', async function () {
		const content = await writeToday([
			'---',
			`day_start: ${today.date}T08:00:00`,
			'---',
			'- [ ] Chores',
			`      [clock::${today.date}T21:00:00--${today.date}T22:30:00]`,
		])
		await openTracker()

		// Pressed through the DOM: a notice in the corner can cover the header.
		const setEnd = await browser
			.$('button[aria-label="Set end of day"]')
			.getElement()
		await browser.execute((el) => el.click(), setEnd)
		const modal = await modalTitled('Set end of day')
		await expect(
			modal.$('p*=before 22:30, the end of the last clock, means the next day')
		).toBeDisplayed()
		const input = modal.$('input[placeholder="14:30 or 15"]')
		await expect(input).toHaveValue('')
		// After the 08:00 start of day but before the clock ended at 22:30:
		// the day can only end then on the next day.
		await input.setValue('22:00')
		await expect(input).toHaveValue('22:00')
		await expect(modal.$('p*=22:00 tomorrow ·')).toBeDisplayed()
		await modal.$('button=OK').click()

		await waitForChange(content)
		await browser.waitUntil(
			async () => (await obsidianPage.read(today.path)).includes('day_end'),
			{ timeoutMsg: 'the end of day was not written' }
		)
		assert.match(
			await obsidianPage.read(today.path),
			new RegExp(`\\nday_end: ${dayNote(1).date}T22:00:00\\n`)
		)
		await expect(
			browser.$('button[aria-label="End of day 22:00, change"]')
		).toBeDisplayed()
	})

	it('moves a switch to the time it really happened', async function () {
		let content = await writeToday([
			'- [ ] Chores',
			`      [clock::${today.date}T00:00:00]`,
			'- [ ] Email',
		])
		await openTracker()

		await button('Switch to Email').click()
		content = await waitForChange(content)
		assert.deepStrictEqual(states(content, '- [ ] Chores'), ['closed'])
		assert.deepStrictEqual(states(content, '- [ ] Email'), ['running'])

		// One notice tells the switch, instead of one per clock.
		const notice = browser.$('.notice*=Switched from Chores to Email at')
		await clickNoticeButton(notice, 'Change')
		const modal = await modalTitled('Change the time')
		const input = modal.$('input[placeholder="14:30 or 15"]')
		await input.setValue('00:01')
		await expect(input).toHaveValue('00:01')
		await modal.$('button=Change').click()

		// Chores ends and Email starts at the time typed.
		content = await waitForChange(content)
		assert.deepStrictEqual(clocksOf(content, '- [ ] Chores'), [
			{ start: `${today.date}T00:00:00`, end: `${today.date}T00:01:00` },
		])
		assert.deepStrictEqual(clocksOf(content, '- [ ] Email'), [
			{ start: `${today.date}T00:01:00`, end: null },
		])
	})

	it('moves the start of a running task to the time typed', async function () {
		let content = await writeToday([
			'- [ ] Chores',
			`      [clock::${today.date}T00:00:00]`,
		])
		await openTracker()

		// One label, shown by Obsidian as the tooltip: start, total, action.
		const elapsed = browser.$(
			'button[aria-label$="Click to change when Chores started."]'
		)
		await expect(elapsed).toHaveAttribute(
			'aria-label',
			expect.stringContaining('Started 00:00')
		)
		await elapsed.click()
		const modal = await modalTitled('Change when Chores started')
		const input = modal.$('input[placeholder="14:30 or 15"]')
		await input.setValue('00:05')
		await expect(input).toHaveValue('00:05')
		await modal.$('button=Change').click()

		content = await waitForChange(content)
		assert.deepStrictEqual(clocksOf(content, '- [ ] Chores'), [
			{ start: `${today.date}T00:05:00`, end: null },
		])
		await expect(elapsed).toHaveAttribute(
			'aria-label',
			expect.stringContaining('Started 00:05')
		)
	})

	it('stops a running task at a typed time from its menu', async function () {
		let content = await writeToday([
			'- [ ] Chores',
			`      [clock::${today.date}T00:00:00]`,
		])
		await openTracker()

		await chooseFromRowMenu('Chores', 'Set clock stop time')
		const modal = await modalTitled('Set when Chores stopped')
		const input = modal.$('input[placeholder="14:30 or 15"]')
		await input.setValue('00:10')
		await expect(input).toHaveValue('00:10')
		await modal.$('button=Stop').click()

		content = await waitForChange(content)
		assert.deepStrictEqual(clocksOf(content, '- [ ] Chores'), [
			{ start: `${today.date}T00:00:00`, end: `${today.date}T00:10:00` },
		])
		await expect(button('Start Chores')).toBeDisplayed()
	})

	it('stops a running task when the last task ended', async function () {
		let content = await writeToday([
			'- [ ] Email',
			`      [clock::${today.date}T00:00:00--${today.date}T00:20:00]`,
			'- [ ] Chores',
			`      [clock::${today.date}T00:10:00]`,
		])
		await openTracker()

		await chooseFromRowMenu('Chores', 'Stop from last task end')
		content = await waitForChange(content)
		// Email ended at 00:20, so Chores, which ran alongside it, does too.
		assert.deepStrictEqual(clocksOf(content, '- [ ] Chores'), [
			{ start: `${today.date}T00:10:00`, end: `${today.date}T00:20:00` },
		])
		await expect(button('Start Chores')).toBeDisplayed()
	})

	it('reorders the plan from the row menus', async function () {
		let content = await writeToday([
			'- [ ] Email',
			`      [clock::${today.date}T00:00:00--${today.date}T00:20:00]`,
			'- [x] Breakfast',
			'- [ ] Run',
			'- [ ] Call the bank',
		])
		await openTracker()
		await expectPlan(['Email', 'Run', 'Call the bank'])

		await chooseFromRowMenu('Call the bank', 'Move to the top')
		content = await waitForChange(content)
		await expectPlan(['Call the bank', 'Email', 'Run'])
		assert.deepStrictEqual(content.trimEnd().split('\n'), [
			'- [ ] Call the bank',
			'- [ ] Email',
			`      [clock::${today.date}T00:00:00--${today.date}T00:20:00]`,
			'- [x] Breakfast',
			'- [ ] Run',
		])

		// Breakfast is in Done, not the plan: Email moves past it, below Run.
		await chooseFromRowMenu('Email', 'Move down')
		content = await waitForChange(content)
		await expectPlan(['Call the bank', 'Run', 'Email'])
		assert.deepStrictEqual(content.trimEnd().split('\n'), [
			'- [ ] Call the bank',
			'- [x] Breakfast',
			'- [ ] Run',
			'- [ ] Email',
			`      [clock::${today.date}T00:00:00--${today.date}T00:20:00]`,
		])
	})

	it('reorders the plan by dragging task names', async function () {
		let content = await writeToday([
			'- [ ] Email',
			`      [clock::${today.date}T00:00:00--${today.date}T00:20:00]`,
			'- [x] Breakfast',
			'- [ ] Run',
			'- [ ] Call the bank',
		])
		await openTracker()
		await expectPlan(['Email', 'Run', 'Call the bank'])

		// Dropped on the upper half of a row: the task lands above it.
		await dragName('Call the bank', 'Email', -6)
		content = await waitForChange(content)
		await expectPlan(['Call the bank', 'Email', 'Run'])
		assert.deepStrictEqual(content.trimEnd().split('\n'), [
			'- [ ] Call the bank',
			'- [ ] Email',
			`      [clock::${today.date}T00:00:00--${today.date}T00:20:00]`,
			'- [x] Breakfast',
			'- [ ] Run',
		])

		// Below the last row: Email goes after Run, past Breakfast (in Done).
		await dragName('Email', 'Run', 6)
		content = await waitForChange(content)
		await expectPlan(['Call the bank', 'Run', 'Email'])
		assert.deepStrictEqual(content.trimEnd().split('\n'), [
			'- [ ] Call the bank',
			'- [x] Breakfast',
			'- [ ] Run',
			'- [ ] Email',
			`      [clock::${today.date}T00:00:00--${today.date}T00:20:00]`,
		])
	})

	it('migrates the last clock of a task to another one', async function () {
		let content = await writeToday([
			'- [ ] Email',
			`      [clock::${today.date}T00:00:00--${today.date}T00:20:00]`,
			'- [ ] Run',
		])
		await openTracker()

		await chooseFromRowMenu('Email', 'Migrate last clock to another task')
		const picker = browser.$('.prompt')
		await expect(picker).toBeDisplayed()
		await browser.keys([...'Run'])
		await expect(picker.$('.suggestion-item.is-selected')).toHaveText(
			expect.stringContaining('Run')
		)
		await browser.keys('Enter')

		content = await waitForChange(content)
		assert.deepStrictEqual(content.trimEnd().split('\n'), [
			'- [ ] Email',
			'- [ ] Run',
			`      [clock::${today.date}T00:00:00--${today.date}T00:20:00]`,
		])
	})

	it('deletes a task and its clocks from this note only', async function () {
		let content = await writeToday([
			'- [ ] Email',
			`      [clock::${today.date}T00:00:00--${today.date}T00:20:00]`,
			'- [ ] Run',
		])
		await openTracker()

		await chooseFromRowMenu('Email', 'Delete task and all clocks')
		const modal = await modalTitled('Delete "Email"')
		await expect(modal.$('p*=and its 1 clock are removed')).toBeDisplayed()
		await modal.$('button=Delete').click()

		content = await waitForChange(content)
		assert.deepStrictEqual(content.trimEnd().split('\n'), ['- [ ] Run'])
		await expectPlan(['Run'])
	})

	it('moves the start of a running task by minutes ago', async function () {
		let content = await writeToday([
			'- [ ] Chores',
			`      [clock::${today.date}T00:00:00]`,
		])
		await openTracker()

		await chooseFromRowMenu('Chores', 'Change clock start time')
		const modal = await modalTitled('Change when Chores started')
		const input = modal.$('input[placeholder="14:30 or 15"]')
		await input.setValue('5')
		await expect(input).toHaveValue('5')
		// The typed minutes are previewed as the time they stand for.
		await expect(modal.$('p*=· 5m ago')).toBeDisplayed()
		const typedAt = Date.now()
		await modal.$('button=Change').click()

		content = await waitForChange(content)
		const [clock] = clocksOf(content, '- [ ] Chores')
		assert.strictEqual(clock?.end, null)
		// Five minutes before the click, give or take the seconds it took.
		const start = new Date(clock.start).valueOf()
		const expected = typedAt - 5 * 60 * 1000
		assert.ok(
			Math.abs(start - expected) < 60 * 1000,
			`started at ${clock.start}`
		)
	})

	it('moves the start of a running task into the future', async function () {
		let content = await writeToday([
			'- [ ] Chores',
			`      [clock::${today.date}T00:00:00]`,
		])
		await openTracker()

		await chooseFromRowMenu('Chores', 'Change clock start time')
		const modal = await modalTitled('Change when Chores started')
		const input = modal.$('input[placeholder="14:30 or 15"]')
		// Negative minutes are ahead of now, as in the tracking commands.
		await input.setValue('-10')
		await expect(input).toHaveValue('-10')
		await expect(modal.$('p*=· in 10m')).toBeDisplayed()
		const typedAt = Date.now()
		await modal.$('button=Change').click()

		content = await waitForChange(content)
		const [clock] = clocksOf(content, '- [ ] Chores')
		assert.strictEqual(clock?.end, null)
		const start = new Date(clock.start).valueOf()
		const expected = typedAt + 10 * 60 * 1000
		assert.ok(
			Math.abs(start - expected) < 60 * 1000,
			`started at ${clock.start}`
		)
	})

	it('toggles at a time of day from the task switcher command', async function () {
		let content = await writeToday(['- [ ] Chores'])
		await openTracker()

		await browser.executeObsidianCommand(
			'obsidian-task-time-tracker:toggle-task-from'
		)
		const picker = browser.$('.prompt')
		await expect(picker).toBeDisplayed()
		await browser.keys([...'Chores'])
		await expect(picker.$('.suggestion-item.is-selected')).toHaveText(
			expect.stringContaining('Chores')
		)
		await browser.keys('Enter')

		const modal = await modalTitled('When did it happen?')
		const input = modal.$('input[placeholder="14:30 or 15"]')
		await input.setValue('00:05')
		await expect(input).toHaveValue('00:05')
		await expect(modal.$('p*=00:05 ·')).toBeDisplayed()
		await modal.$('button=OK').click()

		content = await waitForChange(content)
		assert.deepStrictEqual(clocksOf(content, '- [ ] Chores'), [
			{ start: `${today.date}T00:05:00`, end: null },
		])
	})

	it('asks when tasks start and stop on a past note followed by a later one', async function () {
		let content = `${['- [ ] Chores', '- [ ] Email'].join('\n')}\n`
		await obsidianPage.write(pastNote.path, content)
		await openTracker(pastNote.path)
		await expect(browser.$("span*=You're viewing")).toBeDisplayed()

		/** Answer the time prompt the start or stop opened. */
		async function typeTime(time: string) {
			const modal = await modalTitled('When did it happen?')
			const input = modal.$('input[placeholder="14:30 or 15"]')
			await input.setValue(time)
			await expect(input).toHaveValue(time)
			await expect(modal.$(`p*=${time.padStart(5, '0')} `)).toBeDisplayed()
			await modal.$('button=OK').click()
		}

		// A time of day lands on the note's day, not today.
		await button('Start Chores').click()
		await typeTime('09:00')
		content = await waitForChange(content, pastNote.path)
		assert.deepStrictEqual(clocksOf(content, '- [ ] Chores'), [
			{ start: `${pastNote.date}T09:00:00`, end: null },
		])
		await expect(button('Stop Chores')).toBeDisplayed()

		await button('Switch to Email').click()
		await typeTime('10:30')
		content = await waitForChange(content, pastNote.path)
		assert.deepStrictEqual(clocksOf(content, '- [ ] Chores'), [
			{ start: `${pastNote.date}T09:00:00`, end: `${pastNote.date}T10:30:00` },
		])
		await expect(button('Stop Email')).toBeDisplayed()

		// Before Email's start (10:30), a time of day means past midnight.
		await button('Stop Email').click()
		await typeTime('0:15')
		content = await waitForChange(content, pastNote.path)
		assert.deepStrictEqual(clocksOf(content, '- [ ] Email'), [
			{ start: `${pastNote.date}T10:30:00`, end: '2026-08-03T00:15:00' },
		])
		await expect(button('Start Email')).toBeDisplayed()
	})

	it('teaches the shortcut of a button in its tooltip', async function () {
		await writeToday(['- [ ] Chores'])
		await openTracker()
		const start = button('Start Chores')
		const tooltip = browser.$('.tooltip')

		// No shortcut yet: the tooltip names the command to set one for.
		await start.moveTo()
		await expect(tooltip).toHaveText(
			'Start Chores\nNo shortcut yet: set one for "Toggle task" in Settings → Hotkeys'
		)
		// Leaving puts the plain label back: it still names the button.
		await browser.$("h2=Today's plan").moveTo()
		await expect(start).toHaveAttribute('aria-label', 'Start Chores')

		// A shortcut set meanwhile shows on the next hover.
		await browser.executeObsidian(({ app }) => {
			const { hotkeyManager } = app as unknown as WithHotkeys
			hotkeyManager.setHotkeys('obsidian-task-time-tracker:toggle-task', [
				{ modifiers: ['Mod', 'Shift'], key: 'T' },
			])
		})
		await start.moveTo()
		await expect(tooltip).toHaveText(
			expect.stringMatching(/^Start Chores\nShortcut: \S/)
		)
		await browser.executeObsidian(({ app }) => {
			const { hotkeyManager } = app as unknown as WithHotkeys
			hotkeyManager.removeHotkeys('obsidian-task-time-tracker:toggle-task')
		})
	})

	it('explains the interruption button in its tooltip', async function () {
		await writeToday(['- [ ] Chores'])
		await openTracker()
		// The button has no aria-label of its own: the tooltip only exists
		// if the hint is written before Obsidian's body listener looks.
		await browser.$('button=Interruption').moveTo()
		await expect(browser.$('.tooltip')).toHaveText(
			expect.stringMatching(
				/^Interruption\nPause the running tasks and count the time until you say what interrupted you\n/
			)
		)
	})

	it('shows a set shortcut after a row menu item', async function () {
		await writeToday(['- [ ] Chores', `      [clock::${today.date}T00:00:00]`])
		await openTracker()
		await browser.executeObsidian(({ app }) => {
			const { hotkeyManager } = app as unknown as WithHotkeys
			hotkeyManager.setHotkeys('obsidian-task-time-tracker:set-task-duration', [
				{ modifiers: ['Mod', 'Alt'], key: 'D' },
			])
		})

		const more = await button('More actions for Chores').getElement()
		await browser.execute((el) => el.click(), more)
		const title = browser.$('.menu').$('.menu-item-title*=Set clock duration')
		await expect(title).toBeDisplayed()
		// Obsidian's menu shows the shortcut apart, without brackets.
		await expect(title).toHaveText(
			expect.stringMatching(/^Set clock duration\s+[^\s(]/)
		)
		// A native menu (macOS) takes the title's text: brackets keep it apart.
		const nativeLabel = await browser.execute(
			(el) => el.textContent,
			await title.getElement()
		)
		assert.match(nativeLabel ?? '', /^Set clock duration \(\S.*\)$/)
		await browser.keys('Escape')

		await browser.executeObsidian(({ app }) => {
			const { hotkeyManager } = app as unknown as WithHotkeys
			hotkeyManager.removeHotkeys(
				'obsidian-task-time-tracker:set-task-duration'
			)
		})
	})

	it('shows a task alone in the task manager from its menu', async function () {
		await writeToday(['- [ ] Email', '- [ ] Emails'])
		await openTracker()

		await chooseFromRowMenu('Email', 'Show in task manager')
		const modal = await modalTitled('Manage tasks')
		// Quoted, the filter matches the name exactly: not "Emails" too.
		const filter = modal.$('input[aria-label="Filter tasks"]')
		await expect(filter).toHaveValue('"Email"')
		const rows = modal.$('tbody')
		await expect(rows).toHaveChildren(1)
		await expect(rows.$('tr:nth-child(1) .name')).toHaveText('Email')

		// The cross empties the filter: every task is listed again, both
		// of today's among them.
		await modal.$('[aria-label="Clear filter"]').click()
		await expect(filter).toHaveValue('')
		await expect(rows.$('.name=Email')).toBeDisplayed()
		await expect(rows.$('.name=Emails')).toBeDisplayed()
	})
})
