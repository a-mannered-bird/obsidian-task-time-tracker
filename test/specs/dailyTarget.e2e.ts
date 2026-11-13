import assert from 'node:assert'
import { browser, expect } from '@wdio/globals'
import { obsidianPage } from 'wdio-obsidian-service'
import { dayNote } from './support/days'
import { resetVault } from './support/vault'

/**
 * Which daily note the tracker acts on: today's, even before it exists,
 * never the latest earlier one; clocks left running in the note before
 * today's are offered for stopping; a past note says it is one.
 */

/** A note that is not a daily note, so nothing pins the tracker to a day. */
const SCRATCH = 'Scratch.md'
const LATEST_FIXTURE = '2026-08-03.md'

async function noteExists(path: string): Promise<boolean> {
	return browser.executeObsidian(
		({ app }, path) => app.vault.getFileByPath(path) !== null,
		path
	)
}

async function openTrackerTab() {
	await browser.executeObsidianCommand(
		'obsidian-task-time-tracker:open-daily-view'
	)
	const tab = browser.$('button[role="tab"]=Tracker')
	await tab.click()
	await expect(tab).toHaveAttribute('aria-selected', 'true')
}

describe('daily target', function () {
	beforeEach(async function () {
		await resetVault()
		await obsidianPage.write(SCRATCH, 'Not a daily note.\n')
	})

	it("creates today's note on the first write instead of writing into the latest one", async function () {
		const today = dayNote(0)
		const latestBefore = await obsidianPage.read(LATEST_FIXTURE)
		await obsidianPage.openFile(SCRATCH)
		assert.strictEqual(await noteExists(today.path), false)

		await browser.executeObsidianCommand(
			'obsidian-task-time-tracker:toggle-task'
		)
		const picker = browser.$('.prompt')
		await expect(picker).toBeDisplayed()
		await browser.keys([...'Plan the week'])
		// The create row also offers Add to list, which Enter does not press.
		await expect(picker.$('.suggestion-item.is-selected')).toHaveText(
			expect.stringContaining('➕ Create "Plan the week"')
		)
		await browser.keys('Enter')

		await browser.waitUntil(() => noteExists(today.path), {
			timeoutMsg: "today's note was not created",
		})
		const lines = (await obsidianPage.read(today.path)).trim().split('\n')
		assert.strictEqual(lines[0], '- [ ] Plan the week')
		assert.match(
			lines[1] ?? '',
			new RegExp(`^ +\\[clock::${today.date}T[\\d:]{8}\\]$`)
		)
		assert.strictEqual(await obsidianPage.read(LATEST_FIXTURE), latestBefore)
	})

	it('stops a clock left running yesterday at its bed time', async function () {
		const yesterday = dayNote(-1)
		const note = [
			'---',
			`bed_time: ${yesterday.date}T23:15:00`,
			'---',
			'- [ ] Write blog post',
			`      [clock::${yesterday.date}T22:40:00]`,
			'',
		].join('\n')
		await obsidianPage.write(yesterday.path, note)
		await obsidianPage.openFile(SCRATCH)
		await openTrackerTab()

		await expect(browser.$('h2=Still running from yesterday')).toBeDisplayed()
		const stop = browser.$('button=Stop at 23:15')
		await expect(stop).toBeEnabled()
		await stop.click()

		await browser.waitUntil(
			async () => (await obsidianPage.read(yesterday.path)) !== note,
			{ timeoutMsg: "yesterday's clock was not stopped" }
		)
		assert.strictEqual(
			await obsidianPage.read(yesterday.path),
			note.replace(
				`[clock::${yesterday.date}T22:40:00]`,
				`[clock::${yesterday.date}T22:40:00--${yesterday.date}T23:15:00]`
			)
		)
		// Nothing running is left, so the card goes, and today's note was
		// not needed for that.
		await browser.waitUntil(
			async () =>
				!(await browser.$('h2=Still running from yesterday').isExisting()),
			{ timeoutMsg: 'the card stayed' }
		)
		await expect(browser.$('p=Nothing tracked yet')).toBeDisplayed()
		assert.strictEqual(await noteExists(dayNote(0).path), false)

		// The reset deletes the note: start the next test without its clocks.
		await browser.executeObsidian(({ plugins }, path) => {
			plugins.obsidianTaskTimeTracker.lostClocks.forget(path)
		}, yesterday.path)
	})

	it('stops a clock left running yesterday at a typed time', async function () {
		const yesterday = dayNote(-1)
		const note = [
			'- [ ] Write blog post',
			`      [clock::${yesterday.date}T22:40:00]`,
			'',
		].join('\n')
		await obsidianPage.write(yesterday.path, note)
		await obsidianPage.openFile(SCRATCH)
		await openTrackerTab()

		await expect(browser.$('h2=Still running from yesterday')).toBeDisplayed()
		// Without a bed time, typing the time is the only way offered.
		const stop = browser.$('button=Stop at…')
		await expect(stop).toBeEnabled()
		await stop.click()

		const modals = await browser.$$('.modal-container').getElements()
		const modal = modals[modals.length - 1]!.$('.modal')
		await expect(modal.$('.modal-title')).toHaveText('Stop Write blog post')
		const input = modal.$('input[placeholder="HH:MM"]')
		await expect(input).toBeFocused()

		// An impossible time keeps the prompt open and says why.
		await input.setValue('25:00')
		await expect(input).toHaveValue('25:00')
		await modal.$('button=Stop').click()
		await expect(modal.$('p=Enter a time like 23:15.')).toBeDisplayed()

		await input.setValue('23:30')
		await expect(input).toHaveValue('23:30')
		await modal.$('button=Stop').click()

		await browser.waitUntil(
			async () => (await obsidianPage.read(yesterday.path)) !== note,
			{ timeoutMsg: "yesterday's clock was not stopped" }
		)
		assert.strictEqual(
			await obsidianPage.read(yesterday.path),
			note.replace(
				`[clock::${yesterday.date}T22:40:00]`,
				`[clock::${yesterday.date}T22:40:00--${yesterday.date}T23:30:00]`
			)
		)
		await expect(browser.$('p=Nothing tracked yet')).toBeDisplayed()

		// The reset deletes the note: start the next test without its clocks.
		await browser.executeObsidian(({ plugins }, path) => {
			plugins.obsidianTaskTimeTracker.lostClocks.forget(path)
		}, yesterday.path)
	})

	it('says when the note shown is not today and goes back to today', async function () {
		await obsidianPage.openFile(LATEST_FIXTURE)
		await openTrackerTab()

		const strip = browser.$('[role="status"]*=You\'re viewing')
		await expect(strip).toHaveText(
			expect.stringContaining("You're viewing August 3, 2026")
		)
		// Every tab says so, not only the tracker.
		const timeline = browser.$('button[role="tab"]=Timeline')
		await browser.execute((el) => el.click(), await timeline.getElement())
		await expect(timeline).toHaveAttribute('aria-selected', 'true')
		await expect(strip).toHaveText(
			expect.stringContaining("You're viewing August 3, 2026")
		)
		await strip.$('button=Back to today').click()

		const today = dayNote(0)
		await browser.waitUntil(() => noteExists(today.path), {
			timeoutMsg: "today's note was not opened",
		})
		await expect(browser.$(`span=${today.date}`)).toBeDisplayed()
	})

	it('shows the past note Obsidian reopens at startup', async function () {
		await obsidianPage.openFile(LATEST_FIXTURE)
		await openTrackerTab()
		await expect(browser.$('span=2026-08-03')).toBeDisplayed()
		await browser.executeObsidian(({ app }) =>
			app.workspace.requestSaveLayout.run()
		)

		await browser.reloadObsidian()

		await expect(browser.$('span=2026-08-03')).toBeDisplayed()
	})
})
