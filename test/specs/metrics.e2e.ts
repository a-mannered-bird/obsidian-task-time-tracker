import assert from 'node:assert'
import { browser, expect } from '@wdio/globals'
import type { ChainablePromiseElement } from 'webdriverio'
import { obsidianPage } from 'wdio-obsidian-service'
import { resetVault } from './support/vault'

/**
 * The Metrics tab of the management modal: metric rename, merge, delete and
 * unit change through the real UI, asserting the exact markdown written and
 * every UI transition on the way (positive, single-element matchers only,
 * for the trace recorder).
 */

const MODAL = '.task-time-tracker-manager-modal'
const METRICS_PANEL = '[role="tabpanel"][aria-label="Metrics"]'

/** The modal on its Metrics tab, reached by the Manage metrics command. */
async function openMetrics() {
	await browser.executeObsidianCommand(
		'obsidian-task-time-tracker:manage-metrics'
	)
	const modal = browser.$(MODAL)
	await expect(modal.$('.modal-title')).toHaveText('Manage tracking data')
	await expect(modal.$('[role="tab"][aria-selected="true"]')).toHaveText(
		'Metrics'
	)
	const panel = modal.$(METRICS_PANEL)
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

/**
 * The exact metrics listed, in table order (cells: select, swatch, emoji,
 * metric…); the time goals' row always comes first.
 */
async function expectMetrics(panel: ChainablePromiseElement, names: string[]) {
	const rows = ['Time goals', ...names]
	await expect(panel.$('tbody')).toHaveChildren(rows.length)
	for (const [index, name] of rows.entries()) {
		await expect(
			panel.$(`tbody tr:nth-child(${index + 1}) td:nth-of-type(4)`)
		).toHaveText(name)
	}
}

/** A row's Total cell (…, tasks, notes, last used, total, issues). */
async function expectTotal(
	panel: ChainablePromiseElement,
	row: number,
	total: string
) {
	await expect(
		panel.$(`tbody tr:nth-child(${row}) td:nth-of-type(10)`)
	).toHaveText(total)
}

/** Write a note and wait for the index, which the previews read, to hold it. */
async function writeNote(path: string, lines: string[]) {
	const content = [...lines, ''].join('\n')
	await obsidianPage.write(path, content)
	await browser.waitUntil(
		() =>
			browser.executeObsidian(
				({ plugins }, path, goals) =>
					plugins.obsidianTaskTimeTracker.vaultTasks
						.notes()
						.some(
							(note) =>
								note.path === path &&
								note.tasks.reduce((sum, task) => sum + task.goals.length, 0) ===
									goals
						),
				path,
				lines.filter((line) => line.includes('[goal::')).length
			),
		{ timeoutMsg: `the index did not pick the goals of ${path} up` }
	)
	return content
}

async function waitForChange(path: string, before: string) {
	await browser.waitUntil(
		async () => (await obsidianPage.read(path)) !== before,
		{ timeout: 10000, timeoutMsg: `${path} was not rewritten` }
	)
}

async function metricSettings(): Promise<unknown> {
	return browser.executeObsidian(
		({ plugins }) => plugins.obsidianTaskTimeTracker.settings.metricSettings
	)
}

async function setMetricSettings(values: Record<string, { emoji?: string }>) {
	await browser.executeObsidian(async ({ plugins }, values) => {
		const plugin = plugins.obsidianTaskTimeTracker
		plugin.settings.metricSettings = values
		await plugin.saveSettings()
	}, values)
}

async function closeModals() {
	for (let i = 0; i < 4; i++) {
		const open = await browser.$$('.modal-container').getElements()
		if (open.length === 0) break
		await browser.keys('Escape')
		await browser.pause(100)
	}
}

describe('metric management', function () {
	beforeEach(async function () {
		await closeModals()
		await resetVault()
		await setMetricSettings({})
	})

	after(async function () {
		await closeModals()
		await setMetricSettings({})
	})

	it('renames a metric on every goal line', async function () {
		const before = await writeNote('2026-08-02.md', [
			'- [ ] Run',
			'      [goal::distnce 3/5 km]',
			'      [clock::2026-08-02T07:00:00--2026-08-02T07:30:00]',
		])
		const panel = await openMetrics()
		await expectMetrics(panel, ['distnce'])

		await panel.$('button[aria-label="Rename distnce"]').click()
		const prompt = await expectModal('Rename distnce')
		const input = prompt.$('input[type="text"]')
		await expect(input).toHaveValue('distnce')
		await input.setValue('distance')
		await expect(input).toHaveValue('distance')
		await clickButton(prompt, 'Rename')

		// A new name: the light confirmation, no name to type.
		const confirm = await expectModal('Rename distnce')
		await expect(confirm).toHaveText(
			expect.stringContaining(
				'Rename "distnce" to "distance" on 1 goal line across 1 daily note.'
			)
		)
		await clickButton(confirm, 'Rename')
		await waitForChange('2026-08-02.md', before)
		await expectMetrics(panel, ['distance'])

		assert.strictEqual(
			await obsidianPage.read('2026-08-02.md'),
			before.replace('[goal::distnce 3/5 km]', '[goal::distance 3/5 km]')
		)
	})

	it('merges selected metrics, combining the goals of a task line', async function () {
		const before = await writeNote('2026-08-02.md', [
			'- [ ] Run',
			'      [goal::km 3/5 km]',
			'      [goal::distance 5/10 km]',
			'- [ ] Bike',
			'      [goal::km 20 km]',
		])
		const panel = await openMetrics()
		// One note each: alphabetical.
		await expectMetrics(panel, ['distance', 'km'])

		await panel.$('input[aria-label="Select km"]').click()
		await panel.$('input[aria-label="Select distance"]').click()
		await expect(panel).toHaveText(expect.stringContaining('2 selected'))
		await clickButton(panel, 'Merge…')

		const confirm = await expectModal('Merge 2 metrics')
		await expect(confirm).toHaveText(
			expect.stringContaining('2 goals will be combined on 1 day')
		)
		const mergeButton = confirm.$('button=Merge')
		await expect(mergeButton).toBeDisabled()
		await confirm.$('select').selectByVisibleText('distance')
		await confirm.$('input[type="text"]').setValue('distance')
		await expect(mergeButton).toBeEnabled()
		await mergeButton.click()
		await waitForChange('2026-08-02.md', before)
		await expectMetrics(panel, ['distance'])
		// Run's two lines sum to 8/15 km, Bike adds its 20: 8 + 20.
		await expectTotal(panel, 2, '28 km')

		assert.strictEqual(
			await obsidianPage.read('2026-08-02.md'),
			[
				'- [ ] Run',
				'      [goal::distance 8/15 km]',
				'- [ ] Bike',
				'      [goal::distance 20 km]',
				'',
			].join('\n')
		)
	})

	it('deletes a metric from every note, then one only the settings know', async function () {
		await setMetricSettings({ km: { emoji: '🏃' }, steps: { emoji: '👟' } })
		const before = await writeNote('2026-08-02.md', [
			'- [ ] Run',
			'      [goal::km 3/5 km]',
			'      [goal::distance 5/10 km]',
		])
		const panel = await openMetrics()
		// The one no note uses comes last, with 0 notes.
		await expectMetrics(panel, ['distance', 'km', 'steps'])

		await panel.$('input[aria-label="Select km"]').click()
		await expect(panel).toHaveText(expect.stringContaining('1 selected'))
		await clickButton(panel, 'Delete…')
		const confirm = await expectModal('Delete km')
		await expect(confirm).toHaveText(
			expect.stringContaining(
				'Delete 1 goal line of "km" across 1 daily note, results included'
			)
		)
		const deleteButton = confirm.$('button=Delete')
		await expect(deleteButton).toBeDisabled()
		await confirm.$('input[type="text"]').setValue('km')
		await expect(deleteButton).toBeEnabled()
		await deleteButton.click()
		await waitForChange('2026-08-02.md', before)
		await expectMetrics(panel, ['distance', 'steps'])

		assert.strictEqual(
			await obsidianPage.read('2026-08-02.md'),
			['- [ ] Run', '      [goal::distance 5/10 km]', ''].join('\n')
		)

		// No goal line uses it: a light confirmation, the settings only.
		await panel.$('input[aria-label="Select steps"]').click()
		await expect(panel).toHaveText(expect.stringContaining('1 selected'))
		await clickButton(panel, 'Delete…')
		const settingsOnly = await expectModal('Delete steps')
		await expect(settingsOnly).toHaveText(
			expect.stringContaining(
				'No goal line uses "steps": only its settings are deleted.'
			)
		)
		await clickButton(settingsOnly, 'Delete')
		await expectMetrics(panel, ['distance'])
		assert.deepStrictEqual(await metricSettings(), {})
	})

	it('changes a unit without converting, combining the lines it makes alike', async function () {
		const before = await writeNote('2026-08-02.md', [
			'- [ ] Swim',
			'      [goal::laps 10/20 lengths]',
			'      [goal::laps 4/10 laps]',
		])
		const panel = await openMetrics()
		await expectMetrics(panel, ['laps'])

		await panel.$('button[aria-label="Change unit of laps"]').click()
		const prompt = await expectModal('Change unit of laps')
		const input = prompt.$('input[type="text"]')
		// The unit of the note's first line.
		await expect(input).toHaveValue('lengths')
		await input.setValue('laps')
		await expect(input).toHaveValue('laps')
		await clickButton(prompt, 'Next')

		const confirm = await expectModal('Change unit of laps')
		await expect(confirm).toHaveText(
			expect.stringContaining(
				'Change the unit of "laps" from lengths to laps on 2 goal lines across 1 daily note. Values are not converted.'
			)
		)
		await clickButton(confirm, 'Change unit')
		await waitForChange('2026-08-02.md', before)
		// One line left, the one already in laps: 10 + 4, 20 + 10.
		await expectTotal(panel, 2, '14 laps')

		assert.strictEqual(
			await obsidianPage.read('2026-08-02.md'),
			['- [ ] Swim', '      [goal::laps 14/30 laps]', ''].join('\n')
		)
	})
})
