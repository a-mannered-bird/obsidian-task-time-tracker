import { browser, expect } from '@wdio/globals'
import type { ChainablePromiseElement } from 'webdriverio'
import { obsidianPage } from 'wdio-obsidian-service'

/**
 * Bulk operations driven through the real UI (row menu, confirmations, chip
 * editor) on the fixture vault, asserting the exact markdown written. Every
 * UI transition is asserted too, so a recorded trace shows each state — with
 * positive matchers only: the trace recorder renders `.not` ones as failed.
 */

const MODAL = '.task-time-tracker-manager-modal'

async function openManager() {
	await browser.executeObsidianCommand(
		'obsidian-task-time-tracker:manage-tasks'
	)
	const modal = browser.$(MODAL)
	await expect(modal).toBeDisplayed()
	await expect(modal.$('table')).toBeDisplayed()
	return modal
}

/** The last opened modal, i.e. the one on top of the stack. */
async function topModal() {
	const containers = await browser.$$('.modal-container').getElements()
	return containers[containers.length - 1]!.$('.modal')
}

/** The modal that just opened, checked by its title. */
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

async function pickRowMenuItem(name: string, title: string) {
	await browser.$(`button[aria-label="Actions for ${name}"]`).click()
	const item = browser.$('.menu').$(`.menu-item-title=${title}`)
	await expect(item).toBeDisplayed()
	await item.click()
}

/**
 * The exact task names the manager lists, in table order — the precise,
 * positive way to say what a bulk operation left behind. Single-element
 * matchers only: the trace recorder does not capture element-array ones.
 */
async function expectTaskNames(
	manager: ChainablePromiseElement,
	names: string[]
) {
	await expect(manager.$('tbody')).toHaveChildren(names.length)
	for (const [index, name] of names.entries()) {
		await expect(
			manager.$(`tbody tr:nth-child(${index + 1}) .name`)
		).toHaveText(name)
	}
}

/** Name and total time of a table row (1-based, in table order). */
async function expectRow(
	manager: ChainablePromiseElement,
	row: number,
	name: string,
	total: string
) {
	await expect(manager.$(`tbody tr:nth-child(${row}) .name`)).toHaveText(name)
	// Cells: select, swatch, name, notes, last used, total, menu.
	await expect(
		manager.$(`tbody tr:nth-child(${row}) td:nth-of-type(6)`)
	).toHaveText(total)
}

