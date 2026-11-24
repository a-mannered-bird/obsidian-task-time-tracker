import { describe, expect, it } from 'vitest'
import type { TFile } from 'obsidian'
import type { DailyLog } from './dailyLogs'
import { parseTasks } from './parser'
import type { ReadyComparison } from './progression'
import { plainLine } from './richText'
import { computeRangeStats, type GroupBy } from './stats'
import {
	buildStatsTable,
	chartDay,
	foldPartners,
	type StatsTable,
} from './statsTable'

const d = (day: number, h = 0, m = 0) => new Date(2026, 7, day, h, m, 0)
const now = d(18, 20, 0)
const range = { start: d(16), end: d(16) }

function statsOf(lines: string[], groupBy: GroupBy = 'task') {
	const log: DailyLog = {
		date: d(16),
		file: { path: 'Journal/2026-08-16.md' } as TFile,
		tasks: parseTasks(lines),
		tagGoals: [],
		dayStart: null,
		dayEnd: null,
	}
	return computeRangeStats([log], { range, groupBy, now })
}

// Deep work 9:00–13:00, Music 12:00–13:00 (with Deep work), Email
// 12:30–13:30 (with both from 12:30 to 13:00).
const day = [
	'- [ ] Deep work #focus',
	'      [clock::2026-08-16T09:00:00--2026-08-16T13:00:00]',
	'- [ ] Music #leisure',
	'      [clock::2026-08-16T12:00:00--2026-08-16T13:00:00]',
	'- [ ] Email #focus',
	'      [clock::2026-08-16T12:30:00--2026-08-16T13:30:00]',
]

const texts = (table: StatsTable) => ({
	columns: table.columns.map((column) => column.label),
	rows: table.rows.map((row) => row.cells.map((cell) => cell.text)),
	footer: table.footer.map((row) => row.cells.map((cell) => cell.text)),
})

describe('buildStatsTable', () => {
	it('adds a Trend column against usual, Other folding the hidden keys of the baseline too', () => {
		const comparison: ReadyComparison = {
			status: 'ready',
			previous: null,
			usual: {
				// Walk only ran before: it folds into Other with Music and Email.
				values: {
					covered: 300,
					byKey: { 'Deep work': 180, Music: 60, Walk: 30 },
					offTime: null,
					unlogged: null,
					dayStart: null,
					dayEnd: null,
					goals: {},
				},
				label: 'average of 4 days',
			},
		}
		const table = buildStatsTable(statsOf(day), 'task', 1, comparison)
		const { columns, rows, footer } = texts(table)
		expect(columns.at(-1)).toBe('Trend')
		expect(rows.map((row) => row.at(-1))).toEqual([
			'▲ 1h 00m · +33%',
			'▲ 30m · +33%',
		])
		// Covered 4h 30m against 5h.
		expect(footer.at(-1)?.at(-1)).toBe('▼ 30m · −10%')
	})

	it('shares rows of the covered time and reconciles them in the footer', () => {
		const table = buildStatsTable(statsOf(day), 'task', null)
		// 4h + 1h + 1h = 6h counted over 4h 30m covered: 1h 30m concurrent.
		expect(texts(table)).toEqual({
			columns: ['Task', 'Time spent', 'Share', 'Overlap'],
			rows: [
				['Deep work', '4h 00m', '89%', '25%'],
				['Music', '1h 00m', '22%', '100%'],
				['Email', '1h 00m', '22%', '50%'],
			],
			footer: [
				['Rows', '6h 00m', '133%', ''],
				['Concurrent', '− 1h 30m', '', ''],
				['Covered', '4h 30m', '100%', ''],
			],
		})
	})

	it('names the partners in the overlap tooltip, most shared first', () => {
		const table = buildStatsTable(statsOf(day), 'task', null)
		const tooltip = table.rows[0]!.cells[3]!.tooltip!
		expect(tooltip.map(plainLine)).toEqual([
			'Deep work · 1h 00m of 4h 00m shared (25%)',
			'with Music · 1h 00m',
			'with Email · 30m',
		])
		expect(tooltip[1]).toContainEqual({ text: 'Music', strong: true })
	})

	it('folds the rows and partners beyond top into Other', () => {
		const table = buildStatsTable(statsOf(day), 'task', 1)
		expect(texts(table).rows).toEqual([
			['Deep work', '4h 00m', '89%', '25%'],
			['Other', '2h 00m', '44%', '75%'],
		])
		expect(table.rows[0]!.cells[3]!.tooltip!.map(plainLine)).toEqual([
			'Deep work · 1h 00m of 4h 00m shared (25%)',
			'with Other · 1h 30m',
		])
	})

	it('has no Overlap column when no tasks ran together', () => {
		const table = buildStatsTable(statsOf(day.slice(0, 2)), 'task', null)
		expect(texts(table)).toEqual({
			columns: ['Task', 'Time spent', 'Share'],
			rows: [['Deep work', '4h 00m', '100%']],
			footer: [['Covered', '4h 00m', '100%']],
		})
	})

	it('has no Overlap column outside task mode, and sums rows without reconciling', () => {
		const table = buildStatsTable(statsOf(day, 'tag'), 'tag', null)
		// #focus is Deep work or Email running: 9:00–13:30.
		expect(texts(table)).toEqual({
			columns: ['Tag', 'Time spent', 'Share'],
			rows: [
				['#focus', '4h 30m', '100%'],
				['#leisure', '1h 00m', '22%'],
			],
			footer: [
				['Rows', '5h 30m', '122%'],
				['Covered', '4h 30m', '100%'],
			],
		})
	})
})

describe('foldPartners', () => {
	it('keeps shown partners by minutes and adds up the others', () => {
		expect(
			foldPartners({ A: 10, B: 30, C: 5, D: 5 }, new Set(['A', 'B']))
		).toEqual([
			['B', 30],
			['A', 10],
			['Other', 10],
		])
	})
})

describe('chartDay', () => {
	it('folds minutes and shared minutes like the rows', () => {
		const stats = statsOf(day)
		expect(chartDay(stats.perDay[0]!, new Set(['Deep work']), true)).toEqual({
			minutes: { 'Deep work': 240, Other: 120 },
			shared: { 'Deep work': 60, Other: 90 },
			covered: 270,
			concurrent: 90,
		})
		expect(
			chartDay(stats.perDay[0]!, new Set(['Deep work']), false).shared
		).toEqual({})
	})
})
