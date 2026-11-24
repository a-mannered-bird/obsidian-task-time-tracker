import type { TFile } from 'obsidian'
import { describe, expect, it } from 'vitest'
import type { DailyLog } from './dailyLogs'
import {
	computeGoalStats,
	describeAchieved,
	goalPercent,
	streakDots,
	timeGoalRow,
} from './goalStats'
import { buildGoalsTable } from './goalsTable'
import { metricRuleOf } from './goalStyle'
import { parseTasks } from './parser'
import {
	averageValues,
	periodValues,
	type ReadyComparison,
} from './progression'
import { plainLine } from './richText'
import { computeRangeStats } from './stats'
import { buildStatsTable } from './statsTable'
import { readTagGoals } from './tagGoals'

const d = (day: number) => new Date(2026, 7, day)
// The 18th is today and not ended: its "at most" goals are not judged yet.
const now = new Date(2026, 7, 18, 12, 0)

const log = (
	day: number,
	lines: string[],
	tagGoals: string[] = [],
	dayEnd: Date | null = null
): DailyLog => ({
	date: d(day),
	file: { path: `2026-08-${day}.md` } as TFile,
	tasks: parseTasks(lines),
	tagGoals: readTagGoals(tagGoals),
	dayStart: null,
	dayEnd,
})

const clock = (day: number, from: string, to: string) =>
	`      [clock::2026-08-${day}T${from}:00--2026-08-${day}T${to}:00]`

const logs = [
	log(
		15,
		[
			'- [ ] Run #sport',
			'      [goal::1h]',
			'      [goal::distance 5/10 km]',
			'      [goal::speed 10/12 km/h]',
			clock(15, '07:00', '08:00'),
		],
		['#sport 1h']
	),
	log(16, ['- [ ] Email']),
	log(
		17,
		[
			'- [ ] Run #sport',
			'      [goal::1h]',
			'      [goal::distance 12/10 km]',
			'      [goal::speed 11/12 km/h]',
			clock(17, '07:00', '07:30'),
			'- [ ] Snacks',
			'      [goal::cookies 1/<2]',
		],
		['#sport 1h']
	),
	log(18, [
		'- [ ] Run #sport',
		'      [goal::distance /10 km]',
		'- [ ] Snacks',
		'      [goal::cookies 1/<2]',
	]),
]
const range = { start: d(15), end: d(18) }
const rows = computeGoalStats(
	logs,
	range,
	now,
	metricRuleOf({ speed: { rule: 'average' } })
)
const byTitle = new Map(rows.map((row) => [row.title, row]))

describe('computeGoalStats', () => {
	it('lists each goal of the range, task goals first, tag goals after', () => {
		expect(rows.map((row) => row.title)).toEqual([
			'Run · time',
			'Run · distance',
			'Run · speed',
			'Snacks · cookies',
			'#sport',
		])
	})

	it("combines achieved and target with the metric's rule over the days with a target", () => {
		// Distance adds up: 5 + 12 achieved, 10 + 10 + 10 targeted (the 18th
		// has a target and no result yet).
		expect(byTitle.get('Run · distance')).toMatchObject({
			achieved: 17,
			target: 30,
			daysWithTarget: 3,
			daysMet: 1,
		})
		// Speed averages: (10 + 11) / 2 of 12.
		expect(byTitle.get('Run · speed')).toMatchObject({
			achieved: 10.5,
			target: 12,
		})
		// The time goal adds up the minutes: 60 + 30 of 60 + 60.
		expect(byTitle.get('Run · time')).toMatchObject({
			achieved: 90,
			target: 120,
			daysMet: 1,
		})
	})

	it('judges each day: an open today is pending, a missing goal is none', () => {
		expect(
			byTitle.get('Snacks · cookies')?.days.map((day) => day.status)
		).toEqual(['none', 'none', 'met', 'pending'])
		expect(
			byTitle.get('Run · distance')?.days.map((day) => day.status)
		).toEqual(['missed', 'none', 'met', 'pending'])
	})

	it("measures a tag goal by the tag's covered time", () => {
		expect(byTitle.get('#sport')).toMatchObject({
			tag: '#sport',
			achieved: 90,
			target: 120,
			daysMet: 1,
		})
	})

	it("keeps the filtered tasks' goals and the listed tags' goals", () => {
		const filtered = computeGoalStats(logs, range, now, metricRuleOf({}), {
			keepTasks: (tasks) => tasks.filter((task) => task.name === 'Snacks'),
			tags: ['#none'],
		})
		expect(filtered.map((row) => row.title)).toEqual(['Snacks · cookies'])
	})
})

