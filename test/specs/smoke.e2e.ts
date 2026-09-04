import { browser, expect } from '@wdio/globals'

describe('task time tracker', function () {
	it('loads the plugin in the fixture vault', async function () {
		const loaded = await browser.executeObsidian(({ plugins }) =>
			Boolean(plugins.obsidianTaskTimeTracker)
		)
		expect(loaded).toBe(true)
	})

	it('opens the task manager listing the vault tasks', async function () {
		await browser.executeObsidianCommand(
			'obsidian-task-time-tracker:manage-tasks'
		)
		const modal = browser.$('.task-time-tracker-manager-modal')
		await expect(modal).toExist()
		// The index aggregates all fixture notes; spot-check one task from
		// each note and the note counts column of the most used one.
		const table = modal.$('table')
		await expect(table).toHaveText(expect.stringContaining('Deep work'))
		await expect(table).toHaveText(expect.stringContaining('Task A'))
		await expect(table).toHaveText(expect.stringContaining('Workout'))
		await browser.keys('Escape')
	})

	it('flags the fixture problems in the issues column', async function () {
		await browser.executeObsidianCommand(
			'obsidian-task-time-tracker:manage-tasks'
		)
		const modal = browser.$('.task-time-tracker-manager-modal')
		await expect(modal.$('table')).toBeDisplayed()
		// "Deep wok" is a typo of "Deep work", whose tags also drift.
		await expect(
			modal.$('button[aria-label="Name close to another task: 1"]')
		).toBeDisplayed()
		await expect(
			modal.$('button[aria-label="Tags differ between notes: 1"]')
		).toBeDisplayed()
		await modal.$('button=Issues only').click()
		await expect(modal.$('tbody')).toHaveChildren(4)
		await browser.keys('Escape')
	})
})
