import assert from 'node:assert'
import { browser, expect } from '@wdio/globals'
import type { ChainablePromiseElement } from 'webdriverio'
import { obsidianPage } from 'wdio-obsidian-service'
import { resetVault } from './support/vault'

/** A note holding a `task-stats` block over the fixture's 2026-08-03. */
const STATS_NOTE = 'Stats.md'

/**
 * A note with a `task-stats` block. The heading keeps the cursor off the
 * block, which Live Preview would otherwise show as source.
 */
const statsNote = (options: string[]) =>
	['# Stats', '', '```task-stats', ...options, '```', ''].join('\n')

const clockedTaskA = (day: string, end: string) =>
	[
		'- [ ] Task A #project',
		`      [clock::${day}T09:00:00--${day}T${end}:00]`,
		'',
	].join('\n')

/** One `toHaveText` per cell: the name cell's swatch breaks the row's text. */
async function expectRow(row: ChainablePromiseElement, cells: string[]) {
	await expect(row).toHaveChildren(cells.length)
	for (const [i, text] of cells.entries()) {
		await expect(row.$(`td:nth-child(${i + 1})`)).toHaveText(text)
	}
}

describe('task-stats block', function () {
	beforeEach(async function () {
		await resetVault()
	})

	it('counts concurrent tasks once in the covered time and shows their overlap', async function () {
		await obsidianPage.write(
			STATS_NOTE,
			statsNote([
				'range: 2026-08-03..2026-08-03',
				'metrics: [total]',
				'compare: none',
			])
		)
		await obsidianPage.openFile(STATS_NOTE)
		const block = browser.$('.block-language-task-stats')
		const table = block.$('table')
		await expect(table).toBeDisplayed()

		// Task A ran 09:00–09:30 and Task B 09:15–09:45: 1h counted, but
		// 09:15–09:30 counted twice, so 45m covered and 15m concurrent.
		await expect(block.$('div*=Covered')).toHaveText(
			'⏱ Covered 45m · +15m concurrent'
		)

		await expect(table.$('thead tr')).toHaveChildren(4)
		await expect(table.$('thead tr th:nth-child(4)')).toHaveText('Overlap')
		await expect(table.$('tbody')).toHaveChildren(2)
		// Each task shared 15m of its 30m: 50% overlap; each is 30m of the
		// 45m covered: 67% share.
		await expectRow(table.$('tbody tr:nth-child(1)'), [
			'Task A',
			'30m',
			'67%',
			'50%',
		])
		await expectRow(table.$('tbody tr:nth-child(2)'), [
			'Task B',
			'30m',
			'67%',
			'50%',
		])

		await expect(table.$('tfoot')).toHaveChildren(3)
		await expect(table.$('tfoot tr:nth-child(1)')).toHaveText(
			'Rows 1h 00m 133%'
		)
		await expect(table.$('tfoot tr:nth-child(2)')).toHaveText(
			'Concurrent − 15m'
		)
		await expect(table.$('tfoot tr:nth-child(3)')).toHaveText(
			'Covered 45m 100%'
		)

		await table.$('tbody tr:nth-child(1) td:nth-child(4) span').moveTo()
		const tooltip = browser.$('.tooltip')
		await expect(tooltip).toBeDisplayed()
		await expect(tooltip).toHaveText(
			'Task A · 15m of 30m shared (50%)\nwith Task B · 15m'
		)
	})

	it('compares the week with the previous one and the usual level of weeks with logged time', async function () {
		// Weeks before the fixture's week of 2026-08-03 (Monday): the week of
		// 07-27 holds the fixture's 08-01 and 08-02, 07-13's has a note but no
		// clock, so the usual level skips it and reaches back to 06-29's.
		await obsidianPage.write(
			'2026-07-21.md',
			clockedTaskA('2026-07-21', '10:00')
		)
		await obsidianPage.write('2026-07-14.md', '- [ ] Task A #project\n')
		await obsidianPage.write(
			'2026-07-07.md',
			clockedTaskA('2026-07-07', '09:30')
		)
		await obsidianPage.write(
			'2026-06-30.md',
			clockedTaskA('2026-06-30', '10:00')
		)
		await obsidianPage.write(
			STATS_NOTE,
			statsNote(['range: 2026-08-03..2026-08-09', 'metrics: [total]'])
		)
		await obsidianPage.openFile(STATS_NOTE)
		const block = browser.$('.block-language-task-stats')
		const table = block.$('table')
		await expect(table).toBeDisplayed()

		// Covered per week, latest first: 4h 50m (08-01: 2h 45m, 08-02:
		// 2h 05m), 1h, 30m, 1h: usual 1h 50m, so 45m is 1h 05m under it.
		await expect(block.$('div*=Covered')).toHaveText(
			'⏱ Covered 45m · +15m concurrent · ▼ 1h 05m vs usual'
		)
		await expect(table.$('thead tr')).toHaveChildren(5)
		await expect(table.$('thead tr th:nth-child(5)')).toHaveText('Trend')
		// Task A ran 30m, 1h, 30m and 1h in the four logged weeks: usual 45m.
		await expectRow(table.$('tbody tr:nth-child(1)'), [
			'Task A',
			'30m',
			'67%',
			'50%',
			'▼ 15m · −33%',
		])
		await expect(table.$('tfoot tr:nth-child(3)')).toHaveText(
			'Covered 45m 100% ▼ 1h 05m · −59%'
		)

		await table.$('tbody tr:nth-child(1) td:nth-child(5) span').moveTo()
		const tooltip = browser.$('.tooltip')
		await expect(tooltip).toBeDisplayed()
		await expect(tooltip).toHaveText(
			[
				'Task A',
				'This period · 30m',
				'Previous · 30m · No change',
				'Usual · 45m · ▼ 15m · −33% (average of 4 periods of 7 days)',
			].join('\n')
		)
	})

	it("shows the goals' table, the time goal's progress and the trends their direction calls good", async function () {
		const run = (day: string, end: string, goals: string[]) =>
			[
				'- [x] Run',
				...goals.map((goal) => `      [goal::${goal}]`),
				`      [clock::${day}T07:00:00--${day}T${end}:00]`,
				'',
			].join('\n')
		await obsidianPage.write(
			'2026-07-25.md',
			run('2026-07-25', '07:15', ['1h', 'distance 6/10 km'])
		)
		await obsidianPage.write(
			'2026-07-27.md',
			run('2026-07-27', '08:00', ['1h', 'distance 8/10 km'])
		)
		await obsidianPage.write(
			'2026-07-28.md',
			run('2026-07-28', '07:30', ['1h', 'distance 10/10 km'])
		)
		await obsidianPage.write(
			STATS_NOTE,
			statsNote([
				'range: 2026-07-27..2026-07-28',
				'metrics: [total, goals]',
				'compare: previous',
			])
		)
		await obsidianPage.openFile(STATS_NOTE)
		const block = browser.$('.block-language-task-stats')
		await expect(block.$('h4=🎯 Goals')).toBeDisplayed()
		const [main, goals] = await block.$$('table').getElements()
		assert.ok(main && goals)

		// Run ran 1h and 30m against 1h each day: 1h 30m of 2h 00m, 75%.
		// The previous two days hold 15m: a rise its "at least" goal calls
		// good.
		// One task, no overlap column: Trend is the fourth.
		await expect(main.$('thead tr th:nth-child(4)')).toHaveText('Trend')
		await expectRow(main.$('tbody tr:nth-child(1)'), [
			'Run',
			'1h 30m · ⏱ 75%',
			'100%',
			'▲ 1h 15m · +500%',
		])
		await expect(
			main.$('tbody tr:nth-child(1) td:nth-child(4) span')
		).toHaveElementClass('is-good')

		await expect(goals.$('tbody')).toHaveChildren(2)
		// Time: met on the 27th (1h), missed on the 28th (30m).
		await expectRow(goals.$('tbody tr:nth-child(1)'), [
			'Run · time',
			'1h 30m / 2h 00m',
			'75%',
			'1 / 2',
			'',
			'▲ 1h 15m · +500%',
		])
		// Distance adds up: 8 + 10 of 10 + 10; the previous days held 6.
		await expectRow(goals.$('tbody tr:nth-child(2)'), [
			'Run · distance',
			'18 / 20 km',
			'90%',
			'1 / 2',
			'',
			'▲ 12 km · +200%',
		])
		await expect(goals.$('tbody tr:nth-child(2) [role="img"]')).toHaveAttribute(
			'aria-label',
			'1 of 2 met'
		)
	})
})
