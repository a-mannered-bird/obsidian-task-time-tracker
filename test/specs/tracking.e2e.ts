import { browser, expect } from '@wdio/globals'
import { obsidianPage } from 'wdio-obsidian-service'

/**
 * Tracking commands run on a note that is open in an editor, where what the
 * user sees can be ahead of the file on disk.
 */

const NOTE = '2026-08-03.md'

describe('tracking commands', function () {
	beforeEach(async function () {
		await obsidianPage.resetVault()
	})

	it('offer the tasks as the editor shows them, before the note is saved', async function () {
		await obsidianPage.openFile(NOTE)
		const edited = [
			'- [ ] Task A #project',
			'      [clock::2026-08-03T09:00:00--2026-08-03T09:30:00]',
			'- [ ] Task B #project',
			'      [clock::2026-08-03T09:15:00--2026-08-03T09:45:00]',
			'- [ ] Email',
			'      [clock::2026-08-03T10:00:00]',
		].join('\n')
		// An editor change is only written to disk two seconds later; the
		// command below runs inside that window.
		await browser.executeObsidian(({ app, obsidian }, content) => {
			app.workspace
				.getActiveViewOfType(obsidian.MarkdownView)
				?.editor.setValue(content)
		}, edited)

		await browser.executeObsidianCommand(
			'obsidian-task-time-tracker:toggle-task'
		)
		const picker = browser.$('.prompt')
		await expect(picker).toBeDisplayed()
		// Running tasks come first with the hourglass: Email only runs in the
		// editor, its clock is not in the file the vault had on disk.
		await expect(picker.$('.suggestion-item:nth-child(1)')).toHaveText(
			'⏳ Email'
		)
		await browser.keys('Escape')

		// The pending change was saved, so the command's own write cannot
		// discard it.
		expect(await obsidianPage.read(NOTE)).toBe(edited)
	})
})
