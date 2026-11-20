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

		await expect(browser.$('[role="list"][aria-label="Goals"]')).toHaveChildren(
			3
		)
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
		await expect(browser.$('[role="list"][aria-label="Goals"]')).toHaveChildren(
			1
		)

		await clickNoticeButton(noticeWith('Deleted the goal'), 'Undo')
		await browser.waitUntil(
			async () => (await obsidianPage.read(today.path)) === content,
			{ timeoutMsg: 'the goal did not come back' }
		)
		await expect(browser.$('[role="list"][aria-label="Goals"]')).toHaveChildren(
			2
		)
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

		// Run has a time goal already: only its distance is offered, next to
		// Anki's cards and the Add goal card.
		await expect(
			browser.$('[role="list"][aria-label="Suggestions and new goals"]')
		).toHaveChildren(3)
		await expect(
			browser.$('[role="listitem"][aria-label="Suggested Run · distance"]')
		).toBeDisplayed()
		const suggested = browser.$(
			'[role="listitem"][aria-label="Suggested Anki · cards"]'
		)
		await expect(suggested).toHaveText(expect.stringContaining('/ 200'))
		await suggested.$('button=Add to today').click()

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
		await expect(browser.$('[role="list"][aria-label="Goals"]')).toHaveChildren(
			2
		)
		await expect(
			browser.$('[role="list"][aria-label="Suggestions and new goals"]')
		).toHaveChildren(2)
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

	it('reminds of the targets without a result when the day ends', async function () {
		const content = await writeNote(today.path, [
			'---',
			`day_start: ${today.date}T08:00:00`,
			'---',
			'- [ ] Run',
			'      [goal::distance /10 km]',
			`      [clock::${today.date}T07:00:00--${today.date}T07:50:00]`,
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

		// Nothing to delete: no confirmation, the day ends with a reminder.
		await waitForChange(content)
		await expect(noticeWith('No result for: Run · distance.')).toBeDisplayed()
	})
})
