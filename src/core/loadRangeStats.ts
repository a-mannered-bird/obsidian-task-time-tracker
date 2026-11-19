import { addDays } from './dailyNotes'
import type { DailyLogStore } from './dailyLogs'
import {
	buildComparison,
	describePeriods,
	hasLoggedTime,
	NOTHING_TO_COMPARE_ALL_WITH,
	periodsWanted,
	periodValues,
	type Comparison,
	type EarlierPeriod,
} from './progression'
import { countDays, earlierRange, shiftRange } from './ranges'
import { computeRangeStats, type RangeStats } from './stats'
import type { StatsBlockOptions } from './statsOptions'

export type LoadedRangeStats = {
	range: { start: Date; end: Date }
	stats: RangeStats
}

/**
 * Resolve the range (the `all` preset starts at the oldest daily note), load
 * the logs plus the day before (previous end of day), and compute the stats.
 * A non-zero `offset` steps that many periods away from the written range
 * (see shiftRange). Returns null when the range cannot be resolved or holds
 * no note at all.
 */
export async function loadRangeStats(
	store: DailyLogStore,
	options: StatsBlockOptions,
	offset = 0,
	now = new Date()
): Promise<LoadedRangeStats | null> {
	const resolved = shiftRange(options.range, offset, now)
	if (!resolved) return null

	const start = resolved.start ?? store.earliestDate()
	if (!start) return null
	const range = { start, end: resolved.end }

	const logs = await store.loadRange(addDays(range.start, -1), range.end)
	const stats = computeRangeStats(logs, {
		range,
		groupBy: options.groupBy,
		filter: options.filter,
		now,
	})
	return { range, stats }
}

/**
 * Load the periods before the one shown at `offset`, most recent first, until
 * enough of them have logged time or the oldest daily note is passed, and
 * compare with them. Null when the block compares with nothing.
 */
export async function loadComparison(
	store: DailyLogStore,
	options: StatsBlockOptions,
	offset = 0,
	now = new Date()
): Promise<Comparison | null> {
	const { compare } = options
	if (compare === 'none') return null
	const shown = shiftRange(options.range, offset, now)
	if (!shown) return null
	if (!shown.start) return NOTHING_TO_COMPARE_ALL_WITH

	const earliest = store.earliestDate()
	const wanted = periodsWanted(compare, options.compareWith)
	const earlier: EarlierPeriod[] = []
	let logged = 0
	for (let back = 1; earliest && logged < wanted; back++) {
		const range = earlierRange(options.range, offset, back, now)
		if (!range || range.end < earliest) break
		const logs = await store.loadRange(addDays(range.start, -1), range.end)
		const stats = computeRangeStats(logs, {
			range,
			groupBy: options.groupBy,
			filter: options.filter,
			now,
		})
		const hasData = hasLoggedTime(logs, range)
		if (hasData) logged++
		earlier.push({ values: periodValues(stats), hasData })
	}

	const days = countDays({ start: shown.start, end: shown.end })
	return buildComparison(compare, options.compareWith, earlier, (count) =>
		describePeriods(options.range, days, count)
	)
}
