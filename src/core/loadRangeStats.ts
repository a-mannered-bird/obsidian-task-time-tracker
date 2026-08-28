import { addDays } from './dailyNotes'
import type { DailyLogStore } from './dailyLogs'
import { shiftRange } from './ranges'
import { computeRangeStats, type RangeStats } from './stats'
import type { StatsBlockOptions } from './statsOptions'

export type LoadedRangeStats = {
	range: { start: Date; end: Date }
	stats: RangeStats
}

/**
 * Resolve the range (the `all` preset starts at the oldest daily note), load
 * the logs plus the day before (previous bed time), and compute the stats.
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
