import assert from 'node:assert'
import { browser, expect } from '@wdio/globals'
import type { ChainablePromiseElement } from 'webdriverio'
import { obsidianPage } from 'wdio-obsidian-service'
import { openDailyView } from './support/dailyView'
import { dayNote } from './support/days'
import { clickNoticeButton, noticeWith } from './support/notices'
import { typeTime } from './support/timePrompt'
import { resetVault } from './support/vault'

/**
 * The Goals tab: cards with rings over today's note, edited through their
 * steppers, fields and menu, suggested cards, and the Set goal… command.
 * Each test asserts the exact goal lines written.
 */

const today = dayNote(0)
const yesterday = dayNote(-1)

async function writeNote(path: string, lines: string[]): Promise<string> {
	const content = `${lines.join('\n')}\n`
	await obsidianPage.write(path, content)
	return content
}

async function openGoals() {
	await obsidianPage.openFile(today.path)
	await openDailyView('Goals')
}

async function waitForChange(before: string): Promise<string> {
	await browser.waitUntil(
		async () => (await obsidianPage.read(today.path)) !== before,
		{ timeoutMsg: `${today.path} was not rewritten` }
	)
	return obsidianPage.read(today.path)
}

/** The goal lines of the note, in order. */
function goalLines(content: string): string[] {
	return content.split('\n').filter((line) => line.includes('[goal::'))
}

const card = (title: string) =>
	browser.$(`[role="listitem"][aria-label="${title}"]`)

const field = (label: string) => browser.$(`input[aria-label="${label}"]`)

/** Type into a card field and commit it with Enter. */
async function typeInto(input: ChainablePromiseElement, value: string) {
	await input.click()
	await browser.keys(['Control', 'a'])
	await browser.keys(['Meta', 'a'])
	await browser.keys([...value, 'Enter'])
}

/** The modal on top of the stack, once it holds a picker or prompt. */
async function topModal() {
	await browser.waitUntil(
		async () => (await browser.$$('.modal-container').getElements()).length > 0
	)
	const containers = await browser.$$('.modal-container').getElements()
	return containers[containers.length - 1]!.$('.modal')
}

