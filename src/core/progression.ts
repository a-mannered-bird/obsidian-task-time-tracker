import type { MinutesByKey } from 'types/tasks'
import type { DailyLog } from './dailyLogs'
import { rangePeriod } from './ranges'
import { strong, type RichLine } from './richText'
import { average, type RangeStats } from './stats'
import type { CompareMode } from './statsOptions'
import { formatHoursMinutes } from './time'

/** The numbers of one period that a comparison looks at. */
export type PeriodValues = {
	covered: number
	byKey: MinutesByKey
	offTime: number | null
	unlogged: number | null
	dayStart: number | null
	dayEnd: number | null
	/** Each goal's combined achieved value and days met, by goal id. */
	goals: Record<string, GoalValues>
}

export type GoalValues = { achieved: number | null; daysMet: number }

/** An earlier period, and whether any clock ran in it (whatever the filter). */
export type EarlierPeriod = { values: PeriodValues; hasData: boolean }

export type Usual = {
	values: PeriodValues
	/** How the usual level was made, e.g. "average of 4 weeks". */
	label: string
}

export type ReadyComparison = {
	status: 'ready'
	/** Null when the block does not compare with the previous period. */
	previous: PeriodValues | null
	/** Null when the block does not compare with the usual level. */
	usual: Usual | null
}

export type Comparison =
	| { status: 'unavailable'; message: string }
	| ReadyComparison

export const NOTHING_TO_COMPARE_ALL_WITH: Comparison = {
	status: 'unavailable',
	message: 'Nothing to compare all with',
}

export const NO_EARLIER_DATA: Comparison = {
	status: 'unavailable',
	message: 'No earlier data',
}

export function periodValues(stats: RangeStats): PeriodValues {
	return {
		covered: stats.coveredMinutes,
		byKey: Object.fromEntries(stats.byKey),
		...stats.timeOfDay,
		goals: Object.fromEntries(
			stats.goals.map((row) => [
				row.id,
				{ achieved: row.achieved, daysMet: row.daysMet },
			])
		),
	}
}

/**
 * The usual level: every number averaged over the periods. A key missing
 * from a period had no time there, so it counts as 0; a time of day missing
 * from a period is unknown, so it is skipped, as is a goal the period did
 * not have (or its achieved value, when it had no result).
 */
export function averageValues(periods: PeriodValues[]): PeriodValues {
	const count = periods.length
	const byKey: MinutesByKey = {}
	for (const period of periods) {
		for (const [key, minutes] of Object.entries(period.byKey)) {
			byKey[key] = (byKey[key] ?? 0) + minutes / count
		}
	}
	return {
		covered: periods.reduce((sum, p) => sum + p.covered, 0) / count,
		byKey,
		offTime: average(periods.map((p) => p.offTime)),
		unlogged: average(periods.map((p) => p.unlogged)),
		dayStart: average(periods.map((p) => p.dayStart)),
		dayEnd: average(periods.map((p) => p.dayEnd)),
		goals: averageGoals(periods),
	}
}

function averageGoals(periods: PeriodValues[]): Record<string, GoalValues> {
	const ids = new Set(periods.flatMap((p) => Object.keys(p.goals)))
	return Object.fromEntries(
		[...ids].map((id) => {
			const values = periods.flatMap((p) => p.goals[id] ?? [])
			return [
				id,
				{
					achieved: average(values.map((v) => v.achieved)),
					daysMet: average(values.map((v) => v.daysMet)) ?? 0,
				},
			]
		})
	)
}

/** Whether a clock ran on a day of the range, filtered out or not. */
export function hasLoggedTime(
	logs: DailyLog[],
	range: { start: Date; end: Date }
): boolean {
	return logs.some(
		(log) =>
			log.date >= range.start &&
			log.date <= range.end &&
			log.tasks.some((task) => task.clocks.length > 0)
	)
}

/** How many earlier periods with logged time the comparison needs. */
export function periodsWanted(compare: CompareMode, compareWith: number) {
	return compare === 'previous' ? 1 : compareWith
}

/**
 * The comparison from the earlier periods, most recent first. Previous is
 * the first of them, logged or not; usual averages the first `compareWith`
 * that have logged time. Without any logged period there is nothing to
 * compare with, whatever the mode.
 */
export function buildComparison(
	compare: Exclude<CompareMode, 'none'>,
	compareWith: number,
	earlier: EarlierPeriod[],
	describePeriods: (count: number) => string
): Comparison {
	const logged = earlier
		.filter((period) => period.hasData)
		.slice(0, compareWith)
		.map((period) => period.values)
	if (logged.length === 0) return NO_EARLIER_DATA
	return {
		status: 'ready',
		previous: compare === 'usual' ? null : (earlier[0]?.values ?? null),
		usual:
			compare === 'previous'
				? null
				: {
						values: averageValues(logged),
						label: `average of ${describePeriods(logged.length)}`,
					},
	}
}

