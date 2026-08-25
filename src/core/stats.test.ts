import { describe, expect, it } from 'vitest'
import type { TFile } from 'obsidian'
import type { DailyLog } from './dailyLogs'
import { parseTasks } from './parser'
import { average, computeRangeStats, filterTasks } from './stats'

const d = (day: number, h = 0, m = 0) => new Date(2026, 7, day, h, m, 0)
const now = d(18, 20, 0)

function log(
	day: number,
	lines: string[],
	times: { wake?: Date; bed?: Date } = {}
): DailyLog {
	return {
		date: d(day),
		file: { path: `Journal/2026-08-${day}.md` } as TFile,
		tasks: parseTasks(lines),
		wakeTime: times.wake ?? null,
		bedTime: times.bed ?? null,
	}
}

const clock = (day: number, from: string, to: string) =>
	`      [clock::2026-08-${day}T${from}:00--2026-08-${day}T${to}:00]`

const logs = [
	// Day before the range: only its bed time matters (sleep of the 16th).
	log(15, [], { bed: d(15, 23, 0) }),
	log(
		16,
		[
			'- [ ] Write plugin #project',
			clock(16, '09:00', '11:00'),
			'- [ ] Walk the dog #routine #outside',
			clock(16, '08:00', '08:30'),
		],
		{ wake: d(16, 7, 0), bed: d(16, 23, 30) }
	),
	// 17th has no note at all.
	log(
		18,
		['- [ ] Write plugin #project', clock(18, '14:00', '15:00'), '- [ ] Idle'],
		{ wake: d(18, 8, 0) }
	),
]
const range = { start: d(16), end: d(18) }

describe('computeRangeStats', () => {
	const stats = computeRangeStats(logs, { range, groupBy: 'task', now })

	it('produces one point per calendar day, empty for missing notes', () => {
		expect(stats.perDay.map((p) => [p.date.getDate(), p.total])).toEqual([
			[16, 150],
			[17, 0],
			[18, 60],
		])
		expect(stats.days).toBe(3)
		expect(stats.loggedDays).toBe(2)
	})

	it('totals by task, most minutes first without unclocked tasks, and both averages', () => {
		expect(stats.totalMinutes).toBe(210)
		expect(stats.byKey).toEqual([
			['Write plugin', 180],
			['Walk the dog', 30],
		])
		expect(stats.averagePerDay).toBe(70)
		expect(stats.averagePerLoggedDay).toBe(105)
	})

	it('groups by tag when asked', () => {
		const byTag = computeRangeStats(logs, { range, groupBy: 'tag', now })
		expect(byTag.byKey).toEqual([
			['#project', 180],
			['#routine', 30],
			['#outside', 30],
		])
	})

	it('computes sleep, unlogged, wake and bed per day and on average', () => {
		const [day16, day17, day18] = stats.perDay
		expect(day16).toMatchObject({
			sleep: 480,
			unlogged: 990 - 150, // wake→bed minus the logged 150 minutes
			wake: 420,
			bed: 1410,
		})
		expect(day17).toMatchObject({
			sleep: null,
			unlogged: null,
			wake: null,
			bed: null,
		})
		// No bed time yet: unlogged runs up to `now`, bed and sleep are unknown.
		expect(day18).toMatchObject({
			sleep: null,
			unlogged: 720 - 60,
			wake: 480,
			bed: null,
		})

		expect(stats.timeOfDay).toEqual({
			sleep: 480,
			unlogged: (840 + 660) / 2,
			wake: 450,
			bed: 1410,
		})
	})

	it('applies a name/tag filter before everything else', () => {
		const filtered = computeRangeStats(logs, {
			range,
			groupBy: 'task',
			filter: ['#routine'],
			now,
		})
		expect(filtered.byKey).toEqual([['Walk the dog', 30]])
		expect(filtered.totalMinutes).toBe(30)
	})

	it('computes time-of-day stats from all tasks even when a filter is set', () => {
		const filtered = computeRangeStats(logs, {
			range,
			groupBy: 'task',
			filter: ['#routine'],
			now,
		})
		expect(filtered.perDay[0]!.unlogged).toBe(stats.perDay[0]!.unlogged)
	})
})

describe('filterTasks', () => {
	const tasks = parseTasks(['- [ ] A #x', '- [ ] B #y', '- [ ] C'])

	it('matches on task name or tag and keeps everything without a filter', () => {
		expect(filterTasks(tasks, ['#y', 'C']).map((t) => t.name)).toEqual([
			'B',
			'C',
		])
		expect(filterTasks(tasks, []).map((t) => t.name)).toEqual(['A', 'B', 'C'])
		expect(filterTasks(tasks)).toBe(tasks)
	})
})

describe('average', () => {
	it('ignores nulls and returns null when nothing is known', () => {
		expect(average([10, null, 20])).toBe(15)
		expect(average([null, null])).toBeNull()
	})
})
