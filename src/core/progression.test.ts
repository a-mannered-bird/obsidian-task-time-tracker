import { describe, expect, it } from 'vitest'
import type { TFile } from 'obsidian'
import type { DailyLog } from './dailyLogs'
import { parseTasks } from './parser'
import {
	averageValues,
	buildComparison,
	deltaTone,
	describePeriods,
	durationDelta,
	formatDelta,
	formatShift,
	hasLoggedTime,
	summaryDelta,
	summaryShift,
	trendCell,
	type EarlierPeriod,
	type PeriodValues,
	type ReadyComparison,
} from './progression'
import { plainLine } from './richText'

const d = (day: number) => new Date(2026, 7, day)

function period(
	covered: number,
	byKey: Record<string, number> = {},
	dayStart: number | null = null
): PeriodValues {
	return {
		covered,
		byKey,
		offTime: null,
		unlogged: null,
		dayStart,
		dayEnd: null,
	}
}

const logged = (values: PeriodValues): EarlierPeriod => ({
	values,
	hasData: true,
})
const empty: EarlierPeriod = { values: period(0), hasData: false }
const weeks = (count: number) => describePeriods('this-week', 3, count)

function ready(comparison: ReturnType<typeof buildComparison>) {
	if (comparison.status !== 'ready') throw new Error(comparison.message)
	return comparison
}

describe('averageValues', () => {
	it('counts a key missing from a period as 0 and skips an unknown time of day', () => {
		const usual = averageValues([
			period(120, { Email: 60, Run: 60 }, 420),
			period(60, { Email: 60 }, null),
		])
		expect(usual.covered).toBe(90)
		expect(usual.byKey).toEqual({ Email: 60, Run: 30 })
		expect(usual.dayStart).toBe(420)
	})
})

describe('buildComparison', () => {
	it('averages only the periods with logged time, up to compareWith', () => {
		const comparison = ready(
			buildComparison(
				'both',
				2,
				[logged(period(60)), empty, logged(period(120)), logged(period(600))],
				weeks
			)
		)
		// The empty second week is skipped, the fourth is beyond compareWith.
		expect(comparison.usual).toEqual({
			values: period(90),
			label: 'average of 2 weeks',
		})
		expect(comparison.previous).toEqual(period(60))
	})

	it('keeps an unlogged previous period, the one right before', () => {
		const comparison = ready(
			buildComparison('both', 4, [empty, logged(period(120))], weeks)
		)
		expect(comparison.previous).toEqual(period(0))
		expect(comparison.usual?.label).toBe('average of 1 week')
	})

	it('has nothing to compare with before the first logged period', () => {
		expect(buildComparison('both', 4, [empty, empty], weeks)).toEqual({
			status: 'unavailable',
			message: 'No earlier data',
		})
		expect(buildComparison('previous', 4, [], weeks).status).toBe('unavailable')
	})

	it('drops the baseline the block does not compare with', () => {
		const earlier = [logged(period(60)), logged(period(120))]
		expect(ready(buildComparison('previous', 4, earlier, weeks)).usual).toBe(
			null
		)
		expect(ready(buildComparison('usual', 4, earlier, weeks)).previous).toBe(
			null
		)
	})
})

describe('describePeriods', () => {
	it.each([
		['this-month', 30, 4, '4 months'],
		['today', 1, 1, '1 day'],
		['last-2-weeks', 14, 3, '3 periods of 2 weeks'],
		['2026-08-01..2026-08-10', 10, 2, '2 periods of 10 days'],
	])('%s', (spec, days, count, text) => {
		expect(describePeriods(spec, days, count)).toBe(text)
	})
})

describe('hasLoggedTime', () => {
	const log = (day: number, lines: string[]): DailyLog => ({
		date: d(day),
		file: { path: `2026-08-${day}.md` } as TFile,
		tasks: parseTasks(lines),
		tagGoals: [],
		dayStart: null,
		dayEnd: null,
	})
	const clocked = [
		'- [ ] Email',
		'      [clock::2026-08-09T09:00:00--2026-08-09T09:30:00]',
	]

	it('needs a clock on a day of the range, not a note or the day before', () => {
		const range = { start: d(10), end: d(16) }
		expect(
			hasLoggedTime([log(9, clocked), log(10, ['- [ ] Email'])], range)
		).toBe(false)
		expect(hasLoggedTime([log(12, clocked)], range)).toBe(true)
	})
})

describe('deltas', () => {
	it('rounds the averaged baseline and gives the change in percent', () => {
		expect(formatDelta(durationDelta(1320, 1120))).toBe('▲ 3h 20m · +18%')
		expect(formatDelta(durationDelta(130, 170))).toBe('▼ 40m · −24%')
		expect(formatDelta(durationDelta(60, 60.4))).toBe('No change')
	})

	it('has no percent against a baseline of 0', () => {
		expect(formatDelta(durationDelta(30, 0))).toBe('▲ 30m')
	})

	it('says how a time of day moved', () => {
		expect(formatShift(430, 448)).toBe('18 min earlier')
		expect(formatShift(1125, 1060)).toBe('1h 05m later')
		expect(formatShift(420, 420.2)).toBe('same time')
	})
})

describe('deltaTone', () => {
	const up = durationDelta(90, 60)
	const down = durationDelta(30, 60)

	it('stays neutral without a goal', () => {
		expect(deltaTone(up, null)).toBe('neutral')
	})

	it('makes the direction a goal asks for good', () => {
		expect(deltaTone(up, 'at-least')).toBe('good')
		expect(deltaTone(down, 'at-least')).toBe('neutral')
		expect(deltaTone(down, 'at-most')).toBe('good')
	})
})

describe('trend against the baselines', () => {
	const both: ReadyComparison = {
		status: 'ready',
		previous: period(1230, { 'Deep work': 1230 }, 450),
		usual: {
			values: period(1120, { 'Deep work': 1120 }, 448),
			label: 'average of 4 weeks',
		},
	}
	const previousOnly: ReadyComparison = { ...both, usual: null }

	it('measures the Trend cell against usual, and lists every baseline in its tooltip', () => {
		const cell = trendCell(
			'Deep work',
			1320,
			(values) => values.byKey['Deep work'] ?? 0,
			both
		)
		expect(cell.text).toBe('▲ 3h 20m · +18%')
		expect(cell.tooltip.map(plainLine)).toEqual([
			'Deep work',
			'This period · 22h 00m',
			'Previous · 20h 30m · ▲ 1h 30m · +7%',
			'Usual · 18h 40m · ▲ 3h 20m · +18% (average of 4 weeks)',
		])
	})

	it('falls back to the previous period without usual', () => {
		const cell = trendCell('Covered', 1320, (v) => v.covered, previousOnly)
		expect(cell.text).toBe('▲ 1h 30m · +7%')
		expect(summaryDelta(1320, (v) => v.covered, previousOnly)).toBe(
			'▲ 1h 30m vs previous'
		)
	})

	it('words the summary deltas, and skips unknown values', () => {
		expect(summaryDelta(1320, (v) => v.covered, both)).toBe('▲ 3h 20m vs usual')
		expect(summaryShift(430, (v) => v.dayStart, both)).toBe('18 min earlier')
		expect(summaryShift(430, (v) => v.dayEnd, both)).toBeNull()
		expect(summaryShift(null, (v) => v.dayStart, both)).toBeNull()
	})
})
