import type { MinutesByKey, Task } from 'types/tasks'
import { sortByMinutes } from './aggregate'
import { addDays } from './dailyNotes'
import type { DailyLog } from './dailyLogs'
import {
	clockToInterval,
	tasksToIntervals,
	uncoveredMinutes,
} from './intervals'
import {
	addOverlap,
	computeOverlap,
	emptyOverlap,
	type TaskOverlap,
	type TaskSpan,
} from './overlap'
import { countDays, startOfDay } from './ranges'
import { getMinutesBetween } from './time'

export type GroupBy = 'task' | 'tag' | 'filter'

export type StatsOptions = {
	/** Resolved range; logs outside it only feed the off time of the first day. */
	range: { start: Date; end: Date }
	groupBy: GroupBy
	/** Keep only tasks whose name or one of whose tags is listed. */
	filter?: string[]
	now: Date
}

export type DayPoint = {
	date: Date
	/** Minutes per task name or tag, depending on `groupBy`. */
	minutes: MinutesByKey
	/** Minutes during which at least one (filtered) task ran. */
	covered: number
	/** Minutes counted more than once because tasks ran at the same time. */
	concurrent: number
	byTask: Record<string, TaskOverlap>
	/** Null when the note is missing or the frontmatter times are not set. */
	offTime: number | null
	unlogged: number | null
	/** Minutes since the day's midnight; day ends past midnight exceed 1440. */
	dayStart: number | null
	dayEnd: number | null
}

export type RangeStats = {
	/** Calendar days in the range. */
	days: number
	/** Days on which at least one minute was logged. */
	loggedDays: number
	coveredMinutes: number
	concurrentMinutes: number
	/** Totals per task or tag, most minutes first; zero-minute keys omitted. */
	byKey: [string, number][]
	/** Time, shared time and partners of each task, whatever the grouping. */
	byTask: Record<string, TaskOverlap>
	perDay: DayPoint[]
	averagePerDay: number
	averagePerLoggedDay: number
	timeOfDay: {
		offTime: number | null
		unlogged: number | null
		dayStart: number | null
		dayEnd: number | null
	}
}

/**
 * Statistics over a range of daily logs. `logs` may contain the day before
 * the range (needed for the first day's off time); days without a note produce
 * an empty point so charts keep a continuous axis.
 */
export function computeRangeStats(
	logs: DailyLog[],
	options: StatsOptions
): RangeStats {
	const { range, now } = options
	const byDate = new Map(logs.map((log) => [dayKey(log.date), log]))

	const perDay: DayPoint[] = []
	for (let date = range.start; date <= range.end; date = addDays(date, 1)) {
		const log = byDate.get(dayKey(date))
		const previous = byDate.get(dayKey(addDays(date, -1)))
		const tasks = log ? filterTasks(log.tasks, options.filter) : []
		const overlap = computeOverlap(taskSpans(tasks, options))
		perDay.push({
			date,
			minutes: overlap.byKey,
			covered: overlap.covered,
			concurrent: overlap.concurrent,
			byTask: overlap.byTask,
			// Time-of-day facts describe the whole day, so the filter does not
			// apply: "unlogged" stays "no clock at all", not "not on <filter>".
			...timeOfDay(log, previous, log?.tasks ?? [], now),
		})
	}

	const totals = emptyOverlap()
	for (const point of perDay) {
		addOverlap(totals, {
			covered: point.covered,
			concurrent: point.concurrent,
			byKey: point.minutes,
			byTask: point.byTask,
		})
	}
	const loggedDays = perDay.filter((point) => point.covered > 0).length
	const days = countDays(range)

	return {
		days,
		loggedDays,
		coveredMinutes: totals.covered,
		concurrentMinutes: totals.concurrent,
		byKey: sortByMinutes(totals.byKey).filter(([, minutes]) => minutes > 0),
		byTask: totals.byTask,
		perDay,
		averagePerDay: days ? totals.covered / days : 0,
		averagePerLoggedDay: loggedDays ? totals.covered / loggedDays : 0,
		timeOfDay: {
			offTime: average(perDay.map((p) => p.offTime)),
			unlogged: average(perDay.map((p) => p.unlogged)),
			dayStart: average(perDay.map((p) => p.dayStart)),
			dayEnd: average(perDay.map((p) => p.dayEnd)),
		},
	}
}

export function filterTasks(tasks: Task[], filter?: string[]): Task[] {
	if (!filter || filter.length === 0) return tasks
	return tasks.filter(
		(task) =>
			filter.includes(task.name) ||
			task.tags.some((tag) => filter.includes(tag))
	)
}

/** The clocks of the already-filtered tasks of one day, with their row keys. */
function taskSpans(tasks: Task[], options: StatsOptions): TaskSpan[] {
	return tasks.flatMap((task) => {
		const keys = rowKeys(task, options)
		return task.clocks.map((clock) => ({
			task: task.name,
			keys,
			interval: clockToInterval(clock, options.now),
		}))
	})
}

/**
 * The rows a task counts towards: its name, its tags, or the filter entries
 * it matches (a name entry for that task, a tag entry for every carrier).
 */
function rowKeys(task: Task, options: StatsOptions): string[] {
	const { groupBy, filter = [] } = options
	switch (groupBy) {
		case 'task':
			return [task.name]
		case 'tag':
			return restrictTagsToFilter(task, filter)
		case 'filter':
			return filter.filter(
				(entry) => entry === task.name || task.tags.includes(entry)
			)
	}
}

/**
 * Grouping by tag with a filter only shows the filtered tags, not the other
 * tags carried by the same tasks. A task matched by name (none of its tags
 * is in the filter) keeps all of its tags.
 */
function restrictTagsToFilter(task: Task, filter: string[]): string[] {
	const kept = task.tags.filter((tag) => filter.includes(tag))
	return kept.length ? kept : task.tags
}

/** Average of the non-null values, or null when there is none. */
export function average(values: (number | null)[]): number | null {
	const known = values.filter((value): value is number => value !== null)
	if (known.length === 0) return null
	return known.reduce((sum, value) => sum + value, 0) / known.length
}

function timeOfDay(
	log: DailyLog | undefined,
	previous: DailyLog | undefined,
	tasks: Task[],
	now: Date
): Pick<DayPoint, 'offTime' | 'unlogged' | 'dayStart' | 'dayEnd'> {
	const dayStart = log?.dayStart ?? null
	const dayEnd = log?.dayEnd ?? null
	const previousDayEnd = previous?.dayEnd ?? null
	const midnight = log ? startOfDay(log.date) : null

	const offTime =
		previousDayEnd && dayStart
			? getMinutesBetween(previousDayEnd, dayStart)
			: null

	let unlogged: number | null = null
	if (dayStart) {
		const end = dayEnd && dayEnd < now ? dayEnd : now
		unlogged =
			end > dayStart
				? uncoveredMinutes(tasksToIntervals(tasks, now), {
						start: dayStart,
						end,
					})
				: null
	}

	return {
		offTime,
		unlogged,
		dayStart:
			dayStart && midnight ? getMinutesBetween(midnight, dayStart) : null,
		dayEnd: dayEnd && midnight ? getMinutesBetween(midnight, dayEnd) : null,
	}
}

function dayKey(date: Date): string {
	return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}