/** Wait for the bulk run to land in the file. */
async function waitForChange(path: string, before: string) {
	await browser.waitUntil(
		async () => (await obsidianPage.read(path)) !== before,
		{ timeout: 10000, timeoutMsg: `${path} was not rewritten` }
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

describe('bulk operations', function () {
	beforeEach(async function () {
		await closeModals()
		await obsidianPage.resetVault()
	})

	it('renames a task, merging into an existing line of the new name', async function () {
		const before = await obsidianPage.read('2026-08-02.md')
		const manager = await openManager()
		await pickRowMenuItem('Deep wok', 'Rename…')

		const prompt = await expectModal('Rename "Deep wok"')
		const input = prompt.$('input[type="text"]')
		await expect(input).toHaveValue('Deep wok')
		await input.setValue('Deep work')
		await expect(input).toHaveValue('Deep work')
		await clickButton(prompt, 'Rename')

		const confirm = await expectModal('Rename "Deep wok"')
		await expect(confirm).toHaveText(
			expect.stringContaining(
				'Rename "Deep wok" to "Deep work" across 2 daily notes'
			)
		)
		await clickButton(confirm, 'Rename')
		await waitForChange('2026-08-02.md', before)
		// "Deep wok" folded into "Deep work".
		await expectTaskNames(manager, [
			'Email',
			'Task A',
			'Task B',
			'Deep work',
			'Workout',
		])

		expect(await obsidianPage.read('2026-08-02.md')).toBe(
			[
				'- [ ] Deep work #focus',
				'      [clock::2026-08-02T09:00:00--2026-08-02T09:45:00]',
				'      [clock::2026-08-02T10:00:00--2026-08-02T10:20:00]',
				'- [ ] Task A #project',
				'      [clock::2026-08-02T11:00:00--2026-08-02T11:30:00]',
				'- [ ] Task B',
				'      [clock::2026-08-02T11:30:00--2026-08-02T12:00:00]',
				'',
			].join('\n')
		)
	})

	it('merges selected tasks, joining touching and overlapping clocks', async function () {
		const before = await obsidianPage.read('2026-08-03.md')
		const manager = await openManager()
		// 1h each: 30m + 30m on Task A, 30m + 30m on Task B.
		await expectRow(manager, 2, 'Task A', '1h 00m')
		await expectRow(manager, 3, 'Task B', '1h 00m')
		await browser.$('input[aria-label="Select Task A"]').click()
		await browser.$('input[aria-label="Select Task B"]').click()
		await expect(manager).toHaveText(expect.stringContaining('2 selected'))
		await clickButton(manager, 'Merge…')

		const confirm = await expectModal('Merge 2 tasks')
		await expect(confirm).toHaveText(
			expect.stringContaining(
				'Merge "Task A", "Task B" into the surviving name'
			)
		)
		const mergeButton = confirm.$('button=Merge')
		await expect(mergeButton).toBeDisabled()
		await confirm.$('select').selectByVisibleText('Task A')
		await confirm.$('input[type="text"]').setValue('Task A')
		await expect(mergeButton).toBeEnabled()
		await mergeButton.click()
		await waitForChange('2026-08-03.md', before)
		// "Task B" folded into "Task A".
		await expectTaskNames(manager, [
			'Email',
			'Task A',
			'Deep work',
			'Deep wok',
			'Workout',
		])
		// Not 2h: the touching clocks (11:00–11:30 + 11:30–12:00) join into
		// one hour and the overlapping ones (09:00–09:30 + 09:15–09:45) into
		// 45 minutes, so the merged task carries 1h 45m.
		await expectRow(manager, 2, 'Task A', '1h 45m')

		expect(await obsidianPage.read('2026-08-02.md')).toBe(
			[
				'- [ ] Deep work #focus',
				'      [clock::2026-08-02T09:00:00--2026-08-02T09:45:00]',
				'- [ ] Deep wok #project',
				'      [clock::2026-08-02T10:00:00--2026-08-02T10:20:00]',
				'- [ ] Task A #project',
				'      [clock::2026-08-02T11:00:00--2026-08-02T12:00:00]',
				'',
			].join('\n')
		)
		expect(await obsidianPage.read('2026-08-03.md')).toBe(
			[
				'- [ ] Task A #project',
				'      [clock::2026-08-03T09:00:00--2026-08-03T09:45:00]',
				'- [ ] Email',
				'',
			].join('\n')
		)
	})

	it('deletes a task from every note after typing its name', async function () {
		const before = await obsidianPage.read('2026-08-01.md')
		const manager = await openManager()
		await pickRowMenuItem('Email', 'Delete…')

		const confirm = await expectModal('Delete "Email"')
		await expect(confirm).toHaveText(
			expect.stringContaining('Delete "Email" from 2 daily notes')
		)
		// The ritual: the button only enables once the exact name is typed.
		const deleteButton = confirm.$('button=Delete')
		await expect(deleteButton).toBeDisabled()
		await confirm.$('input[type="text"]').setValue('Email')
		await expect(deleteButton).toBeEnabled()
		await deleteButton.click()
		await waitForChange('2026-08-01.md', before)
		await expectTaskNames(manager, [
			'Task A',
			'Task B',
			'Deep work',
			'Deep wok',
			'Workout',
		])

		expect(await obsidianPage.read('2026-08-01.md')).toBe(
			[
				'- [ ] Deep work #project',
				'      [clock::2026-08-01T09:00:00--2026-08-01T10:30:00]',
				'- [x] Workout #routine',
				'      [clock::2026-08-01T07:00:00--2026-08-01T07:45:00]',
				'',
			].join('\n')
		)
		expect(await obsidianPage.read('2026-08-03.md')).toBe(
			[
				'- [ ] Task A #project',
				'      [clock::2026-08-03T09:00:00--2026-08-03T09:30:00]',
				'- [ ] Task B #project',
				'      [clock::2026-08-03T09:15:00--2026-08-03T09:45:00]',
				'',
			].join('\n')
		)
	})

	it('sets the tags of every line through the chip editor', async function () {
		const before = await obsidianPage.read('2026-08-01.md')
		const manager = await openManager()
		await pickRowMenuItem('Deep work', 'Change tags…')

		// Drifting: #project on the 1st note, #focus on the 2nd, so both
		// chips show their coverage.
		const editor = await expectModal('Tags of "Deep work"')
		const chips = editor.$$('.task-time-tracker-chip')
		await expect(chips).toBeElementsArrayOfSize(2)
		await expect(
			editor.$$('.task-time-tracker-chip-coverage')
		).toBeElementsArrayOfSize(2)

		await editor.$('button[aria-label="Remove #project"]').click()
		await expect(editor.$$('.task-time-tracker-chip')).toBeElementsArrayOfSize(
			1
		)

		const input = editor.$('.task-time-tracker-chips-input')
		await input.setValue('deep')
		await browser.keys('Enter')
		await expect(editor.$$('.task-time-tracker-chip')).toBeElementsArrayOfSize(
			2
		)
		await expect(editor).toHaveText(expect.stringContaining('#deep'))
		await clickButton(editor, 'Apply')

		const confirm = await expectModal('Tags of "Deep work"')
		await expect(confirm).toHaveText(
			expect.stringContaining(
				'Set the tags of "Deep work" to "#focus", "#deep"'
			)
		)
		await clickButton(confirm, 'Apply')
		await waitForChange('2026-08-01.md', before)
		await expect(manager.$('table')).toHaveText(
			expect.stringContaining('#deep')
		)

		expect((await obsidianPage.read('2026-08-01.md')).split('\n')[0]).toBe(
			'- [ ] Deep work #focus #deep'
		)
		expect((await obsidianPage.read('2026-08-02.md')).split('\n')[0]).toBe(
			'- [ ] Deep work #focus #deep'
		)
	})
})
