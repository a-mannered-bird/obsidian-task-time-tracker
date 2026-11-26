import assert from 'node:assert'
import { browser, expect } from '@wdio/globals'
import type { ChainablePromiseElement } from 'webdriverio'
import { obsidianPage } from 'wdio-obsidian-service'
import { resetVault } from './support/vault'

/**
 * The Tags tab of the management modal: tag rename, merge and delete
 * through the real UI on the fixture vault, asserting the exact markdown
 * written and every UI transition on the way (positive, single-element
 * matchers only, for the trace recorder).
 */

const MODAL = '.task-time-tracker-manager-modal'
const TAGS_PANEL = '[role="tabpanel"][aria-label="Tags"]'
const TASKS_PANEL = '[role="tabpanel"][aria-label="Tasks"]'

/** The modal on its Tags tab, reached by the Manage tags command. */
async function openTags() {
	await browser.executeObsidianCommand('obsidian-task-time-tracker:manage-tags')
	const modal = browser.$(MODAL)
	await expect(modal.$('.modal-title')).toHaveText('Manage tasks and tags')
	await expect(modal.$('[role="tab"][aria-selected="true"]')).toHaveText('Tags')
	const panel = modal.$(TAGS_PANEL)
	await expect(panel.$('table')).toBeDisplayed()
	return panel
}

/** The last opened modal, i.e. the one on top of the stack. */
async function topModal() {
	const containers = await browser.$$('.modal-container').getElements()
	return containers[containers.length - 1]!.$('.modal')
}

async function expectModal(title: string) {
	const modal = await topModal()
	await expect(modal.$('.modal-title')).toHaveText(title)
	return modal
}

async function clickButton(scope: ChainablePromiseElement, text: string) {
	const button = scope.$(`button=${text}`)
	await expect(button).toBeEnabled()
	await button.click()
}

/** The exact tags listed, in table order. */
async function expectTags(panel: ChainablePromiseElement, tags: string[]) {
	await expect(panel.$('tbody')).toHaveChildren(tags.length)
	for (const [index, tag] of tags.entries()) {
		await expect(panel.$(`tbody tr:nth-child(${index + 1}) .name`)).toHaveText(
			tag
		)
	}
}

/** A row's Notes count (cells: select, swatch, emoji, tag, tasks, notes…). */
async function expectNotes(
	panel: ChainablePromiseElement,
	row: number,
	notes: string
) {
	await expect(
		panel.$(`tbody tr:nth-child(${row}) td:nth-of-type(6)`)
	).toHaveText(notes)
}

async function waitForChange(path: string, before: string) {
	await browser.waitUntil(
		async () => (await obsidianPage.read(path)) !== before,
		{ timeout: 10000, timeoutMsg: `${path} was not rewritten` }
	)
}

async function tagMappings(): Promise<unknown> {
	return browser.executeObsidian(
		({ plugins }) => plugins.obsidianTaskTimeTracker.settings.tagMappings
	)
}

async function closeModals() {
	for (let i = 0; i < 4; i++) {
		const open = await browser.$$('.modal-container').getElements()
		if (open.length === 0) break
		await browser.keys('Escape')
		await browser.pause(100)
	}
}