describe('goals tab', function () {
	beforeEach(async function () {
		await resetVault()
	})

	it('records results with the steppers and fields, and edits targets', async function () {
		let content = await writeNote(today.path, [
			'- [ ] Run #sport',
			'      [goal::1h]',
			'      [goal::distance 8/10 km]',
			'      [goal::speed /12 km/h]',
			`      [clock::${today.date}T07:00:00--${today.date}T07:50:00]`,
		])
		await openGoals()

		await expect(browser.$('[role="list"][aria-label="Run"]')).toHaveChildren(3)
		// The time goal counts the clocks: 50m of 1h, read-only.
		await expect(
			browser.$('[aria-label="Time spent on Run · time"]')
		).toHaveText('50m')
		await expect(field('Result of Run · distance')).toHaveValue('8')
		await expect(card('Run · distance').$('[role="img"]')).toHaveAttribute(
			'aria-label',
			'80% of the target'
		)

		await card('Run · distance')
			.$('button[aria-label="Increase Run · distance"]')
			.click()
		content = await waitForChange(content)
		assert.deepStrictEqual(goalLines(content), [
			'      [goal::1h]',
			'      [goal::distance 9/10 km]',
			'      [goal::speed /12 km/h]',
		])
		await expect(field('Result of Run · distance')).toHaveValue('9')

		await typeInto(field('Result of Run · distance'), '10')
		content = await waitForChange(content)
		assert.strictEqual(goalLines(content)[1], '      [goal::distance 10/10 km]')
		await expect(card('Run · distance').$('[role="img"]')).toHaveAttribute(
			'aria-label',
			'100% of the target, done'
		)

		// Plain numbers are edited in number inputs, durations as text.
		await expect(field('Target of Run · speed')).toHaveAttribute(
			'type',
			'number'
		)
		await typeInto(field('Target of Run · speed'), '14')
		content = await waitForChange(content)
		assert.strictEqual(goalLines(content)[2], '      [goal::speed /14 km/h]')
		await expect(field('Target of Run · speed')).toHaveValue('14')

		await expect(field('Target of Run · time')).toHaveAttribute('type', 'text')
		await typeInto(field('Target of Run · time'), '90')
		content = await waitForChange(content)
		assert.strictEqual(goalLines(content)[0], '      [goal::1h30m]')
		await expect(field('Target of Run · time')).toHaveValue('1h30m')
	})

	it('edits an "at most" goal in number fields, its ring emptying', async function () {
		let content = await writeNote(today.path, [
			'- [ ] Snacks',
			'      [goal::cookies 1/<4]',
		])
		await openGoals()

		const ring = card('Snacks · cookies').$('[role="img"]')
		// 1 cookie of at most 4: three quarters of the limit are left.
		await expect(ring).toHaveAttribute('aria-label', '75% of the limit left')
		await expect(field('Target of Snacks · cookies')).toHaveAttribute(
			'type',
			'number'
		)
		await expect(field('Target of Snacks · cookies')).toHaveValue('4')

		// Focusing a field selects its value, so typing replaces it.
		await field('Result of Snacks · cookies').click()
		await browser.keys(['2', 'Enter'])
		content = await waitForChange(content)
		assert.deepStrictEqual(goalLines(content), ['      [goal::cookies 2/<4]'])
		await expect(ring).toHaveAttribute('aria-label', '50% of the limit left')

		await field('Target of Snacks · cookies').click()
		await browser.keys(['3', 'Enter'])
		content = await waitForChange(content)
		assert.deepStrictEqual(goalLines(content), ['      [goal::cookies 2/<3]'])
		await expect(ring).toHaveAttribute('aria-label', '33% of the limit left')
	})

	it('deletes a goal from its menu, with Undo', async function () {
		const content = await writeNote(today.path, [
			'- [ ] Run',
			'      [goal::distance 8/10 km]',
			'      [goal::speed /12 km/h]',
		])
		await openGoals()
		await card('Run · speed')
			.$('button[aria-label="Actions for Run · speed"]')
			.click()
		const deleteItem = browser.$('.menu-item-title=Delete goal')
		await expect(deleteItem).toBeDisplayed()
		await deleteItem.click()

		const deleted = await waitForChange(content)
		assert.deepStrictEqual(goalLines(deleted), [
			'      [goal::distance 8/10 km]',
		])
		await expect(browser.$('[role="list"][aria-label="Run"]')).toHaveChildren(1)

		await clickNoticeButton(noticeWith('Deleted the goal'), 'Undo')
		await browser.waitUntil(
			async () => (await obsidianPage.read(today.path)) === content,
			{ timeoutMsg: 'the goal did not come back' }
		)
		await expect(browser.$('[role="list"][aria-label="Run"]')).toHaveChildren(2)
	})

	it("suggests a task's last goals the note lacks and adds them", async function () {
		await writeNote(yesterday.path, [
			'- [x] Anki',
			'      [goal::cards 140/200]',
			'- [x] Run',
			'      [goal::1h]',
			'      [goal::distance 8/10 km]',
		])
		const content = await writeNote(today.path, [
			'- [ ] Anki',
			'- [ ] Email',
			'- [ ] Run',
			'      [goal::45m]',
		])
		await openGoals()

		// Suggestions sit under their task: Anki's cards alone, and Run's
		// distance next to its time goal (only the distance is missing).
		await expect(browser.$('[role="list"][aria-label="Anki"]')).toHaveChildren(
			1
		)
		await expect(browser.$('[role="list"][aria-label="Run"]')).toHaveChildren(2)
		await expect(
			browser
				.$('[role="list"][aria-label="Run"]')
				.$('[role="listitem"][aria-label="Suggested Run · distance"]')
		).toBeDisplayed()
		const suggested = browser.$(
			'[role="listitem"][aria-label="Suggested Anki · cards"]'
		)
		await expect(suggested).toHaveText(expect.stringContaining('/ 200'))
		await suggested.$('button[aria-label="Add Anki · cards to today"]').click()

		const added = await waitForChange(content)
		assert.deepStrictEqual(added.split('\n'), [
			'- [ ] Anki',
			'      [goal::cards /200]',
			'- [ ] Email',
			'- [ ] Run',
			'      [goal::45m]',
			'',
		])
		await expect(field('Result of Anki · cards')).toHaveValue('0')
		// Anki's suggestion became its goal card; Run still offers its distance.
		await expect(browser.$('[role="list"][aria-label="Anki"]')).toHaveChildren(
			1
		)
		await expect(browser.$('[role="list"][aria-label="Run"]')).toHaveChildren(2)
	})

	it('rejects, brings back and accepts all suggestions from the toolbar and the commands', async function () {
		await writeNote(yesterday.path, [
			'- [x] Anki',
			'      [goal::cards 140/200]',
			'- [x] Run',
			'      [goal::distance 8/10 km]',
		])
		const content = await writeNote(today.path, ['- [ ] Anki', '- [ ] Run'])
		await openGoals()

		// The Add goal card, a heading and a list per task, then the Tags
		// heading, its list and the Add tag goal card.
		const goals = browser.$('section[aria-label="Goals"]')
		await expect(goals).toHaveChildren(8)
		const toolbar = browser.$('[role="toolbar"][aria-label="Goal suggestions"]')
		const accept = toolbar.$('button=Accept all')
		const reject = toolbar.$('button=Reject all')
		const reset = toolbar.$('button=Reset')
		await expect(accept).toBeEnabled()
		await expect(reject).toBeEnabled()
		// Nothing rejected yet: Reset shows, disabled, and still teaches its
		// command.
		await expect(reset).toBeDisabled()
		await reset.moveTo()
		const tooltip = browser.$('.tooltip')
		await expect(tooltip).toHaveText(
			'Bring back the suggestions rejected for this day\nNo shortcut yet: set one for "Reset rejected goal suggestions" in Settings → Hotkeys'
		)

		await reject.click()
		await expect(noticeWith('2 goal suggestions rejected')).toBeDisplayed()
		// Only the Add goal card and the Tags group are left, and the note is
		// untouched.
		await expect(goals).toHaveChildren(4)
		await expect(accept).toBeDisabled()
		await expect(reject).toBeDisabled()
		await expect(reset).toBeEnabled()
		assert.strictEqual(await obsidianPage.read(today.path), content)

		// The command brings them back in the open tab.
		await browser.executeObsidianCommand(
			'obsidian-task-time-tracker:reset-goal-suggestions'
		)
		await expect(noticeWith('2 goal suggestions brought back')).toBeDisplayed()
		await expect(goals).toHaveChildren(8)
		await expect(reset).toBeDisabled()

		await browser.executeObsidianCommand(
			'obsidian-task-time-tracker:accept-goal-suggestions'
		)
		const added = await waitForChange(content)
		assert.deepStrictEqual(added.split('\n'), [
			'- [ ] Anki',
			'      [goal::cards /200]',
			'- [ ] Run',
			'      [goal::distance /10 km]',
			'',
		])
		await expect(field('Result of Anki · cards')).toHaveValue('0')
		await expect(field('Result of Run · distance')).toHaveValue('0')

		// Leave the sandbox settings as found for the other tests.
		await browser.executeObsidian(async ({ plugins }) => {
			plugins.obsidianTaskTimeTracker.settings.dismissedGoalSuggestions = []
			await plugins.obsidianTaskTimeTracker.saveSettings()
		})
	})

	it('groups the goals by task, by first tag, or not at all', async function () {
		await writeNote(today.path, [
			'- [ ] Run #sport',
			'      [goal::distance 8/10 km]',
			'- [ ] Read',
			'      [goal::pages 5/20]',
			'- [ ] Swim #sport #water',
			'      [goal::laps 10/20]',
		])
		await openGoals()
		const groupBy = browser.$('select[aria-label="Group goals by"]')
		await expect(groupBy).toHaveValue('task')
		await expect(browser.$('[role="list"][aria-label="Run"]')).toHaveChildren(1)

		// Swim joins Run under #sport, its first tag; Read has none.
		await groupBy.selectByAttribute('value', 'tag')
		const sport = browser.$('[role="list"][aria-label="#sport"]')
		await expect(sport).toHaveChildren(2)
		await expect(sport.$('[role="listitem"]:nth-child(1)')).toHaveAttribute(
			'aria-label',
			'Run · distance'
		)
		await expect(sport.$('[role="listitem"]:nth-child(2)')).toHaveAttribute(
			'aria-label',
			'Swim · laps'
		)
		// Without the task heading, a card names its task.
		await expect(sport.$('[role="listitem"]:nth-child(2)')).toHaveText(
			expect.stringContaining('Swim · laps')
		)
		await expect(
			browser.$('[role="list"][aria-label="No tag"]')
		).toHaveChildren(1)

		// Ungrouped: every task's goals side by side, in note order.
		await groupBy.selectByAttribute('value', 'none')
		const all = browser.$('[role="list"][aria-label="Task goals"]')
		await expect(all).toHaveChildren(3)
		await expect(all.$('[role="listitem"]:nth-child(2)')).toHaveAttribute(
			'aria-label',
			'Read · pages'
		)

		await groupBy.selectByAttribute('value', 'task')
		await expect(groupBy).toHaveValue('task')
	})

	it('sets a goal of a new metric from the Add goal card', async function () {
		const content = await writeNote(today.path, ['- [ ] Read'])
		await openGoals()
		await browser.$('button=Add goal').click()

		const taskPicker = browser.$('.prompt')
		await expect(taskPicker.$('input')).toHaveAttribute(
			'placeholder',
			'Set a goal for which task?'
		)
		await browser.keys([...'Read'])
		await expect(
			taskPicker.$('.suggestion-item:nth-child(1 of .suggestion-item)')
		).toHaveText(expect.stringContaining('Read'))
		await browser.keys('Enter')

		const metricInput = browser.$(
			'.prompt input[placeholder^="Which goal for Read?"]'
		)
		await expect(metricInput).toBeDisplayed()
		await browser.keys([...'pages'])
		await expect(browser.$('.prompt .suggestion-item.is-selected')).toHaveText(
			'➕ New metric "pages"'
		)
		await browser.keys('Enter')

		const prompt = await topModal()
		await expect(prompt.$('.modal-title')).toHaveText('pages goal for Read')
		await prompt.$('input[type="text"]').setValue('20 pages')
		await expect(prompt.$('input[type="text"]')).toHaveValue('20 pages')
		await prompt.$('button=OK').click()

		const written = await waitForChange(content)
		assert.deepStrictEqual(written.split('\n'), [
			'- [ ] Read',
			'      [goal::pages /20 pages]',
			'',
		])
		await expect(field('Target of Read · pages')).toHaveValue('20')
	})

	it('records a result in the number field of the command prompt', async function () {
		const content = await writeNote(today.path, [
			'- [ ] Weight',
			'      [goal::weight 81,4/<80 kg]',
		])
		await obsidianPage.openFile(today.path)
		await browser.executeObsidianCommand(
			'obsidian-task-time-tracker:record-goal-result'
		)
		const taskPicker = browser.$('.prompt')
		await expect(taskPicker.$('.suggestion-item')).toHaveText('Weight')
		await browser.keys('Enter')

		const prompt = await topModal()
		await expect(prompt.$('.modal-title')).toHaveText('Weight · weight')
		const input = prompt.$('input')
		await expect(input).toHaveAttribute('type', 'number')
		// A number input only takes a dot: the note's comma is shown as one.
		await expect(input).toHaveValue('81.4')

		// The value is selected on opening, so typing replaces it.
		await browser.keys([...'80.9', 'Enter'])
		const recorded = await waitForChange(content)
		assert.deepStrictEqual(goalLines(recorded), [
			'      [goal::weight 80,9/<80 kg]',
		])
	})

	it('asks for the unmet results when the day ends, then warns of those still missing', async function () {
		const content = await writeNote(today.path, [
			'---',
			`day_start: ${today.date}T08:00:00`,
			'---',
			'- [ ] Run',
			'      [goal::1h]',
			'      [goal::distance /10 km]',
			`      [clock::${today.date}T07:00:00--${today.date}T07:50:00]`,
			'- [ ] Swim',
			'      [goal::laps 20/20]',
			`      [clock::${today.date}T08:00:00--${today.date}T08:30:00]`,
		])
		await openGoals()
		await expect(field('Result of Run · distance')).toHaveValue('0')

		await browser.executeObsidianCommand(
			'obsidian-task-time-tracker:complete-journal-entry'
		)
		const setEnd = await topModal()
		await expect(setEnd.$('.modal-title')).toHaveText(
			'When does the tracking period end?'
		)
		await typeTime(setEnd, '22:00')
		await setEnd.$('button=OK').click()

		// Only Run's distance is asked: Swim reached its laps and the time
		// goal comes from the clocks. Dismissed, it is left without a result.
		const prompt = await topModal()
		await expect(prompt.$('.modal-title')).toHaveText('Run · distance')
		const skip = prompt.$("label=Don't ask for goal results when ending a day")
		assert.strictEqual(await skip.$('input').isSelected(), false)
		await browser.keys('Escape')

		// The confirmation opens to warn of the missing result.
		const confirmation = await topModal()
		await expect(confirmation.$('.modal-title')).toHaveText('End day')
		await expect(
			confirmation.$('p=No results entered for the following goals:')
		).toBeDisplayed()
		await expect(confirmation.$('li=Run · distance')).toBeDisplayed()
		await confirmation.$('button=End day').click()
		await waitForChange(content)
		await expect(noticeWith('Day ended')).toBeDisplayed()
	})

	it('stops asking for results at the end of the day once told so', async function () {
		const content = await writeNote(today.path, [
			'---',
			`day_start: ${today.date}T08:00:00`,
			'---',
			'- [ ] Run',
			'      [goal::distance /10 km]',
			'      [goal::pace /6 min/km]',
			`      [clock::${today.date}T07:00:00--${today.date}T07:50:00]`,
		])
		await obsidianPage.openFile(today.path)
		await browser.executeObsidianCommand(
			'obsidian-task-time-tracker:complete-journal-entry'
		)
		const setEnd = await topModal()
		await typeTime(setEnd, '22:00')
		await setEnd.$('button=OK').click()

		const prompt = await topModal()
		await expect(prompt.$('.modal-title')).toHaveText('Run · distance')
		const skip = prompt
			.$("label=Don't ask for goal results when ending a day")
			.$('input')
		await skip.click()
		await expect(skip).toBeSelected()
		// The checkbox took the focus: back to the field to type the result.
		const result = prompt.$('input[type="number"]')
		await result.click()
		await expect(result).toBeFocused()
		await browser.keys([...'9', 'Enter'])

		// The distance is written; the pace is not asked any more.
		const confirmation = await topModal()
		await expect(confirmation.$('.modal-title')).toHaveText('End day')
		await expect(confirmation.$('li=Run · pace')).toBeDisplayed()
		const asks = await browser.executeObsidian(
			({ plugins }) =>
				plugins.obsidianTaskTimeTracker.settings.askGoalResultsOnEndDay
		)
		assert.strictEqual(asks, false)
		await confirmation.$('button=End day').click()
		const ended = await waitForChange(content)
		assert.deepStrictEqual(goalLines(ended), [
			'      [goal::distance 9/10 km]',
			'      [goal::pace /6 min/km]',
		])

		await browser.executeObsidian(async ({ plugins }) => {
			plugins.obsidianTaskTimeTracker.settings.askGoalResultsOnEndDay = true
			await plugins.obsidianTaskTimeTracker.saveSettings()
		})
	})

	it('asks for the result of an unmet goal when its task is ticked', async function () {
		await writeNote(today.path, [
			'- [ ] Read',
			'      [goal::pages 5/20]',
			'      [goal::30m]',
		])
		await obsidianPage.openFile(today.path)
		await openDailyView('Tracker')
		await browser.$('input[aria-label="Mark Read done"]').click()

		const prompt = await topModal()
		await expect(prompt.$('.modal-title')).toHaveText('Read · pages')
		await expect(prompt.$('input')).toHaveValue('5')
		await browser.keys([...'20', 'Enter'])
		await browser.waitUntil(
			async () => (await obsidianPage.read(today.path)).includes('pages 20/20'),
			{ timeoutMsg: 'the result was not written' }
		)
		const after = await obsidianPage.read(today.path)
		assert.deepStrictEqual(after.split('\n'), [
			'- [x] Read',
			'      [goal::pages 20/20]',
			'      [goal::30m]',
			'',
		])
	})

	it('shows goal bars on tracker rows, recording a result from a bar', async function () {
		const content = await writeNote(today.path, [
			'- [ ] Run #sport',
			'      [goal::1h]',
			'      [goal::distance 8/10 km]',
			'      [goal::speed /12 km/h]',
			'      [goal::cadence /170 spm]',
			`      [clock::${today.date}T07:00:00--${today.date}T07:50:00]`,
			'- [ ] Email',
		])
		await obsidianPage.openFile(today.path)
		await openDailyView('Tracker')

		// Three bars, the fourth goal folded; Email has none.
		const bars = browser.$('ul[aria-label="Goals"]')
		await expect(bars).toHaveChildren(4)
		await expect(
			bars.$('button[aria-label="🎯 distance · 8 / 10 km · 80%"]')
		).toBeDisplayed()
		await expect(bars.$('button=+1')).toBeDisplayed()

		// A metric bar opens the result prompt; the result is written.
		await bars.$('button[aria-label="🎯 distance · 8 / 10 km · 80%"]').click()
		const prompt = await topModal()
		await expect(prompt.$('.modal-title')).toHaveText('Run · distance')
		await expect(prompt.$('input')).toHaveValue('8')
		await browser.keys([...'9', 'Enter'])
		const recorded = await waitForChange(content)
		assert.deepStrictEqual(goalLines(recorded), [
			'      [goal::1h]',
			'      [goal::distance 9/10 km]',
			'      [goal::speed /12 km/h]',
			'      [goal::cadence /170 spm]',
		])

		// A time goal has no result to type: its bar opens the Goals tab.
		await bars.$('button[aria-label^="⏱"]').click()
		await expect(browser.$('button[role="tab"]=Goals')).toHaveAttribute(
			'aria-selected',
			'true'
		)
	})

	it('styles goals from the metric settings and stamps a streak on done cards', async function () {
		const saved = await browser.executeObsidian(({ plugins }) => {
			const { settings } = plugins.obsidianTaskTimeTracker
			return {
				doneBadge: settings.doneBadge,
				metricSettings: settings.metricSettings,
			}
		})
		// The views read these settings when they mount: reload them.
		await browser.executeObsidian(async ({ plugins }) => {
			const plugin = plugins.obsidianTaskTimeTracker
			plugin.settings.doneBadge = 'flame'
			plugin.settings.metricSettings = { cards: { emoji: '🃏' } }
			await plugin.refreshViews()
		})
		try {
			await writeNote(dayNote(-2).path, [
				'- [x] Anki',
				'      [goal::cards 210/200]',
			])
			await writeNote(yesterday.path, [
				'- [x] Anki',
				'      [goal::cards 200/200]',
			])
			await writeNote(today.path, ['- [ ] Anki', '      [goal::cards 230/200]'])
			await openGoals()

			const cards = card('Anki · cards')
			await expect(cards.$('[role="img"]=🃏')).toBeDisplayed()
			// Met today, yesterday and the day before.
			await expect(
				cards.$('[role="img"][aria-label="Met 3 days in a row"]')
			).toHaveText('🔥 3')
		} finally {
			await browser.executeObsidian(async ({ plugins }, values) => {
				const plugin = plugins.obsidianTaskTimeTracker
				Object.assign(plugin.settings, values)
				await plugin.refreshViews()
			}, saved)
		}
	})

	it("lets a goal's streak skip the days without it", async function () {
		const saved = await browser.executeObsidian(({ plugins }) => {
			const { settings } = plugins.obsidianTaskTimeTracker
			return {
				doneBadge: settings.doneBadge,
				streakSkipsMissingDays: settings.streakSkipsMissingDays,
			}
		})
		await browser.executeObsidian(async ({ plugins }) => {
			const plugin = plugins.obsidianTaskTimeTracker
			plugin.settings.doneBadge = 'flame'
			plugin.settings.streakSkipsMissingDays = []
			await plugin.refreshViews()
		})
		try {
			await writeNote(dayNote(-3).path, [
				'- [x] Anki',
				'      [goal::cards 200/200]',
			])
			await writeNote(dayNote(-2).path, ['- [x] Email'])
			await writeNote(yesterday.path, [
				'- [x] Anki',
				'      [goal::cards 200/200]',
			])
			await writeNote(today.path, ['- [ ] Anki', '      [goal::cards 230/200]'])
			await openGoals()

			// The day before yesterday has no Anki: the streak stops there.
			const flame = card('Anki · cards').$('[aria-label$="days in a row"]')
			await expect(flame).toHaveText('🔥 2')

			await card('Anki · cards')
				.$('button[aria-label="Actions for Anki · cards"]')
				.click()
			const skip = browser.$('.menu-item-title=Skip days without it in streaks')
			await expect(skip).toBeDisplayed()
			await skip.click()
			// Skipping that day, the streak reaches back three days earlier.
			await expect(flame).toHaveText('🔥 3')
			await expect(flame).toHaveAttribute('aria-label', 'Met 3 days in a row')
		} finally {
			await browser.executeObsidian(async ({ plugins }, values) => {
				const plugin = plugins.obsidianTaskTimeTracker
				Object.assign(plugin.settings, values)
				await plugin.saveSettings()
				await plugin.refreshViews()
			}, saved)
		}
	})

	it('warns about the settings of a metric no note uses, and forgets them', async function () {
		const saved = await browser.executeObsidian(
			({ plugins }) => plugins.obsidianTaskTimeTracker.settings.metricSettings
		)
		await browser.executeObsidian(async ({ plugins }) => {
			const plugin = plugins.obsidianTaskTimeTracker
			plugin.settings.metricSettings = { steps: { emoji: '👟' } }
			await plugin.vaultTasks.ensureBuilt()
		})
		const main = await browser.getWindowHandle()
		try {
			// This Obsidian opens the settings in their own window.
			await browser.executeObsidian(({ app }) => {
				const setting = (
					app as unknown as {
						setting: { open(): void; openTabById(id: string): void }
					}
				).setting
				setting.open()
				setting.openTabById('obsidian-task-time-tracker')
			})
			await browser.waitUntil(
				async () => (await browser.getWindowHandles()).length > 1,
				{ timeoutMsg: 'the settings window did not open' }
			)
			const handles = await browser.getWindowHandles()
			const settingsWindow = handles.find((handle) => handle !== main)
			assert.ok(settingsWindow)
			await browser.switchToWindow(settingsWindow)

			const warning = browser.$(
				'.setting-item-description=No goal line uses this metric any more. Its settings stay until you forget them.'
			)
			await expect(warning).toBeDisplayed()
			const row = warning.$('../..')
			await expect(row.$('.setting-item-name')).toHaveText('steps')
			await row.$('[aria-label="Forget the settings of steps"]').click()
			// The tab redraws without the row.
			await expect(browser.$('.setting-item-name=Time goals')).toBeDisplayed()
			await browser.switchToWindow(main)
			assert.deepStrictEqual(
				await browser.executeObsidian(
					({ plugins }) =>
						plugins.obsidianTaskTimeTracker.settings.metricSettings
				),
				{}
			)
		} finally {
			await browser.switchToWindow(main)
			await browser.executeObsidian(async ({ app, plugins }, values) => {
				;(app as unknown as { setting: { close(): void } }).setting.close()
				const plugin = plugins.obsidianTaskTimeTracker
				plugin.settings.metricSettings = values
				await plugin.saveSettings()
			}, saved)
		}
	})

	it('sets, edits and deletes a tag goal measured by covered time', async function () {
		let content = await writeNote(today.path, [
			'- [ ] Write #work',
			`      [clock::${today.date}T08:00:00--${today.date}T11:00:00]`,
			'- [ ] Email #work',
			`      [clock::${today.date}T10:00:00--${today.date}T12:00:00]`,
		])
		await openGoals()
		await browser.$('button=Add tag goal').click()

		const tagInput = browser.$(
			'.prompt input[placeholder="Set a time goal for which tag?"]'
		)
		await expect(tagInput).toBeDisplayed()
		await browser.keys([...'#work'])
		await expect(browser.$('.prompt .suggestion-item.is-selected')).toHaveText(
			'#work'
		)
		await browser.keys('Enter')
		const prompt = await topModal()
		await expect(prompt.$('.modal-title')).toHaveText('Time goal for #work')
		await prompt.$('input[type="text"]').setValue('6h')
		await expect(prompt.$('input[type="text"]')).toHaveValue('6h')
		await prompt.$('button=OK').click()

		content = await waitForChange(content)
		assert.deepStrictEqual(content.split('\n').slice(0, 4), [
			'---',
			'tag_goals:',
			'  - "#work 6h"',
			'---',
		])
		const tags = browser.$('[role="list"][aria-label="Tags"]')
		await expect(tags).toHaveChildren(1)
		// 08:00–11:00 and 10:00–12:00 overlap: 4h covered, not 5h.
		await expect(browser.$('[aria-label="Time spent on #work"]')).toHaveText(
			'4h'
		)

		await typeInto(field('Target of #work'), '<5h')
		content = await waitForChange(content)
		assert.strictEqual(content.split('\n')[2], '  - "#work <5h"')
		await expect(field('Target of #work')).toHaveValue('<5h')

		await card('#work').$('button[aria-label="Actions for #work"]').click()
		const deleteItem = browser.$('.menu-item-title=Delete goal')
		await expect(deleteItem).toBeDisplayed()
		await deleteItem.click()
		content = await waitForChange(content)
		assert.strictEqual(content.startsWith('---'), false)
		await expect(noticeWith('Deleted the tag goal #work <5h')).toBeDisplayed()
	})

	it("suggests the latest day's tag goals and adds them", async function () {
		await writeNote(yesterday.path, [
			'---',
			'tag_goals:',
			'  - "#work 6h"',
			'---',
			'- [x] Write #work',
		])
		const content = await writeNote(today.path, ['- [ ] Write #work'])
		await openGoals()

		const suggested = browser.$(
			'[role="listitem"][aria-label="Suggested #work"]'
		)
		await expect(suggested).toHaveText(expect.stringContaining('6h'))
		await suggested.$('button[aria-label="Add #work to today"]').click()
		const added = await waitForChange(content)
		assert.deepStrictEqual(added.split('\n'), [
			'---',
			'tag_goals:',
			'  - "#work 6h"',
			'---',
			'- [ ] Write #work',
			'',
		])
		await expect(browser.$('[role="list"][aria-label="Tags"]')).toHaveChildren(
			1
		)
	})

	it("carries the latest tag goals over to a new day's note", async function () {
		await writeNote(yesterday.path, [
			'---',
			'tag_goals:',
			'  - "#work 6h"',
			'  - "#leisure <2h"',
			'---',
			'- [x] Write #work',
		])
		// The active note is not a daily one: commands then act on today's.
		await obsidianPage.write('Scratch.md', 'Not a daily note.\n')
		await obsidianPage.openFile('Scratch.md')
		assert.strictEqual(
			await browser.executeObsidian(
				({ app }, path) => app.vault.getFileByPath(path) === null,
				today.path
			),
			true
		)

		await browser.executeObsidianCommand('obsidian-task-time-tracker:plan-task')
		await expect(browser.$('.prompt input')).toHaveAttribute(
			'placeholder',
			'Which task to plan?'
		)
		await browser.keys([...'Write'])
		await expect(
			browser.$('.prompt .suggestion-item:nth-child(1 of .suggestion-item)')
		).toHaveText(expect.stringContaining('Write'))
		await browser.keys('Enter')

		await browser.waitUntil(
			() =>
				browser.executeObsidian(
					({ app }, path) => app.vault.getFileByPath(path) !== null,
					today.path
				),
			{ timeoutMsg: "today's note was not created" }
		)
		await browser.waitUntil(
			async () => (await obsidianPage.read(today.path)).includes('- [ ] Write'),
			{ timeoutMsg: 'the task was not planned' }
		)
		const created = await obsidianPage.read(today.path)
		assert.deepStrictEqual(created.split('\n').slice(0, 5), [
			'---',
			'tag_goals:',
			'  - "#work 6h"',
			'  - "#leisure <2h"',
			'---',
		])
	})

	it("colors a tag's goals, and its tasks without a color, from the tag mapping", async function () {
		const saved = await browser.executeObsidian(
			({ plugins }) => plugins.obsidianTaskTimeTracker.settings.tagMappings
		)
		await browser.executeObsidian(async ({ plugins }) => {
			const plugin = plugins.obsidianTaskTimeTracker
			plugin.settings.tagMappings = [
				{ tag: '#work', emoji: '💼', color: 'rgb(18, 52, 86)' },
			]
			await plugin.refreshViews()
		})
		try {
			await writeNote(today.path, [
				'---',
				'tag_goals:',
				'  - "#work 6h"',
				'---',
				'- [ ] Write #work',
				`      [clock::${today.date}T08:00:00--${today.date}T09:00:00]`,
			])
			await openGoals()
			const work = card('#work')
			await expect(work).toHaveAttribute(
				'style',
				expect.stringContaining('--goal-color: rgb(18, 52, 86)')
			)
			await expect(work.$('[role="img"]=💼')).toBeDisplayed()

			await openDailyView('Tracker')
			await expect(
				browser.$('input[type="checkbox"][aria-label="Mark Write done"]')
			).toHaveAttribute(
				'style',
				expect.stringContaining('--task-color: rgb(18, 52, 86)')
			)
		} finally {
			await browser.executeObsidian(async ({ plugins }, values) => {
				const plugin = plugins.obsidianTaskTimeTracker
				plugin.settings.tagMappings = values
				await plugin.refreshViews()
			}, saved)
		}
	})
})
