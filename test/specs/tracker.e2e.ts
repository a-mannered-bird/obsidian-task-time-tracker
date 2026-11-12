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

async function openTracker() {
	await obsidianPage.openFile(today.path)
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

async function waitForChange(before: string): Promise<string> {
	await browser.waitUntil(
		async () => (await obsidianPage.read(today.path)) !== before,
		{ timeoutMsg: `${today.path} was not rewritten` }
	)
	return obsidianPage.read(today.path)
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

describe('tracker tab', function () {
	beforeEach(async function () {
		await resetVault()
	})

	afterEach(async function () {
		// The reset deletes today's note: forget the clocks started here.
		await browser.executeObsidian(({ plugins }, path) => {
			plugins.obsidianTaskTimeTracker.lostClocks.forget(path)
		}, today.path)
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
		await expect(
			browser.$('p*=Paused: Chores, German podcast.')
		).toBeDisplayed()

		await browser.$('button=End interruption').click()
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
		// Focused rather than clicked: the notice of the previous step can
		// still cover it.
		const barElement = await bar.getElement()
		await browser.execute((el) => el.focus(), barElement)
		await expect(bar).toBeFocused()
		await browser.keys([...'Call the bank'])
		await expect(bar).toHaveValue('Call the bank')
		const create = browser.$('[role="option"][aria-selected="true"]')
		await expect(create).toHaveText(
			expect.stringContaining('➕ Create "Call the bank"')
		)
		// The notice of the Done step sits over the sidebar's top, where the
		// bar's list opens: press the button through the DOM.
		const add = await create.$('button=Add to list').getElement()
		await browser.execute((el) => el.click(), add)
		content = await waitForChange(content)
		assert.deepStrictEqual(content.trimEnd().split('\n').slice(-2), [
			'- [ ] Run',
			'- [ ] Call the bank',
		])
		await expect(button('Start Call the bank')).toBeDisplayed()

		// No bed time yet: End day asks for it, then confirms the deletion
		// of the two tasks never clocked.
		await browser.$('button=End day').click()
		await (await modalTitled('Set bed time')).$('button=OK').click()
		const modal = await modalTitled('End day')
		await expect(modal.$('li=Call the bank')).toBeDisplayed()
		await modal.$('button=End day').click()

		await browser.waitUntil(
			async () => !(await obsidianPage.read(today.path)).includes('- [ ] Run'),
			{ timeoutMsg: 'the day was not ended' }
		)
		content = await obsidianPage.read(today.path)
		assert.match(content, new RegExp(`^---\\nbed_time: ${today.date}T`))
		assert.deepStrictEqual(
			content.split('\n').filter((line) => line.startsWith('- [')),
			['- [x] Write']
		)
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
		const input = modal.$('input[placeholder="HH:MM"]')
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

		await browser.$('button=Started 00:00').click()
		const modal = await modalTitled('Change when Chores started')
		const input = modal.$('input[placeholder="HH:MM"]')
		await input.setValue('00:05')
		await expect(input).toHaveValue('00:05')
		await modal.$('button=Change').click()

		content = await waitForChange(content)
		assert.deepStrictEqual(clocksOf(content, '- [ ] Chores'), [
			{ start: `${today.date}T00:05:00`, end: null },
		])
		await expect(browser.$('button=Started 00:05')).toBeDisplayed()
	})
})