describe('tag management', function () {
	beforeEach(async function () {
		await closeModals()
		await resetVault()
		await browser.executeObsidian(async ({ plugins }) => {
			const plugin = plugins.obsidianTaskTimeTracker
			plugin.settings.tagMappings = [{ tag: '#project', emoji: '⭐️' }]
			await plugin.saveSettings()
		})
	})

	after(async function () {
		await closeModals()
	})

	it('renames a tag on every task line', async function () {
		const before = await obsidianPage.read('2026-08-02.md')
		const panel = await openTags()
		// Most used first; the two used in one note each, alphabetically.
		await expectTags(panel, ['#project', '#focus', '#routine'])

		await panel.$('button[aria-label="Rename #focus"]').click()
		const prompt = await expectModal('Rename #focus')
		const input = prompt.$('input[type="text"]')
		await expect(input).toHaveValue('#focus')
		// The hash is optional when typing.
		await input.setValue('deep')
		await expect(input).toHaveValue('deep')
		await clickButton(prompt, 'Rename')

		const confirm = await expectModal('Rename #focus')
		await expect(confirm).toHaveText(
			expect.stringContaining(
				'Rename #focus to #deep on 1 task line and 0 tag goals across 1 daily note.'
			)
		)
		await clickButton(confirm, 'Rename')
		await waitForChange('2026-08-02.md', before)
		await expectTags(panel, ['#project', '#deep', '#routine'])

		assert.strictEqual(
			await obsidianPage.read('2026-08-02.md'),
			before.replace('Deep work #focus', 'Deep work #deep')
		)
	})

	it('merges a tag into an existing one, adding their tag goals', async function () {
		const before = [
			'---',
			'tag_goals:',
			'  - "#focus 1h"',
			'  - "#project 2h"',
			'---',
			'- [ ] Deep work #focus #project',
			'      [clock::2026-08-02T09:00:00--2026-08-02T09:45:00]',
			'',
		].join('\n')
		await obsidianPage.write('2026-08-02.md', before)
		// The preview reads the index: wait for it to hold the goals written.
		await browser.waitUntil(
			() =>
				browser.executeObsidian(({ plugins }) =>
					plugins.obsidianTaskTimeTracker.vaultTasks
						.notes()
						.some((note) => note.tagGoals.length === 2)
				),
			{ timeoutMsg: 'the index did not pick the tag goals up' }
		)
		const panel = await openTags()
		await panel.$('button[aria-label="Rename #focus"]').click()
		const prompt = await expectModal('Rename #focus')
		await prompt.$('input[type="text"]').setValue('#project')
		await clickButton(prompt, 'Rename')

		// Onto an existing tag, the rename is a merge with its ritual.
		const confirm = await expectModal('Rename #focus')
		await expect(confirm).toHaveText(
			expect.stringContaining('Tag goals meet on 1 day')
		)
		const mergeButton = confirm.$('button=Merge')
		await expect(mergeButton).toBeDisabled()
		await confirm.$('input[type="text"]').setValue('#project')
		await expect(mergeButton).toBeEnabled()
		await mergeButton.click()
		await waitForChange('2026-08-02.md', before)
		await expectTags(panel, ['#project', '#routine'])

		// 1h + 2h: both goals are minimums, so their targets add up; the
		// line keeps #project once.
		assert.strictEqual(
			await obsidianPage.read('2026-08-02.md'),
			[
				'---',
				'tag_goals:',
				'  - "#project 3h"',
				'---',
				'- [ ] Deep work #project',
				'      [clock::2026-08-02T09:00:00--2026-08-02T09:45:00]',
				'',
			].join('\n')
		)
	})

	it('merges selected tags into the surviving one, mapping included', async function () {
		const before = await obsidianPage.read('2026-08-01.md')
		const panel = await openTags()
		await panel.$('button[aria-label="Emoji of #routine"]').click()
		const emojiPrompt = await expectModal('Emoji of #routine')
		// In the BMP: ChromeDriver cannot type characters beyond it.
		await emojiPrompt.$('input[type="text"]').setValue('⚽')
		await clickButton(emojiPrompt, 'OK')
		await expect(panel.$('button[aria-label="Emoji of #routine"]')).toHaveText(
			'⚽'
		)

		await panel.$('input[aria-label="Select #focus"]').click()
		await panel.$('input[aria-label="Select #routine"]').click()
		await expect(panel).toHaveText(expect.stringContaining('2 selected'))
		await clickButton(panel, 'Merge…')

		const confirm = await expectModal('Merge 2 tags')
		const mergeButton = confirm.$('button=Merge')
		await expect(mergeButton).toBeDisabled()
		await confirm.$('select').selectByVisibleText('#focus')
		await confirm.$('input[type="text"]').setValue('#focus')
		await expect(mergeButton).toBeEnabled()
		await mergeButton.click()
		await waitForChange('2026-08-01.md', before)
		await expectTags(panel, ['#project', '#focus'])
		// #focus now spans both notes.
		await expectNotes(panel, 2, '2')
		// The absorbed tag's emoji fills the survivor's blank.
		await expect(panel.$('button[aria-label="Emoji of #focus"]')).toHaveText(
			'⚽'
		)

		assert.strictEqual(
			await obsidianPage.read('2026-08-01.md'),
			before.replace('Workout #routine', 'Workout #focus')
		)
		assert.deepStrictEqual(await tagMappings(), [
			{ tag: '#project', emoji: '⭐️' },
			{ tag: '#focus', emoji: '⚽' },
		])
	})

	it('deletes a tag from every note, with its mapping', async function () {
		const before = await obsidianPage.read('2026-08-03.md')
		const panel = await openTags()
		await panel.$('input[aria-label="Select #project"]').click()
		await expect(panel).toHaveText(expect.stringContaining('1 selected'))
		await clickButton(panel, 'Delete…')

		const confirm = await expectModal('Delete #project')
		await expect(confirm).toHaveText(
			expect.stringContaining(
				'Remove #project from 5 task lines and delete 0 tag goals across 3 daily notes.'
			)
		)
		const deleteButton = confirm.$('button=Delete')
		await expect(deleteButton).toBeDisabled()
		await confirm.$('input[type="text"]').setValue('#project')
		await expect(deleteButton).toBeEnabled()
		await deleteButton.click()
		await waitForChange('2026-08-03.md', before)
		await expectTags(panel, ['#focus', '#routine'])

		assert.strictEqual(
			await obsidianPage.read('2026-08-03.md'),
			[
				'- [ ] Task A',
				'      [clock::2026-08-03T09:00:00--2026-08-03T09:30:00]',
				'- [ ] Task B',
				'      [clock::2026-08-03T09:15:00--2026-08-03T09:45:00]',
				'- [ ] Email',
				'',
			].join('\n')
		)
		assert.deepStrictEqual(await tagMappings(), [])
	})

	it("shows a tag's tasks on the Tasks tab", async function () {
		const panel = await openTags()
		await panel.$('button[aria-label="Show the tasks of #project"]').click()

		const modal = browser.$(MODAL)
		await expect(modal.$('[role="tab"][aria-selected="true"]')).toHaveText(
			'Tasks'
		)
		const tasks = modal.$(TASKS_PANEL)
		await expect(tasks.$('input[aria-label="Filter tasks"]')).toHaveValue(
			'#project'
		)
		// Every task with #project on a line, whichever line is the latest.
		await expect(tasks.$('tbody')).toHaveChildren(4)
		for (const [index, name] of [
			'Task A',
			'Task B',
			'Deep work',
			'Deep wok',
		].entries()) {
			await expect(
				tasks.$(`tbody tr:nth-child(${index + 1}) .name`)
			).toHaveText(name)
		}
	})

	it('clears the filters when nothing matches', async function () {
		const panel = await openTags()
		await expectTags(panel, ['#project', '#focus', '#routine'])
		await expect(
			panel.$('tbody tr:nth-child(1) [aria-label="No issues"]')
		).toBeDisplayed()

		const tagFilter = panel.$('input[aria-label="Filter tags"]')
		await tagFilter.setValue('#nothing')
		await expect(tagFilter).toHaveValue('#nothing')
		const tagIssuesOnly = panel.$('button*=Issues only')
		await tagIssuesOnly.click()
		await expect(tagIssuesOnly).toHaveAttribute('aria-pressed', 'true')
		await expect(panel.$('span=No tag matches.')).toBeDisplayed()

		await clickButton(panel, 'Clear filters')
		await expect(tagFilter).toHaveValue('')
		await expect(tagIssuesOnly).toHaveAttribute('aria-pressed', 'false')
		await expectTags(panel, ['#project', '#focus', '#routine'])

		const modal = browser.$(MODAL)
		await modal.$('[role="tab"]=Tasks').click()
		const tasks = modal.$(TASKS_PANEL)
		await expect(tasks.$('table')).toBeDisplayed()
		// "Workout" has no issue in the fixture.
		await expect(
			tasks.$('.//tr[.//*[text()="Workout"]]//*[@aria-label="No issues"]')
		).toBeDisplayed()

		const taskFilter = tasks.$('input[aria-label="Filter tasks"]')
		await taskFilter.setValue('zzz')
		await expect(taskFilter).toHaveValue('zzz')
		const hiddenOnly = tasks.$('button*=Hidden only')
		await hiddenOnly.click()
		await expect(hiddenOnly).toHaveAttribute('aria-pressed', 'true')
		await expect(tasks.$('span=No task matches.')).toBeDisplayed()

		await clickButton(tasks, 'Clear filters')
		await expect(taskFilter).toHaveValue('')
		await expect(hiddenOnly).toHaveAttribute('aria-pressed', 'false')
		await expect(tasks.$('tbody')).toHaveChildren(6)
	})
})
