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

	it('remembers a dismissed warning across reopenings', async function () {
		await browser.executeObsidianCommand(
			'obsidian-task-time-tracker:manage-tasks'
		)
		const modal = browser.$('.task-time-tracker-manager-modal')
		// Both "Deep work" and "Task B" drift; dismiss only Deep work's.
		const driftOf = (name: string) =>
			modal.$(
				`//tr[.//button[@aria-label="Rename ${name}"]]//button[@aria-label="Tags differ between notes: 1"]`
			)
		const issuesOf = (name: string) =>
			modal.$(
				`//tr[.//button[@aria-label="Rename ${name}"]]//td[contains(@class, "issues-cell")]`
			)
		// Deep work carries a similar-name warning and the tag drift.
		await expect(issuesOf('Deep work')).toHaveChildren(2)
		await driftOf('Deep work').click()
		const ignore = browser.$('.menu').$('.menu-item-title=Ignore this warning')
		await expect(ignore).toBeDisplayed()
		await ignore.click()
		await expect(issuesOf('Deep work')).toHaveChildren(1)
		await expect(driftOf('Task B')).toBeDisplayed()

		// Persisted: a fresh open of the manager still hides it.
		await browser.keys('Escape')
		await browser.executeObsidianCommand(
			'obsidian-task-time-tracker:manage-tasks'
		)
		const reopened = browser.$('.task-time-tracker-manager-modal')
		await expect(reopened.$('table')).toBeDisplayed()
		await expect(
			reopened.$(
				'//tr[.//button[@aria-label="Rename Task B"]]//button[@aria-label="Tags differ between notes: 1"]'
			)
		).toBeDisplayed()
		const dismissed = await browser.executeObsidian(
			({ plugins }) => plugins.obsidianTaskTimeTracker.settings.dismissedIssues
		)
		expect(dismissed).toHaveLength(1)

		// Leave the sandbox settings as found for the other tests.
		await browser.executeObsidian(async ({ plugins }) => {
			plugins.obsidianTaskTimeTracker.settings.dismissedIssues = []
			await plugins.obsidianTaskTimeTracker.saveSettings()
		})
		await browser.keys('Escape')
	})
})