/**
 * `4 weeks`, `2 periods of 3 days`: the periods of a range spec, sized like
 * the shown one (`days` long when the spec has no unit of its own).
 */
export function describePeriods(
	spec: string,
	days: number,
	count: number
): string {
	const { unit, count: size } = rangePeriod(spec) ?? {
		unit: 'day',
		count: days,
	}
	const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`
	return size === 1
		? plural(count, unit)
		: `${plural(count, 'period')} of ${plural(size, unit)}`
}

/** The baseline the Trend column and the summary measure against. */
export function trendBaseline(comparison: ReadyComparison): {
	values: PeriodValues
	name: 'usual' | 'previous'
} | null {
	if (comparison.usual)
		return { values: comparison.usual.values, name: 'usual' }
	if (comparison.previous)
		return { values: comparison.previous, name: 'previous' }
	return null
}

/** A change in minutes, and in percent of the baseline when it is not 0. */
export type Delta = { minutes: number; percent: number | null }

export function durationDelta(current: number, baseline: number): Delta {
	return {
		minutes: Math.round(current - baseline),
		percent:
			baseline > 0 ? Math.round(((current - baseline) / baseline) * 100) : null,
	}
}

/** `▲ 3h 20m · +18%`, `▼ 40m · −24%`, or `No change`. */
export function formatDelta(delta: Delta, withPercent = true): string {
	if (delta.minutes === 0) return 'No change'
	const up = delta.minutes > 0
	const text = `${up ? '▲' : '▼'} ${formatHoursMinutes(Math.abs(delta.minutes))}`
	if (!withPercent || delta.percent === null) return text
	return `${text} · ${up ? '+' : '−'}${Math.abs(delta.percent)}%`
}

/** `18 min earlier`, `1h 05m later`: how a time of day moved. */
export function formatShift(current: number, baseline: number): string {
	const minutes = Math.round(current - baseline)
	if (minutes === 0) return 'same time'
	const distance = Math.abs(minutes)
	const amount =
		distance < 60 ? `${distance} min` : formatHoursMinutes(distance)
	return `${amount} ${minutes < 0 ? 'earlier' : 'later'}`
}

/** The direction a goal declares better (Phase 14 reads it from goal lines). */
export type GoalDirection = 'at-least' | 'at-most'

/**
 * Deltas are neutral: only a goal says whether more is better. An "at
 * least" goal makes a rise good, an "at most" goal a fall.
 */
export function deltaTone(
	delta: Delta,
	direction: GoalDirection | null
): 'good' | 'neutral' {
	if (direction === 'at-least' && delta.minutes > 0) return 'good'
	if (direction === 'at-most' && delta.minutes < 0) return 'good'
	return 'neutral'
}

/**
 * The duration delta shown after a summary value, `▲ 4h 10m vs usual`;
 * null when either side is unknown.
 */
export function summaryDelta(
	current: number | null,
	pick: (values: PeriodValues) => number | null,
	comparison: ReadyComparison
): string | null {
	const baseline = trendBaseline(comparison)
	const before = baseline ? pick(baseline.values) : null
	if (!baseline || current === null || before === null) return null
	return `${formatDelta(durationDelta(current, before), false)} vs ${baseline.name}`
}

/** The shift shown after a time of day; null when either side is unknown. */
export function summaryShift(
	current: number | null,
	pick: (values: PeriodValues) => number | null,
	comparison: ReadyComparison
): string | null {
	const baseline = trendBaseline(comparison)
	const before = baseline ? pick(baseline.values) : null
	if (!baseline || current === null || before === null) return null
	return formatShift(current, before)
}

/**
 * A Trend cell: the delta against the trend baseline, with a tooltip giving
 * this period and each baseline with its own delta.
 */
export function trendCell(
	name: string,
	current: number,
	pick: (values: PeriodValues) => number,
	comparison: ReadyComparison
): { text: string; tooltip: RichLine[] } {
	const { previous, usual } = comparison
	const line = (label: string, before: number, suffix = ''): RichLine => [
		{
			text: `${label} · ${formatHoursMinutes(before)} · ${formatDelta(durationDelta(current, before))}${suffix}`,
		},
	]
	const tooltip: RichLine[] = [
		[strong(name)],
		[{ text: `This period · ${formatHoursMinutes(current)}` }],
	]
	if (previous) tooltip.push(line('Previous', pick(previous)))
	if (usual)
		tooltip.push(line('Usual', pick(usual.values), ` (${usual.label})`))

	const baseline = trendBaseline(comparison)
	const text = baseline
		? formatDelta(durationDelta(current, pick(baseline.values)))
		: ''
	return { text, tooltip }
}