describe('goal cells', () => {
	it('shows achieved over target with the unit and limit', () => {
		expect(describeAchieved(byTitle.get('Run · distance')!)).toBe('17 / 30 km')
		expect(describeAchieved(byTitle.get('Run · time')!)).toBe('1h 30m / 2h 00m')
		expect(describeAchieved(byTitle.get('Snacks · cookies')!)).toBe('2 / <4')
		expect(goalPercent(byTitle.get('Run · distance')!)).toBe(57)
	})

	it('folds the streak into weeks on long ranges', () => {
		const long = { start: d(1), end: new Date(2026, 10, 30) }
		const [row] = computeGoalStats(logs, long, now, metricRuleOf({}))
		const dots = streakDots(row!)
		expect(dots).toHaveLength(mondayWeeks(long))
		// The time goal, met on Saturday the 15th (week of the 10th) and
		// missed on Monday the 17th; the other weeks have no goal.
		expect(
			dots.filter((dot) => dot.status !== 'none').map((dot) => dot.status)
		).toEqual(['met', 'missed'])
	})
})

/** Monday-started weeks touching the range. */
function mondayWeeks(range: { start: Date; end: Date }): number {
	const monday = (date: Date) => {
		const day = new Date(date)
		day.setDate(day.getDate() - ((day.getDay() + 6) % 7))
		return day
	}
	return (
		Math.round(
			(monday(range.end).valueOf() - monday(range.start).valueOf()) /
				(7 * 24 * 3600 * 1000)
		) + 1
	)
}

describe('buildGoalsTable', () => {
	const stats = computeRangeStats(logs, {
		range,
		groupBy: 'task',
		now,
		ruleOf: metricRuleOf({}),
	})
	const earlier = computeRangeStats(
		[
			log(8, [
				'- [ ] Run',
				'      [goal::distance 20/10 km]',
				'- [ ] Snacks',
				'      [goal::cookies 6/<2]',
			]),
		],
		{ range: { start: d(8), end: d(11) }, groupBy: 'task', now }
	)
	const comparison: ReadyComparison = {
		status: 'ready',
		previous: periodValues(earlier),
		usual: null,
	}

	it('shows each goal with its values, days met and streak', () => {
		const table = buildGoalsTable(stats.goals)
		expect(table.columns.map((column) => column.label)).toEqual([
			'Goal',
			'Achieved',
			'%',
			'Days met',
			'Streak',
		])
		expect(table.rows[1]?.cells.map((cell) => cell.text)).toEqual([
			'Run · distance',
			'17 / 30 km',
			'57%',
			'1 / 3',
			'1 of 4 met',
		])
	})

	it('colors a change its goal calls good: a fall under a limit, not a fall of a minimum', () => {
		const table = buildGoalsTable(stats.goals, comparison)
		const trend = (title: string) =>
			table.rows.find((row) => row.cells[0]?.text === title)?.cells[5]
		// Distance fell from 20 to 17 km, an "at least" goal: neutral.
		expect(trend('Run · distance')).toMatchObject({
			text: '▼ 3 km · −15%',
		})
		expect(trend('Run · distance')?.tone).toBeUndefined()
		// Cookies fell from 6 to 2 under an "at most" goal: good.
		expect(trend('Snacks · cookies')).toMatchObject({
			text: '▼ 4 · −67%',
			tone: 'good',
		})
		expect(trend('Run · time')?.text).toBe('–')
		expect(trend('Run · distance')?.tooltip?.map(plainLine)).toEqual([
			'Run · distance',
			'This period · 17 · met on 1 day',
			'Previous · 20 · met on 1 day',
		])
	})
})

describe('main table with goals', () => {
	it("adds a task's time goal progress, and colors its trend by direction", () => {
		const stats = computeRangeStats(logs, { range, groupBy: 'task', now })
		const comparison: ReadyComparison = {
			status: 'ready',
			previous: null,
			usual: {
				values: averageValues([
					{ ...periodValues(stats), byKey: { Run: 60 }, goals: {} },
				]),
				label: 'average of 1 period',
			},
		}
		const table = buildStatsTable(stats, 'task', null, comparison)
		const run = table.rows.find((row) => row.key === 'Run')!
		// 90 of 120 minutes over the two days with a time goal.
		expect(run.cells[1]?.text).toBe('1h 30m · ⏱ 75%')
		expect(run.cells[1]?.tooltip?.map(plainLine)).toEqual([
			'Run · time',
			'1h 30m of 2h 00m on the 2 days with a time goal',
			'Met on 1 day',
		])
		// 90 minutes against a usual 60, under an "at least" goal: good.
		expect(run.cells.at(-1)).toMatchObject({ tone: 'good' })
		expect(timeGoalRow(stats.goals, 'Email')).toBeUndefined()
	})

	it("gives a tag row its tag goal's progress", () => {
		const stats = computeRangeStats(logs, { range, groupBy: 'tag', now })
		const table = buildStatsTable(stats, 'tag', null)
		expect(table.rows[0]?.cells.map((cell) => cell.text).slice(0, 2)).toEqual([
			'#sport',
			'1h 30m · ⏱ 75%',
		])
	})
})
