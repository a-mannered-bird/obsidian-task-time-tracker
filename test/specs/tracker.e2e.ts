import assert from 'node:assert'
import { browser, expect } from '@wdio/globals'
import { obsidianPage } from 'wdio-obsidian-service'
import { openDailyView } from './support/dailyView'
import { dayNote, promptDay } from './support/days'
import { clickNoticeButton, noticeWith } from './support/notices'
import {
	answerStartOfDay,
	expectTimeMinutesAgo,
	minutesField,
	setTimeInput,
	timeField,
	typeMinutes,
	typeTime,
} from './support/timePrompt'
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
	await openDailyView('Tracker')
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

/** The line of the cursor in the active note's editor, or null. */
function cursorLine(): Promise<number | null> {
	return browser.executeObsidian(
		({ app }) => app.workspace.activeEditor?.editor?.getCursor().line ?? null
	)
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

/** A row's text: the tag slot's emojis or `#`, then the name. */
function rowText(name: string): RegExp {
	return new RegExp(`^(\\S+\\s+)?${name}(\\s|$)`)
}

/** The plan's rows, by name, in the order shown. */
async function expectPlan(names: string[]) {
	const rows = browser.$('section[aria-labelledby="plan-title"] > ul')
	await expect(rows).toHaveChildren(names.length)
	for (const [index, name] of names.entries()) {
		// A row reads its tag slot, its name, then its total.
		await expect(rows.$(`li:nth-child(${index + 1})`)).toHaveText(rowText(name))
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
	await expect(ghost).toHaveText(rowText(name))
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
		await answerStartOfDay()
		content = await waitForChange(content)
		assert.deepStrictEqual(states(content, '- [ ] Chores'), ['running'])
		await expect(button('Stop Chores')).toBeDisplayed()

		// Now rows switch; starting alongside is in their menu.
		await expect(button('Switch to German podcast')).toBeEnabled()
		await chooseFromRowMenu('German podcast', 'Start alongside')
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
		const switchButton = button('Switch mode')
		const alongside = button('Toggle mode')
		// Pressed through the DOM: notices of earlier steps can cover the bar.
		const press = async (target: typeof alongside) =>
			browser.execute((el) => el.click(), await target.getElement())
		await expect(switchButton).toHaveAttribute('aria-pressed', 'true')

		// With nothing typed, a start button only sets the mode, without
		// taking the focus.
		await press(alongside)
		await expect(alongside).toHaveAttribute('aria-pressed', 'true')
		await expect(switchButton).toHaveAttribute('aria-pressed', 'false')
		await expect(bar).toHaveAttribute('placeholder', 'Start alongside…')
		await expect(bar).toHaveAttribute('aria-expanded', 'false')
		assert.strictEqual(await obsidianPage.read(today.path), content)

		await browser.execute((el) => el.focus(), await bar.getElement())
		await expect(bar).toBeFocused()
		await expect(list).toBeDisplayed()
		await browser.keys([...'Email'])
		await expect(bar).toHaveValue('Email')
		await browser.keys('Enter')
		content = await waitForChange(content)
		assert.deepStrictEqual(states(content, '- [ ] Chores'), ['running'])
		assert.deepStrictEqual(states(content, '- [ ] Email'), ['running'])
		// The mode outlives the pick, and the rows follow it.
		await expect(alongside).toHaveAttribute('aria-pressed', 'true')
		await expect(button('Start Run alongside')).toBeDisplayed()

		await press(switchButton)
		await expect(switchButton).toHaveAttribute('aria-pressed', 'true')
		await expect(bar).toHaveAttribute('placeholder', 'Switch to…')
		await expect(button('Switch to Run')).toBeDisplayed()
		await browser.execute((el) => el.focus(), await bar.getElement())
		await expect(bar).toBeFocused()
		await browser.keys([...'Run'])
		await expect(bar).toHaveValue('Run')
		await browser.keys('Enter')
		content = await waitForChange(content)
		assert.deepStrictEqual(states(content, '- [ ] Chores'), ['closed'])
		assert.deepStrictEqual(states(content, '- [ ] Email'), ['closed'])
		assert.deepStrictEqual(states(content, '- [ ] Run'), ['running'])
	})

	it('starts alongside again once something runs after nothing did', async function () {
		let content = await writeToday([
			'- [ ] Chores',
			`      [clock::${today.date}T00:00:00]`,
			'- [ ] Email',
			'- [ ] Run',
		])
		await openTracker()
		const alongside = button('Toggle mode')
		await browser.execute((el) => el.click(), await alongside.getElement())
		await expect(alongside).toHaveAttribute('aria-pressed', 'true')
		await browser.keys('Escape')

		// Nothing runs: Start is the only way of starting left.
		await button('Stop Chores').click()
		content = await waitForChange(content)
		await expect(button('Start')).toHaveAttribute('aria-pressed', 'true')

		await button('Start Email').click()
		content = await waitForChange(content)
		assert.deepStrictEqual(states(content, '- [ ] Email'), ['running'])
		await expect(button('Toggle mode')).toHaveAttribute('aria-pressed', 'true')
		await expect(button('Start Run alongside')).toBeDisplayed()

		// The view outlives the vault reset: leave the bar switching.
		const switchButton = button('Switch mode')
		await browser.execute((el) => el.click(), await switchButton.getElement())
		await expect(switchButton).toHaveAttribute('aria-pressed', 'true')
		await browser.keys('Escape')
	})

	it('swaps switching and toggling while Alt is held', async function () {
		await writeToday([
			'- [ ] Chores',
			`      [clock::${today.date}T00:00:00]`,
			'- [ ] Run',
		])
		await openTracker()
		const bar = browser.$('input[aria-label="Task to start"]')
		const switchButton = button('Switch mode')
		const alongside = button('Toggle mode')
		await expect(switchButton).toHaveAttribute('aria-pressed', 'true')

		await browser.action('key').down('\uE00A').perform(true)
		await expect(alongside).toHaveAttribute('aria-pressed', 'true')
		await expect(button('Start Run alongside')).toBeDisplayed()
		await browser.action('key').up('\uE00A').perform()
		await expect(switchButton).toHaveAttribute('aria-pressed', 'true')

		// Clicking the field with Alt down keeps the swap until it blurs.
		await browser.action('key').down('\uE00A').perform(true)
		await expect(alongside).toHaveAttribute('aria-pressed', 'true')
		await bar.click()
		await browser.action('key').up('\uE00A').perform()
		await expect(bar).toBeFocused()
		await expect(alongside).toHaveAttribute('aria-pressed', 'true')
		await expect(bar).toHaveAttribute('placeholder', 'Start alongside…')
		await browser.execute((el) => el.blur(), await bar.getElement())
		await expect(switchButton).toHaveAttribute('aria-pressed', 'true')
	})

	it('lists the done tasks in a section of their own', async function () {
		await writeToday([
			'- [x] Breakfast',
			`      [clock::${today.date}T07:30:00--${today.date}T07:50:00]`,
			'- [x] Read news',
		])
		await openTracker()

		await expect(browser.$('h2=Done')).toBeDisplayed()
		await expect(browser.$('span=Read news')).toBeDisplayed()
	})

	it('marks a task done, adds one to the plan, then ends the day', async function () {
		let content = await writeToday([
			'---',
			`day_start: ${today.date}T00:00:00`,
			'---',
			'- [ ] Write',
			`      [clock::${today.date}T00:00:00]`,
			'- [ ] Run',
		])
		await openTracker()

		// A running task has a checkbox like the planned ones: ticking it
		// stops the clock too.
		const done = browser.$('input[aria-label="Done: stop and tick Write"]')
		assert.strictEqual(await done.isSelected(), false)
		await done.click()
		content = await waitForChange(content)
		assert.deepStrictEqual(states(content, '- [x] Write'), ['closed'])
		await expect(browser.$('h2=Done')).toBeDisplayed()

		const bar = browser.$('input[aria-label="Task to start"]')
		// Pressed through the DOM: the notice of the previous step can still
		// cover the bar.
		const plan = button('Plan mode')
		await browser.execute((el) => el.click(), await plan.getElement())
		await expect(plan).toHaveAttribute('aria-pressed', 'true')
		await expect(bar).toHaveAttribute('placeholder', 'Plan a task…')
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
		const setEnd = await modalTitled('When does the tracking period end?')
		// It opens on now, which OK takes as it is.
		const endMinutes = minutesField(setEnd)
		await expect(endMinutes).toBeFocused()
		await expect(endMinutes).toHaveValue('0')
		await setEnd.$('button=OK').click()
		const modal = await modalTitled('End day')
		await expect(modal.$('li=Call the bank')).toBeDisplayed()
		await modal.$('button=End day').click()

		await browser.waitUntil(
			async () => !(await obsidianPage.read(today.path)).includes('- [ ] Run'),
			{ timeoutMsg: 'the day was not ended' }
		)
		content = await obsidianPage.read(today.path)
		assert.match(content, new RegExp(`\\nday_end: ${today.date}T`))
		assert.deepStrictEqual(
			content.split('\n').filter((line) => line.startsWith('- [')),
			['- [x] Write']
		)
	})

	it('keeps the unclocked tasks with goals at the end of the day, unless ticked', async function () {
		await writeToday([
			'---',
			`day_start: ${today.date}T08:00:00`,
			'---',
			'- [ ] Write',
			`      [clock::${today.date}T09:00:00--${today.date}T10:00:00]`,
			'- [ ] Anki',
			'      [goal::cards 140/200]',
			'- [ ] Stretch',
			'      [goal::15m]',
			'- [ ] Call the bank',
		])
		await openTracker()

		await browser.$('button=End day').click()
		const setEnd = await modalTitled('When does the tracking period end?')
		await typeTime(setEnd, '22:00')
		await setEnd.$('button=OK').click()

		// Call the bank goes without asking; the tasks with goals are listed
		// apart, each with its goals, and kept unless ticked.
		const modal = await modalTitled('End day')
		await expect(modal.$('li=Call the bank')).toBeDisplayed()
		await expect(modal.$('legend=Has goals')).toBeDisplayed()
		const anki = modal.$('label=Anki · cards 140/200').$('input')
		const stretch = modal.$('label=Stretch · 15m').$('input')
		assert.strictEqual(await anki.isSelected(), false)
		assert.strictEqual(await stretch.isSelected(), false)
		// "Always delete" ticks them all, and is remembered; Anki is kept.
		const always = modal
			.$('label=Always delete unclocked tasks with goals')
			.$('input')
		await always.click()
		await expect(anki).toBeSelected()
		await expect(stretch).toBeSelected()
		await anki.click()
		assert.strictEqual(await anki.isSelected(), false)
		await modal.$('button=End day').click()

		await browser.waitUntil(
			async () =>
				!(await obsidianPage.read(today.path)).includes('- [ ] Stretch'),
			{ timeoutMsg: 'the day was not ended' }
		)
		const content = await obsidianPage.read(today.path)
		assert.match(content, new RegExp(`\\nday_end: ${today.date}T22:00:00\\n`))
		assert.deepStrictEqual(content.slice(content.indexOf('- [')).split('\n'), [
			'- [x] Write',
			`      [clock::${today.date}T09:00:00--${today.date}T10:00:00]`,
			'- [ ] Anki',
			'      [goal::cards 140/200]',
			'',
		])
		const remembered = await browser.executeObsidian(
			({ plugins }) =>
				plugins.obsidianTaskTimeTracker.settings.deleteGoalTasksOnEndDay
		)
		assert.strictEqual(remembered, true)
		await browser.executeObsidian(async ({ plugins }) => {
			plugins.obsidianTaskTimeTracker.settings.deleteGoalTasksOnEndDay = false
			await plugins.obsidianTaskTimeTracker.saveSettings()
		})
	})

	it('asks for the end of day again when the note already has one', async function () {
		await writeToday([
			'---',
			`day_start: ${today.date}T08:00:00`,
			`day_end: ${today.date}T22:45:00`,
			'---',
			'- [ ] Chores',
			`      [clock::${today.date}T21:00:00--${today.date}T22:30:00]`,
		])
		await openTracker()
		await expect(
			browser.$('button[aria-label="End of day 22:45, change"]')
		).toBeDisplayed()

		await browser.$('button=End day').click()
		const setEnd = await modalTitled('When does the tracking period end?')
		await typeTime(setEnd, '23:15')
		await setEnd.$('button=OK').click()

		// Chores has a clock, so nothing is removed and no confirmation shows.
		await browser.waitUntil(
			async () =>
				(await obsidianPage.read(today.path)).includes('- [x] Chores'),
			{ timeoutMsg: 'the day was not ended' }
		)
		assert.match(
			await obsidianPage.read(today.path),
			new RegExp(`\\nday_end: ${today.date}T23:15:00\\n`)
		)
		await expect(
			browser.$('button[aria-label="End of day 23:15, change"]')
		).toBeDisplayed()
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
		const modal = await modalTitled('When does the tracking period end?')
		await expect(minutesField(modal)).toHaveValue('0')
		// After the 08:00 start of day but before the clock ended at 22:30:
		// the day can only end then on the next day.
		await typeTime(modal, '22:00')
		// The line under the fields gives the date, not "tomorrow".
		await expect(modal.$(`p=Set on ${promptDay(1)} at 22:00`)).toBeDisplayed()
		await modal.$('button=OK').click()

		const ended = await waitForChange(content)
		assert.match(
			ended,
			new RegExp(`\\nday_end: ${dayNote(1).date}T22:00:00\\n`)
		)
		await expect(
			browser.$('button[aria-label="End of day 22:00, change"]')
		).toBeDisplayed()

		// The notice says so in words, with Change and Undo; Undo puts the
		// note back as it was.
		const notice = browser.$('.notice*=End of day set to tomorrow at 22:00.')
		await expect(notice.$('button=Change')).toBeDisplayed()
		await clickNoticeButton(notice, 'Undo')
		assert.strictEqual(await waitForChange(ended), content)
		await expect(
			browser.$('button[aria-label="Set end of day"]')
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

		// One notice tells the switch, a line per clock.
		const notice = noticeWith('Started "Email" at')
		await clickNoticeButton(notice, 'Change')
		const modal = await modalTitled('Change the time')
		await typeTime(modal, '00:01')
		await modal.$('button=Change').click()

		// Chores ends and Email starts at the time typed.
		content = await waitForChange(content)
		assert.deepStrictEqual(clocksOf(content, '- [ ] Chores'), [
			{ start: `${today.date}T00:00:00`, end: `${today.date}T00:01:00` },
		])
		assert.deepStrictEqual(clocksOf(content, '- [ ] Email'), [
			{ start: `${today.date}T00:01:00`, end: null },
		])
		// The moved switch has its own notice: Chores now ran 00:00–00:01,
		// its only clock today.
		const moved = noticeWith('Stopped "Chores" (1m / 1m) at 00:01')
		await expect(moved).toHaveText(
			expect.stringContaining('Started "Email" at 00:01')
		)
	})

	it('changes when a task started from its notice, then undoes it', async function () {
		const original = await writeToday(['- [ ] Chores'])
		let content = original
		await openTracker()

		await button('Start Chores').click()
		await answerStartOfDay()
		content = await waitForChange(content)
		const started = clocksOf(content, '- [ ] Chores')
		assert.deepStrictEqual(states(content, '- [ ] Chores'), ['running'])

		// A start gets its notice too, like a stop or a switch.
		await clickNoticeButton(noticeWith('Started "Chores" at'), 'Change')
		const modal = await modalTitled('Change the time')
		await typeTime(modal, '00:05')
		await modal.$('button=Change').click()
		content = await waitForChange(content)
		assert.deepStrictEqual(clocksOf(content, '- [ ] Chores'), [
			{ start: `${today.date}T00:05:00`, end: null },
		])

		// The changed start has its own notice: Undo takes back the change.
		await clickNoticeButton(noticeWith('Started "Chores" at 00:05'), 'Undo')
		await expect(
			browser.$('.notice*=The last action has been reverted.')
		).toBeDisplayed()
		content = await waitForChange(content)
		assert.deepStrictEqual(clocksOf(content, '- [ ] Chores'), started)
	})

	it('moves the start of a running task to the time typed', async function () {
		let content = await writeToday([
			'- [ ] Chores',
			`      [clock::${today.date}T00:00:00]`,
		])
		await openTracker()

		await chooseFromRowMenu('Chores', 'Change clock start time')
		const modal = await modalTitled('Change when Chores started')
		await typeTime(modal, '00:05')
		await modal.$('button=Change').click()

		content = await waitForChange(content)
		assert.deepStrictEqual(clocksOf(content, '- [ ] Chores'), [
			{ start: `${today.date}T00:05:00`, end: null },
		])
	})

	it('stops a running task at a typed time from its row', async function () {
		let content = await writeToday([
			'- [ ] Chores',
			`      [clock::${today.date}T00:00:00]`,
		])
		await openTracker()

		await button('Stop Chores at…').click()
		const modal = await modalTitled('When does "Chores" stop?')
		// It opens on the clock's start, to count on from there.
		await expect(timeField(modal)).toHaveValue('00:00')
		await typeTime(modal, '00:10')
		await modal.$('button=Stop').click()

		content = await waitForChange(content)
		assert.deepStrictEqual(clocksOf(content, '- [ ] Chores'), [
			{ start: `${today.date}T00:00:00`, end: `${today.date}T00:10:00` },
		])
		await expect(button('Start Chores')).toBeDisplayed()
	})

	it('switches to a task at a typed time from its row', async function () {
		let content = await writeToday([
			'- [ ] Chores',
			`      [clock::${today.date}T00:00:00]`,
			'- [ ] Email',
		])
		await openTracker()

		await button('Switch to Email at…').click()
		const modal = await modalTitled('When to switch to "Email"?')
		await typeTime(modal, '00:10')
		await modal.$('button=OK').click()

		content = await waitForChange(content)
		assert.deepStrictEqual(clocksOf(content, '- [ ] Chores'), [
			{ start: `${today.date}T00:00:00`, end: `${today.date}T00:10:00` },
		])
		assert.deepStrictEqual(clocksOf(content, '- [ ] Email'), [
			{ start: `${today.date}T00:10:00`, end: null },
		])
		await expect(button('Stop Email')).toBeDisplayed()
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

	it('moves the start of a running task by minutes ago, then undoes it', async function () {
		const original = await writeToday([
			'- [ ] Chores',
			`      [clock::${today.date}T00:00:00]`,
		])
		let content = original
		await openTracker()

		await chooseFromRowMenu('Chores', 'Change clock start time')
		const modal = await modalTitled('Change when Chores started')
		await expect(modal.$('p*=started at 00:00.')).toBeDisplayed()
		await typeMinutes(modal, '4')
		await modal.$('button[aria-label="One minute more"]').click()
		await expect(minutesField(modal)).toHaveValue('5')
		// The time field follows the minutes.
		await expectTimeMinutesAgo(modal, 5)
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

		// Undo finds the clock by the time written, to the second.
		await clickNoticeButton(noticeWith('"Chores" 00:00'), 'Undo')
		await expect(
			browser.$('.notice*=The last action has been reverted.')
		).toBeDisplayed()
		await waitForChange(content)
		assert.strictEqual(await obsidianPage.read(today.path), original)
	})

	it('moves the start of a running task into the future', async function () {
		let content = await writeToday([
			'- [ ] Chores',
			`      [clock::${today.date}T00:00:00]`,
		])
		await openTracker()

		await chooseFromRowMenu('Chores', 'Change clock start time')
		const modal = await modalTitled('Change when Chores started')
		// Negative minutes are ahead of now, as in the tracking commands.
		await typeMinutes(modal, '-10')
		await expectTimeMinutesAgo(modal, -10)
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
		await typeTime(modal, '00:05')
		// Today, the time field says it all: the line under it stays empty.
		await expect(modal.$('.task-time-tracker-prompt-status')).toHaveText('')
		await modal.$('button=OK').click()
		await answerStartOfDay()

		content = await waitForChange(content)
		assert.deepStrictEqual(clocksOf(content, '- [ ] Chores'), [
			{ start: `${today.date}T00:05:00`, end: null },
		])
	})

	it('only sets clocks on a past note, from where the last one ended, new tasks included', async function () {
		let content = `${['- [ ] Chores', '- [ ] Email'].join('\n')}\n`
		await obsidianPage.write(pastNote.path, content)
		await openTracker(pastNote.path)
		await expect(browser.$("span*=You're viewing")).toBeDisplayed()

		// Nothing starts or stops on a day that is over: the bar only plans,
		// and the rows only set clocks.
		await expect(browser.$('input[aria-label="Task to plan"]')).toHaveAttribute(
			'placeholder',
			'Add a task to August 2, 2026'
		)
		await expect(button('Add a clock to Chores')).toBeDisplayed()
		// Positive matchers only (see AGENTS.md): the trace mislabels `.not`.
		for (const label of ['Plan mode', 'Start Chores', 'Start Chores at…']) {
			assert.strictEqual(await button(label).isExisting(), false, label)
		}
		assert.strictEqual(
			await browser.$('button*=Interruption').isExisting(),
			false
		)
		await browser.execute(
			(el) => el.click(),
			await button('More actions for Chores').getElement()
		)
		const firstItem = browser.$('.menu').$('.menu-item-title')
		await expect(firstItem).toHaveText('Move down')
		await browser.keys('Escape')

		/** Open a row's clock prompt: its fields and the line under them. */
		async function openClock(name: string) {
			await button(`Add a clock to ${name}`).click()
			const modal = await modalTitled(`Add a clock to "${name}"`)
			return {
				modal,
				start: modal.$('input[aria-label="Start"]'),
				end: modal.$('input[aria-label="End"]'),
				status: modal.$('p[role="status"]'),
			}
		}

		// No clock and no start of day yet: 08:00, for half an hour.
		let clock = await openClock('Chores')
		await expect(clock.start).toHaveValue('08:00')
		await expect(clock.end).toHaveValue('08:30')
		await expect(clock.status).toHaveText('Lasts 30m')

		// An end before the start is on the next day.
		await setTimeInput(clock.end, '07:30')
		await expect(clock.status).toHaveText('Ends the next day · lasts 23h 30m')
		await expect(clock.end).toHaveAttribute('aria-invalid', 'false')

		// The same time as the start makes no clock: refused as typed, and
		// on submit.
		await setTimeInput(clock.end, '08:00')
		await expect(clock.status).toHaveText(
			'The start and the end are the same time.'
		)
		await expect(clock.end).toHaveAttribute('aria-invalid', 'true')
		await clock.modal.$('button=Add clock').click()
		await expect(clock.status).toHaveText(
			'The start and the end are the same time.'
		)

		await setTimeInput(clock.end, '09:15')
		await expect(clock.status).toHaveText('Lasts 1h 15m')
		await clock.modal.$('button=Add clock').click()
		content = await waitForChange(content, pastNote.path)
		assert.deepStrictEqual(clocksOf(content, '- [ ] Chores'), [
			{ start: `${pastNote.date}T08:00:00`, end: `${pastNote.date}T09:15:00` },
		])

		// The day's first clock asks when the day started, as a time of day
		// only, opening on the clock's start.
		const dayStart = await modalTitled('Start of day')
		await expect(timeField(dayStart)).toHaveValue('08:00')
		assert.strictEqual(await minutesField(dayStart).isExisting(), false)
		await typeTime(dayStart, '07:45')
		await dayStart.$('button=OK').click()
		content = await waitForChange(content, pastNote.path)
		assert.match(
			content,
			new RegExp(`^---\nday_start: ${pastNote.date}T07:45:00\n---\n`)
		)

		// The next clock opens where the note's last one ended.
		clock = await openClock('Email')
		await expect(clock.start).toHaveValue('09:15')
		await expect(clock.end).toHaveValue('09:45')
		await clock.modal.$('button=Add clock').click()
		content = await waitForChange(content, pastNote.path)

		// A task added from the bar comes with its clock, from where the
		// last one ended.
		const bar = browser.$('input[aria-label="Task to plan"]')
		await bar.setValue('Laundry')
		await expect(browser.$('[role="option"][aria-selected="true"]')).toHaveText(
			expect.stringContaining('Laundry')
		)
		await browser.keys('Enter')
		let modal = await modalTitled('Add a clock to "Laundry"')
		await expect(modal.$('input[aria-label="Start"]')).toHaveValue('09:45')
		await expect(modal.$('input[aria-label="End"]')).toHaveValue('10:15')
		await modal.$('button=Add clock').click()
		content = await waitForChange(content, pastNote.path)

		// Dismissed, the prompt adds nothing, not even the task.
		await bar.setValue('Groceries')
		await expect(browser.$('[role="option"][aria-selected="true"]')).toHaveText(
			expect.stringContaining('Groceries')
		)
		await browser.keys('Enter')
		modal = await modalTitled('Add a clock to "Groceries"')
		await modal.$('button=Cancel').click()

		// A task's clocks may not overlap: the time would count twice.
		clock = await openClock('Chores')
		await expect(clock.start).toHaveValue('10:15')
		await setTimeInput(clock.start, '09:00')
		await expect(clock.status).toHaveText(
			"It overlaps this task's clock 08:00–09:15."
		)
		await clock.modal.$('button=Cancel').click()

		content = await obsidianPage.read(pastNote.path)
		assert.deepStrictEqual(content.trimEnd().split('\n'), [
			'---',
			`day_start: ${pastNote.date}T07:45:00`,
			'---',
			'- [ ] Chores',
			`      [clock::${pastNote.date}T08:00:00--${pastNote.date}T09:15:00]`,
			'- [ ] Email',
			`      [clock::${pastNote.date}T09:15:00--${pastNote.date}T09:45:00]`,
			'- [ ] Laundry',
			`      [clock::${pastNote.date}T09:45:00--${pastNote.date}T10:15:00]`,
		])
	})

	it('ends a past day at a time of day, from where its last clock ended', async function () {
		const before = [
			'- [ ] Chores',
			`      [clock::${pastNote.date}T08:00:00--${pastNote.date}T09:15:00]`,
			'- [ ] Email',
			'',
		].join('\n')
		await obsidianPage.write(pastNote.path, before)
		await openTracker(pastNote.path)

		// No start of day is needed on a past day, only a task.
		const endDayButton = browser.$('button=End day')
		await expect(endDayButton).toBeEnabled()
		await endDayButton.click()
		const setEnd = await modalTitled('When does the tracking period end?')
		// Only a time of day: minutes before now mean nothing on a day that
		// is over. It opens where the last clock ended.
		const time = timeField(setEnd)
		await expect(time).toHaveValue('09:15')
		assert.strictEqual(await minutesField(setEnd).isExisting(), false)
		await expect(setEnd.$('p*= at 09:15')).toBeDisplayed()
		await typeTime(setEnd, '17:30')
		await setEnd.$('button=OK').click()

		const modal = await modalTitled('End day')
		await expect(modal.$('li=Email')).toBeDisplayed()
		await modal.$('button=End day').click()
		// The end of day is written first, then the cleanup.
		await browser.waitUntil(
			async () =>
				(await obsidianPage.read(pastNote.path)).includes('- [x] Chores'),
			{ timeoutMsg: 'the day was not ended' }
		)
		const content = await obsidianPage.read(pastNote.path)
		assert.deepStrictEqual(content.trimEnd().split('\n'), [
			'---',
			`day_end: ${pastNote.date}T17:30:00`,
			'---',
			'- [x] Chores',
			`      [clock::${pastNote.date}T08:00:00--${pastNote.date}T09:15:00]`,
		])
	})

	it('sets the start and end of a past day at a time of day', async function () {
		const before = [
			'- [x] Chores',
			`      [clock::${pastNote.date}T08:20:00--${pastNote.date}T09:15:00]`,
			'- [x] Email',
			`      [clock::${pastNote.date}T13:00:00--${pastNote.date}T13:40:00]`,
			'',
		].join('\n')
		await obsidianPage.write(pastNote.path, before)
		await openTracker(pastNote.path)

		/** Pressed through the DOM: the notice of the last write covers the header. */
		async function press(label: string) {
			await browser.execute(
				(el) => el.click(),
				await button(label).getElement()
			)
		}

		// Without a start of day, it opens on the first clock's start.
		await press('Set start of day')
		const start = await modalTitled('When does the tracking period start?')
		await expect(timeField(start)).toHaveValue('08:20')
		assert.strictEqual(await minutesField(start).isExisting(), false)
		await typeTime(start, '08:00')
		await start.$('button=OK').click()
		let content = await waitForChange(before, pastNote.path)
		assert.match(
			content,
			new RegExp(`\nday_start: ${pastNote.date}T08:00:00\n`)
		)

		// Without an end of day, it opens where the last clock ended.
		await press('Set end of day')
		const end = await modalTitled('When does the tracking period end?')
		await expect(timeField(end)).toHaveValue('13:40')
		assert.strictEqual(await minutesField(end).isExisting(), false)
		await typeTime(end, '18:30')
		await end.$('button=OK').click()
		content = await waitForChange(content, pastNote.path)
		assert.deepStrictEqual(content.trimEnd().split('\n').slice(0, 4), [
			'---',
			`day_start: ${pastNote.date}T08:00:00`,
			`day_end: ${pastNote.date}T18:30:00`,
			'---',
		])

		// Set, a mark opens on itself.
		await press('Start of day 08:00, change')
		const again = await modalTitled('When does the tracking period start?')
		await expect(timeField(again)).toHaveValue('08:00')
		await again.$('button=Cancel').click()
	})

	it('teaches Toggle task from… on the Stop at… button', async function () {
		await writeToday(['- [ ] Chores', `      [clock::${today.date}T00:00:00]`])
		await openTracker()
		const stopAt = button('Stop Chores at…')
		await expect(stopAt).toBeDisplayed()

		await stopAt.moveTo()
		await expect(browser.$('.tooltip')).toHaveText(
			'Stop Chores at…\nNo shortcut yet: set one for "Toggle task from…" in Settings → Hotkeys'
		)
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
		// The shortcut line is an aside, in italics; the label is not.
		await expect(tooltip.$('div*=No shortcut yet')).toHaveStyle({
			fontStyle: 'italic',
		})
		await expect(tooltip.$('div=Start Chores')).toHaveStyle({
			fontStyle: 'normal',
		})
		// The label is the button's name, never rewritten by the tooltip.
		await expect(start).toHaveAttribute('aria-label', 'Start Chores')
		await browser.$("h2=Today's plan").moveTo()

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
		// A set shortcut is an aside too.
		await expect(tooltip.$('div*=Shortcut:')).toHaveStyle({
			fontStyle: 'italic',
		})
		await browser.executeObsidian(({ app }) => {
			const { hotkeyManager } = app as unknown as WithHotkeys
			hotkeyManager.removeHotkeys('obsidian-task-time-tracker:toggle-task')
		})
	})

	it('explains the interruption button in its tooltip', async function () {
		await writeToday(['- [ ] Chores', `      [clock::${today.date}T00:00:00]`])
		await openTracker()
		await expect(browser.$('button=Interruption')).toBeEnabled()
		await browser.$('button=Interruption').moveTo()
		await expect(browser.$('.tooltip')).toHaveText(
			expect.stringMatching(
				/^Pause the running tasks and count the time until you say what interrupted you\n/
			)
		)
	})

	it('explains the end day button in its tooltip', async function () {
		await writeToday([
			'---',
			`day_start: ${today.date}T08:00:00`,
			'---',
			'- [ ] Chores',
		])
		await openTracker()
		await expect(browser.$('button=End day')).toBeEnabled()
		await browser.$('button=End day').moveTo()
		await expect(browser.$('.tooltip')).toHaveText(
			expect.stringMatching(
				/^Set the end of day, stop the running clocks at it, tick the tasks with time and remove the ones without\n/
			)
		)
	})

	it('explains the switch, toggle and plan modes in their tooltips', async function () {
		await writeToday(['- [ ] Chores', `      [clock::${today.date}T00:00:00]`])
		await openTracker()
		const tooltip = browser.$('.tooltip')

		await button('Switch mode').moveTo()
		await expect(tooltip.$('strong')).toHaveText('Switch mode')
		await expect(tooltip).toHaveText(
			expect.stringMatching(
				/^Switch mode\nStart the task you pick and stop the running ones\n/
			)
		)
		await button('Toggle mode').moveTo()
		await expect(tooltip.$('strong')).toHaveText('Toggle mode')
		await expect(tooltip).toHaveText(
			expect.stringMatching(
				/^Toggle mode\nStart the task you pick alongside the running ones, which keep running\n/
			)
		)
		await button('Plan mode').moveTo()
		await expect(tooltip.$('strong')).toHaveText('Plan mode')
		await expect(tooltip).toHaveText(
			expect.stringMatching(
				/^Plan mode\nAdd a task to your day without starting or stopping any timer\.\n/
			)
		)
	})

	it('disables Interruption and End day until there is something to act on', async function () {
		await writeToday(['- [ ] Chores'])
		await openTracker()
		const interruption = browser.$('button=Interruption')
		const endDay = browser.$('button=End day')
		const tooltip = browser.$('.tooltip')

		// Nothing runs and the day has no start: both say why they are off.
		await expect(interruption).toBeDisabled()
		await interruption.moveTo()
		await expect(tooltip).toHaveText('Nothing to interrupt: start a task first')
		await expect(endDay).toBeDisabled()
		await endDay.moveTo()
		await expect(tooltip).toHaveText(
			'The day has not started: set its start first'
		)

		// Starting Chores gives the interruption something to pause, and
		// the day's first clock asks for its start, so it can end too.
		await button('Start Chores').click()
		await answerStartOfDay()
		await expect(button('Stop Chores')).toBeDisplayed()
		await expect(interruption).toBeEnabled()
		await expect(endDay).toBeEnabled()
	})

	it('sets the duration of a running clock from its timer', async function () {
		let content = await writeToday([
			'- [ ] Chores',
			`      [clock::${today.date}T00:00:00]`,
		])
		await openTracker()

		const timer = button('Set clock duration of Chores')
		await expect(timer).toHaveText(expect.stringMatching(/^\d+h \d\dm$/))
		await timer.click()
		const modal = await modalTitled('How long did the task last?')
		const minutes = modal.$('input[type="number"]')
		await minutes.setValue('10')
		await expect(minutes).toHaveValue('10')
		await modal.$('button=OK').click()

		// The clock ends 10 minutes after its start, and the task stops.
		content = await waitForChange(content)
		assert.deepStrictEqual(clocksOf(content, '- [ ] Chores'), [
			{ start: `${today.date}T00:00:00`, end: `${today.date}T00:10:00` },
		])
		await expect(button('Start Chores')).toBeDisplayed()
	})

	it('ends an interruption after the duration typed from its timer', async function () {
		let content = await writeToday([
			'- [ ] Chores',
			`      [clock::${today.date}T00:00:00--${today.date}T00:05:00]`,
			'- [ ] Interruption',
			`      [clock::${today.date}T00:05:00]`,
		])
		await openTracker()
		await expect(browser.$('button=Interruption')).toHaveAttribute(
			'aria-pressed',
			'true'
		)

		// Notices can cover the running rows: press the button through the DOM.
		const duration = await button(
			'Set duration of the interruption'
		).getElement()
		await browser.execute((el) => el.click(), duration)
		const modal = await modalTitled('How long did the interruption last?')
		const minutes = modal.$('input[type="number"]')
		await minutes.setValue('10')
		await expect(minutes).toHaveValue('10')
		await modal.$('button=OK').click()
		const picker = browser.$('.prompt')
		await expect(picker).toBeDisplayed()
		await browser.keys([...'Phone call'])
		await expect(picker.$('.suggestion-item.is-selected')).toHaveText(
			'➕ Create "Phone call"'
		)
		await browser.keys('Enter')

		// 00:05 + 10 minutes: the call took 00:05–00:15 and Chores resumed
		// then, not now.
		content = await waitForChange(content)
		assert.deepStrictEqual(clocksOf(content, '- [ ] Chores'), [
			{ start: `${today.date}T00:00:00`, end: `${today.date}T00:05:00` },
			{ start: `${today.date}T00:15:00`, end: null },
		])
		assert.deepStrictEqual(clocksOf(content, '- [ ] Phone call'), [
			{ start: `${today.date}T00:05:00`, end: `${today.date}T00:15:00` },
		])
		await expect(browser.$('button=Interruption')).toHaveAttribute(
			'aria-pressed',
			'false'
		)
	})

	it('ends an interruption at the time typed on its row', async function () {
		let content = await writeToday([
			'- [ ] Chores',
			`      [clock::${today.date}T00:00:00--${today.date}T00:05:00]`,
			'- [ ] Interruption',
			`      [clock::${today.date}T00:05:00]`,
		])
		await openTracker()
		await expect(browser.$('button=Interruption')).toHaveAttribute(
			'aria-pressed',
			'true'
		)

		// Notices can cover the running rows: press the button through the DOM.
		const endAt = await button('End interruption at…').getElement()
		await browser.execute((el) => el.click(), endAt)
		const modal = await modalTitled('When did the interruption end?')
		await typeTime(modal, '00:15')
		await modal.$('button=OK').click()
		const picker = browser.$('.prompt')
		await expect(picker).toBeDisplayed()
		await browser.keys([...'Phone call'])
		await expect(picker.$('.suggestion-item.is-selected')).toHaveText(
			'➕ Create "Phone call"'
		)
		await browser.keys('Enter')

		// The call took 00:05–00:15 and Chores resumed then, not now.
		content = await waitForChange(content)
		assert.deepStrictEqual(clocksOf(content, '- [ ] Chores'), [
			{ start: `${today.date}T00:00:00`, end: `${today.date}T00:05:00` },
			{ start: `${today.date}T00:15:00`, end: null },
		])
		assert.deepStrictEqual(clocksOf(content, '- [ ] Phone call'), [
			{ start: `${today.date}T00:05:00`, end: `${today.date}T00:15:00` },
		])
		await expect(browser.$('button=Interruption')).toHaveAttribute(
			'aria-pressed',
			'false'
		)
	})

	it('shows a set shortcut after a row menu item', async function () {
		await writeToday(['- [ ] Chores', `      [clock::${today.date}T00:00:00]`])
		await openTracker()
		await browser.executeObsidian(({ app }) => {
			const { hotkeyManager } = app as unknown as WithHotkeys
			hotkeyManager.setHotkeys(
				'obsidian-task-time-tracker:migrate-current-task',
				[{ modifiers: ['Mod', 'Alt'], key: 'D' }]
			)
		})

		const more = await button('More actions for Chores').getElement()
		await browser.execute((el) => el.click(), more)
		const title = browser
			.$('.menu')
			.$('.menu-item-title*=Migrate clock to another task')
		await expect(title).toBeDisplayed()
		// Obsidian's menu shows the shortcut apart, without brackets.
		await expect(title).toHaveText(
			expect.stringMatching(/^Migrate clock to another task\s+[^\s(]/)
		)
		// A native menu (macOS) takes the title's text: brackets keep it apart.
		const nativeLabel = await browser.execute(
			(el) => el.textContent,
			await title.getElement()
		)
		assert.match(nativeLabel ?? '', /^Migrate clock to another task \(\S.*\)$/)
		await browser.keys('Escape')

		await browser.executeObsidian(({ app }) => {
			const { hotkeyManager } = app as unknown as WithHotkeys
			hotkeyManager.removeHotkeys(
				'obsidian-task-time-tracker:migrate-current-task'
			)
		})
	})

	it('edits the tags of a task in this note only', async function () {
		let content = await writeToday([
			'- [ ] Email #work #admin',
			'- [ ] Gym #project #sport',
		])
		await openTracker()
		/** A row's tag slot, named by the tags it lists. */
		const slot = (task: string, tags: string) =>
			browser.$(`li*=${task}`).$(`button[aria-label="${tags}"]`)
		// #project maps to ⭐️ (wdio.conf.mts), badged with the unmapped #sport.
		await expect(slot('Gym', '#project #sport')).toHaveText(/^⭐️\s*\+1$/)
		// No tag of Email has an emoji: a hash icon stands for them.
		await expect(slot('Email', '#work #admin')).toHaveText('')

		await slot('Email', '#work #admin').click()
		const editor = browser.$('div[role="dialog"][aria-label="Tags of Email"]')
		await expect(editor).toBeDisplayed()
		const chips = editor.$('div[role="group"][aria-label="Tags"]')
		// Two chips, then the input.
		await expect(chips).toHaveChildren(3)
		const input = editor.$('input[aria-label="Add a tag"]')
		await expect(input).toBeFocused()

		await editor.$('button[aria-label="Remove #admin"]').click()
		await expect(chips).toHaveChildren(2)
		await input.setValue('deep')
		await browser.keys('Enter')
		await expect(chips).toHaveChildren(3)
		await expect(input).toHaveValue('')
		// Enter on the empty field saves.
		await browser.keys('Enter')
		content = await waitForChange(content)
		assert.strictEqual(
			content,
			'- [ ] Email #work #deep\n- [ ] Gym #project #sport\n'
		)
		await expect(slot('Email', '#work #deep')).toHaveAttribute(
			'aria-expanded',
			'false'
		)
		// The task's line in an earlier note keeps its tags.
		assert.match(await obsidianPage.read('2026-08-03.md'), /^- \[ \] Email$/m)

		// Escape drops the edits and hands the focus back to the slot.
		await slot('Gym', '#project #sport').click()
		const gymEditor = browser.$('div[role="dialog"][aria-label="Tags of Gym"]')
		await expect(gymEditor).toBeDisplayed()
		await gymEditor.$('button[aria-label="Remove #project"]').click()
		await expect(
			gymEditor.$('div[role="group"][aria-label="Tags"]')
		).toHaveChildren(2)
		await browser.keys('Escape')
		await expect(slot('Gym', '#project #sport')).toBeFocused()
		await expect(slot('Gym', '#project #sport')).toHaveAttribute(
			'aria-expanded',
			'false'
		)
		assert.strictEqual(await obsidianPage.read(today.path), content)
	})

	it('warns about a task listed twice and goes to the repeated line', async function () {
		const content = await writeToday([
			'- [ ] Email',
			'- [ ] Chores',
			'- [x] Email',
		])
		await openTracker()

		// The rows are keyed by name: the tab shows the warning instead.
		const warning = browser.$('[role="tabpanel"] [role="alert"]')
		await expect(warning).toHaveText(
			expect.stringContaining('Email is listed twice in this note')
		)
		const notice = noticeWith('is listed twice in this note')
		await expect(notice).toHaveText(expect.stringContaining('Email'))

		await clickNoticeButton(notice, 'Go to task')
		await browser.waitUntil(async () => (await cursorLine()) === 2, {
			timeoutMsg: 'the editor did not go to the repeated line',
		})
		assert.strictEqual(await cursorLine(), 2)

		// Renamed, the line is a task of its own: the plan is back.
		await obsidianPage.write(
			today.path,
			content.replace('- [x] Email', '- [x] Emails')
		)
		await expectPlan(['Email', 'Chores'])
		await expect(browser.$('h2=Done')).toBeDisplayed()
	})

	it('shows a task alone in the task manager from its menu', async function () {
		await writeToday(['- [ ] Email', '- [ ] Emails'])
		await openTracker()

		await chooseFromRowMenu('Email', 'Show in task manager')
		const modal = await modalTitled('Manage tasks and tags')
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

		// Left open, the modal covers the view the next test waits on.
		await browser.keys('Escape')
		await browser.waitUntil(
			async () => !(await browser.$('.modal-container').isExisting()),
			{ timeoutMsg: 'the task manager stayed open' }
		)
	})

	it('opens the tag manager from the view menu', async function () {
		await writeToday(['- [ ] Email #work'])
		await openTracker()

		await button('More actions').click()
		const item = browser.$('.menu-item-title*=Manage tags')
		await expect(item).toBeDisplayed()
		await item.click()
		const modal = await modalTitled('Manage tasks and tags')
		await expect(modal.$('[role="tab"][aria-selected="true"]')).toHaveText(
			'Tags'
		)
	})
})
