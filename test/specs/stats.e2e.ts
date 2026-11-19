import { browser, expect } from '@wdio/globals'
import type { ChainablePromiseElement } from 'webdriverio'
import { obsidianPage } from 'wdio-obsidian-service'
import { resetVault } from './support/vault'

/** A note holding a `task-stats` block over the fixture's 2026-08-03. */
const STATS_NOTE = 'Stats.md'

// The heading keeps the cursor off the block, which Live Preview would
// otherwise show as source.
const NOTE = [
	'# Stats',
	'',
	'```task-stats',
	'range: 2026-08-03..2026-08-03',
	'metrics: [total]',
	'```',
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
		await obsidianPage.write(STATS_NOTE, NOTE)
	})

	it('counts concurrent tasks once in the covered time and shows their overlap', async function () {
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
})
