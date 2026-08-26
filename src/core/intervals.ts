import type { Clock, Interval, Task } from 'types/tasks'
import { getMinutesBetween } from './time'

/** A running clock is measured up to `now`. */
export function clockToInterval(clock: Clock, now: Date): Interval {
	return { start: clock.start, end: clock.end ?? now }
}

export function tasksToIntervals(tasks: Task[], now: Date): Interval[] {
	return tasks.flatMap((task) =>
		task.clocks.map((clock) => clockToInterval(clock, now))
	)
}

export function intervalMinutes(interval: Interval): number {
	return getMinutesBetween(interval.start, interval.end)
}

function sumMinutes(intervals: Interval[]): number {
	return intervals.reduce((sum, interval) => sum + intervalMinutes(interval), 0)
}

/** Sorted union of the intervals; overlapping or touching ones are merged. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
	const sorted = intervals
		.filter((i) => i.end > i.start)
		.sort((a, b) => a.start.valueOf() - b.start.valueOf())

	const merged: Interval[] = []
	for (const interval of sorted) {
		const last = merged[merged.length - 1]
		if (last && interval.start <= last.end) {
			if (interval.end > last.end) last.end = interval.end
		} else {
			merged.push({ ...interval })
		}
	}
	return merged
}

/** Total minutes covered by the intervals; overlapping parts count once. */
export function coveredMinutes(intervals: Interval[]): number {
	return sumMinutes(mergeIntervals(intervals))
}

function clipInterval(interval: Interval, bounds: Interval): Interval | null {
	const start = new Date(
		Math.max(interval.start.valueOf(), bounds.start.valueOf())
	)
	const end = new Date(Math.min(interval.end.valueOf(), bounds.end.valueOf()))
	return end > start ? { start, end } : null
}

/** Parts of `bounds` not covered by any of the intervals. */
export function uncoveredIntervals(
	intervals: Interval[],
	bounds: Interval
): Interval[] {
	const clipped = mergeIntervals(intervals)
		.map((interval) => clipInterval(interval, bounds))
		.filter((interval): interval is Interval => interval !== null)

	const gaps: Interval[] = []
	let cursor = bounds.start
	for (const interval of clipped) {
		if (cursor < interval.start)
			gaps.push({ start: cursor, end: interval.start })
		if (interval.end > cursor) cursor = interval.end
	}
	if (cursor < bounds.end) gaps.push({ start: cursor, end: bounds.end })
	return gaps
}

export function uncoveredMinutes(intervals: Interval[], bounds: Interval) {
	return sumMinutes(uncoveredIntervals(intervals, bounds))
}
