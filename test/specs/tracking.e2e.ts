import assert from 'node:assert'
import { browser, expect } from '@wdio/globals'
import { obsidianPage } from 'wdio-obsidian-service'
import { clickNoticeButton } from './support/notices'
import { resetVault } from './support/vault'

/**
 * Tracking commands run on a note that is open in an editor, where what the
 * user sees can be ahead of the file on disk.
 */

const NOTE = '2026-08-03.md'

describe('tracking commands', function () {
	beforeEach(async function () {
		await resetVault()
	})

	it('offer the tasks as the editor shows them, before the note is saved', async function () {
		await obsidianPage.openFile(NOTE)
		const before = await obsidianPage.read(NOTE)
		// Select the end of Task B's clock, then delete it with a real key
		// press: Task B is now running in the editor, while Obsidian only
		// writes the change to disk two seconds later.
		await browser.executeObsidian(({ app, obsidian }) => {
			const editor = app.workspace.getActiveViewOfType(
				obsidian.MarkdownView
			)?.editor
			const line = editor?.getLine(3) ?? ''
			editor?.focus()
			editor?.setSelection(
				{ line: 3, ch: line.indexOf('--') },
				{ line: 3, ch: line.indexOf(']') }
			)
		})
		await browser.keys('Backspace')

		await browser.executeObsidianCommand(
			'obsidian-task-time-tracker:toggle-task'
		)
		const picker = browser.$('.prompt')
		await expect(picker).toBeDisplayed()
		// Running tasks come first, with a label.
		const first = picker.$('.suggestion-item:nth-child(1 of .suggestion-item)')
		await expect(first).toHaveText(expect.stringContaining('Task B'))
		await expect(first.$('span=running')).toBeDisplayed()
		await browser.keys('Escape')

		// The pending change was saved, so the command's own write cannot
		// discard it.
		expect(await obsidianPage.read(NOTE)).toBe(
			before.replace('--2026-08-03T09:45:00', '')
		)
	})

	it('see a toggle undone in the editor right away', async function () {
		await obsidianPage.openFile(NOTE)
		const before = await obsidianPage.read(NOTE)
		await browser.executeObsidianCommand(
			'obsidian-task-time-tracker:toggle-task'
		)
		const picker = browser.$('.prompt')
		await expect(picker).toBeDisplayed()
		await browser.keys([...'Email'])
		await expect(
			picker.$('.suggestion-item:nth-child(1 of .suggestion-item)')
		).toHaveText('Email')
		await browser.keys('Enter')
		await browser.waitUntil(
			async () => (await obsidianPage.read(NOTE)) !== before
		)

		// Undo the toggle in the editor, then toggle again at once.
		await browser.waitUntil(() =>
			browser.executeObsidian(({ app, obsidian }, content) => {
				const editor = app.workspace.getActiveViewOfType(
					obsidian.MarkdownView
				)?.editor
				if (!editor || editor.getValue() === content) return false
				editor.focus()
				editor.undo()
				return true
			}, before)
		)
		await browser.executeObsidianCommand(
			'obsidian-task-time-tracker:toggle-task'
		)
		const reopened = browser.$('.prompt')
		await expect(reopened).toBeDisplayed()
		// No task runs any more, so the most recently stopped one leads; a
		// running Email would come first with an hourglass.
		await expect(
			reopened.$('.suggestion-item:nth-child(1 of .suggestion-item)')
		).toHaveText('⭐️ Task B')
		await browser.keys('Escape')
		expect(await obsidianPage.read(NOTE)).toBe(before)
	})

	it('offer to restore a clock that an outside change removed', async function () {
		await obsidianPage.openFile(NOTE)
		const before = await obsidianPage.read(NOTE)
		// The task manager scans every daily note, so the plugin knows what
		// the note held before the change.
		await browser.executeObsidianCommand(
			'obsidian-task-time-tracker:manage-tasks'
		)
		await expect(
			browser.$('.task-time-tracker-manager-modal table')
		).toBeDisplayed()
		await browser.keys('Escape')

		// A sync reconciling two versions badly: Task A's clock is gone.
		const withoutClock = before
			.split('\n')
			.filter((line) => !line.includes('2026-08-03T09:00:00'))
			.join('\n')
		await browser.executeObsidian(
			({ app }, path, content) => app.vault.adapter.write(path, content),
			NOTE,
			withoutClock
		)

		const notice = browser.$('.notice*=disappeared')
		await expect(notice).toHaveText(
			expect.stringContaining('"Task A" 09:00–09:30')
		)
		await clickNoticeButton(notice, 'Restore')
		await expect(browser.$('.notice=Clock restored.')).toBeDisplayed()
		expect(await obsidianPage.read(NOTE)).toBe(before)
	})

	it('redo the toggle when the note changes while the picker is open', async function () {
		await obsidianPage.openFile(NOTE)
		const before = await obsidianPage.read(NOTE)
		await browser.executeObsidianCommand(
			'obsidian-task-time-tracker:toggle-task'
		)
		const picker = browser.$('.prompt')
		await expect(picker).toBeDisplayed()

		// What a sync does while the user is choosing: another device's
		// version of the note, with one more task, lands on disk.
		const synced = [
			before.trimEnd(),
			'- [ ] Lunch',
			'      [clock::2026-08-03T12:00:00--2026-08-03T12:30:00]',
		].join('\n')
		await browser.executeObsidian(
			({ app }, path, content) => app.vault.adapter.write(path, content),
			NOTE,
			synced
		)

		await browser.keys([...'Email'])
		await expect(
			picker.$('.suggestion-item:nth-child(1 of .suggestion-item)')
		).toHaveText('Email')
		await browser.keys('Enter')

		// The toggle lands on the synced note: Lunch is kept and Email gets
		// its running clock, started now.
		await browser.waitUntil(
			async () => (await obsidianPage.read(NOTE)) !== synced
		)
		const lines = (await obsidianPage.read(NOTE)).split('\n')
		expect(lines.slice(0, 5)).toEqual(before.trimEnd().split('\n'))
		expect(lines[5]).toMatch(/^ {6}\[clock::\d{4}-\d\d-\d\dT[\d:]{8}\]$/)
		expect(lines.slice(6)).toEqual([
			'- [ ] Lunch',
			'      [clock::2026-08-03T12:00:00--2026-08-03T12:30:00]',
		])

		// The vault reset before the next test removes the clock added here,
		// which is what the plugin watches for: start that test from a note
		// the plugin knows nothing about.
		await browser.executeObsidian(({ plugins }, path) => {
			const { lostClocks } = plugins.obsidianTaskTimeTracker
			lostClocks.forget(path)
			lostClocks.acknowledge(path, '')
		}, NOTE)
	})

	it('follow the note in the open picker and act on what it shows', async function () {
		await obsidianPage.openFile(NOTE)
		const before = await obsidianPage.read(NOTE)
		await browser.executeObsidianCommand(
			'obsidian-task-time-tracker:toggle-task'
		)
		const picker = browser.$('.prompt')
		await expect(picker).toBeDisplayed()
		// Counted among the rows only: group headings sit between them.
		const row = (n: number) =>
			picker.$(`.suggestion-item:nth-child(${n} of .suggestion-item)`)
		// Queried anew each time: a kept reference would stay on the row that
		// was highlighted when first found.
		const highlighted = () => picker.$('.suggestion-item.is-selected')
		await expect(row(1)).toHaveText('⭐️ Task B')
		await expect(row(3)).toHaveText('Email')
		await expect(highlighted()).toHaveText('⭐️ Task B')

		// Another device starts Email while the picker is open.
		const started = before.replace(
			'- [ ] Email',
			'- [ ] Email\n      [clock::2026-08-03T10:00:00]'
		)
		await browser.executeObsidian(
			({ app }, path, content) => app.vault.adapter.write(path, content),
			NOTE,
			started
		)

		// The picker shows it running, first, without being reopened; the
		// highlight stays on the task it was on, so Enter still means it.
		await expect(row(1)).toHaveText(expect.stringContaining('Email'))
		await expect(row(2)).toHaveText('⭐️ Task B')
		await expect(highlighted()).toHaveText('⭐️ Task B')
		await browser.keys('ArrowUp')
		await expect(highlighted()).toHaveText(expect.stringContaining('Email'))
		await browser.keys('Enter')

		// Picked as running, so the toggle stops the clock the other device
		// started instead of giving up on a stale pick.
		await expect(browser.$('.notice*=toggled off')).toBeDisplayed()
		const lines = (await obsidianPage.read(NOTE)).split('\n')
		assert.match(
			lines[5] ?? '',
			/^ {6}\[clock::2026-08-03T10:00:00--\d{4}-\d\d-\d\dT[\d:]{8}\]$/
		)
		assert.deepStrictEqual(lines.slice(0, 5), before.trimEnd().split('\n'))

		// The vault reset removes the clock: see the previous test.
		await browser.executeObsidian(({ plugins }, path) => {
			const { lostClocks } = plugins.obsidianTaskTimeTracker
			lostClocks.forget(path)
			lostClocks.acknowledge(path, '')
		}, NOTE)
	})

	it('groups the picker rows, and plans a typed task from its own command', async function () {
		await obsidianPage.openFile(NOTE)
		const before = await obsidianPage.read(NOTE)
		await browser.executeObsidianCommand(
			'obsidian-task-time-tracker:toggle-task'
		)
		const picker = browser.$('.prompt')
		await expect(picker).toBeDisplayed()
		// The note's tasks sit under its day, the vault's under Other notes.
		await expect(picker.$('div=August 3, 2026')).toBeDisplayed()
		await expect(picker.$('div=Other notes')).toBeDisplayed()
		await browser.keys('Escape')

		await browser.executeObsidianCommand('obsidian-task-time-tracker:plan-task')
		const planner = browser.$('.prompt')
		await expect(planner).toBeDisplayed()
		await expect(planner.$('input')).toHaveAttribute(
			'placeholder',
			'Which task to plan?'
		)
		await browser.keys([...'Lunch break'])
		await expect(planner.$('input')).toHaveValue('Lunch break')
		await expect(planner.$('.suggestion-item.is-selected')).toHaveText(
			expect.stringContaining('➕ Create "Lunch break"')
		)
		await browser.keys('Enter')

		// Added to the plan, not started: no clock line under it.
		await browser.waitUntil(
			async () => (await obsidianPage.read(NOTE)) !== before
		)
		assert.strictEqual(
			await obsidianPage.read(NOTE),
			`${before.trimEnd()}\n- [ ] Lunch break\n`
		)
	})
})
