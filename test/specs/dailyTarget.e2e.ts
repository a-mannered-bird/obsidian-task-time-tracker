import assert from 'node:assert'
import { browser, expect } from '@wdio/globals'
import { obsidianPage } from 'wdio-obsidian-service'
import { openDailyView, selectDailyViewTab } from './support/dailyView'
import { dayNote, isoDateTime, promptDay } from './support/days'
import { clickNoticeButton } from './support/notices'
import { minutesField, typeMinutes, typeTime } from './support/timePrompt'
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

const openTrackerTab = () => openDailyView('Tracker')

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
		await expect(picker.$('.suggestion-item.is-selected')).toHaveText(
			expect.stringContaining('➕ Create "Plan the week"')
		)
		await browser.keys('Enter')

		// The first task of the day asks when the day actually started,
		// counting minutes back from the task's start.
		const modals = await browser.$$('.modal-container').getElements()
		const dayStart = modals[modals.length - 1]!.$('.modal')
		await expect(dayStart.$('.modal-title')).toHaveText('Start of day')
		await expect(dayStart.$('p')).toHaveText(
			"It's the first task of the day! But when did your day actually start?"
		)
		const minutes = dayStart.$('input[type="number"]')
		await expect(minutes).toBeFocused()
		await minutes.setValue('20')
		await expect(minutes).toHaveValue('20')
		await browser.keys('Enter')

		await browser.waitUntil(() => noteExists(today.path), {
			timeoutMsg: "today's note was not created",
		})
		const lines = (await obsidianPage.read(today.path)).trim().split('\n')
		const start = /^ +\[clock::(\S{19})\]$/.exec(lines[4] ?? '')?.[1]
		assert.ok(start?.startsWith(`${today.date}T`), `clock line: ${lines[4]}`)
		assert.ok(start)
		const twentyBefore = new Date(new Date(start).valueOf() - 20 * 60 * 1000)
		assert.deepStrictEqual(lines.slice(0, 4), [
			'---',
			`day_start: ${isoDateTime(twentyBefore)}`,
			'---',
			'- [ ] Plan the week',
		])
		assert.strictEqual(await obsidianPage.read(LATEST_FIXTURE), latestBefore)
	})

	it('stops a clock left running yesterday at its end of day', async function () {
		const yesterday = dayNote(-1)
		const note = [
			'---',
			`day_end: ${yesterday.date}T23:15:00`,
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
		// Without a end of day, typing the time is the only way offered.
		const stop = browser.$('button=Stop at…')
		await expect(stop).toBeEnabled()
		await stop.click()

		const modals = await browser.$$('.modal-container').getElements()
		const modal = modals[modals.length - 1]!.$('.modal')
		await expect(modal.$('.modal-title')).toHaveText('Stop Write blog post')
		// It opens on now, its 0 minutes ago selected to type over.
		const minutes = minutesField(modal)
		await expect(minutes).toBeFocused()
		await expect(minutes).toHaveValue('0')

		// Minutes reaching back before the 22:40 start are refused as typed,
		// and the prompt stays open.
		await typeMinutes(modal, '100000')
		const refused = modal.$('p=That is not after the start, 22:40.')
		await expect(refused).toBeDisplayed()
		await modal.$('button=Stop').click()
		await expect(refused).toBeDisplayed()

		// A time of day carries the minutes along; the line names its day.
		await typeTime(modal, '23:30')
		await expect(modal.$(`p=${promptDay(-1)} at 23:30`)).toBeDisplayed()
		const minutesAgo = Number(await minutes.getValue())
		assert.ok(minutesAgo > 0, `minutes field shows ${minutesAgo}`)
		await modal.$('button=Stop').click()

		await browser.waitUntil(
			async () => (await obsidianPage.read(yesterday.path)) !== note,
			{ timeoutMsg: "yesterday's clock was not stopped" }
		)
		// Its last running clock stopped, yesterday ends when it did.
		assert.strictEqual(
			await obsidianPage.read(yesterday.path),
			[
				'---',
				`day_end: ${yesterday.date}T23:30:00`,
				'---',
				'- [ ] Write blog post',
				`      [clock::${yesterday.date}T22:40:00--${yesterday.date}T23:30:00]`,
				'',
			].join('\n')
		)
		await expect(browser.$('p=Nothing tracked yet')).toBeDisplayed()

		// The notice tells the end of day changed; Change moves the stop, and
		// the end of day follows it.
		const notice = browser.$('.notice*=End of day set to yesterday at 23:30.')
		await clickNoticeButton(notice, 'Change')
		const changes = await browser.$$('.modal-container').getElements()
		const change = changes[changes.length - 1]!.$('.modal')
		await expect(change.$('.modal-title')).toHaveText(
			'Change when Write blog post stopped'
		)
		await typeTime(change, '23:50')
		await expect(change.$(`p=${promptDay(-1)} at 23:50`)).toBeDisplayed()
		await change.$('button=Change').click()
		await expect(
			browser.$('.notice*=End of day set to yesterday at 23:50.')
		).toBeDisplayed()
		assert.strictEqual(
			await obsidianPage.read(yesterday.path),
			[
				'---',
				`day_end: ${yesterday.date}T23:50:00`,
				'---',
				'- [ ] Write blog post',
				`      [clock::${yesterday.date}T22:40:00--${yesterday.date}T23:50:00]`,
				'',
			].join('\n')
		)
	})

	it('gives the start and end of day the date and time property type', async function () {
		// Obsidian's property type registry is private API (see
		// src/ui/propertyTypes.ts); read it the way the plugin does.
		const types = await browser.executeObsidian(({ app }) => {
			const manager = Reflect.get(app, 'metadataTypeManager') as {
				getAssignedWidget(name: string): string | null
			}
			return ['day_start', 'day_end'].map((name) =>
				manager.getAssignedWidget(name)
			)
		})
		assert.deepStrictEqual(types, ['datetime', 'datetime'])
	})

	it('says when the note shown is not today and goes back to today', async function () {
		await obsidianPage.openFile(LATEST_FIXTURE)
		await openTrackerTab()

		const strip = browser.$('[role="status"]*=You\'re viewing')
		await expect(strip).toHaveText(
			expect.stringContaining("You're viewing August 3, 2026")
		)
		// Every tab says so, not only the tracker.
		await selectDailyViewTab('Timeline')
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
