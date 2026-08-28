import type { MinutesByKey, Task } from 'types/tasks'
import { minutesByTag, minutesByTask, sortByMinutes } from './aggregate'
import { addDays } from './dailyNotes'
import type { DailyLog } from './dailyLogs'
import { tasksToIntervals, uncoveredMinutes } from './intervals'
import { countDays, startOfDay } from './ranges'
import { getMinutesBetween } from './time'

export type GroupBy = 'task' | 'tag'

export type StatsOptions = {
	/** Resolved range; logs outside it only feed the sleep of the first day. */
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
	total: number
	/** Null when the note is missing or the frontmatter times are not set. */
	sleep: number | null
	unlogged: number | null
	/** Minutes since the day's midnight; bed times past midnight exceed 1440. */
	wake: number | null
	bed: number | null
}

export type RangeStats = {
	/** Calendar days in the range. */
	days: number
	/** Days on which at least one minute was logged. */
	loggedDays: number
	totalMinutes: number
	/** Totals per task or tag, most minutes first; zero-minute keys omitted. */
	byKey: [string, number][]
	perDay: DayPoint[]
	averagePerDay: number
	averagePerLoggedDay: number
	timeOfDay: {
		sleep: number | null
		unlogged: number | null
		wake: number | null
		bed: number | null
	}
}

/**
 * Statistics over a range of daily logs. `logs` may contain the day before
 * the range (needed for the first day's sleep); days without a note produce
 * an empty point so charts keep a continuous axis.
 */
export function computeRangeStats(
	logs: DailyLog[],
	options: StatsOptions
): RangeStats {
	const { range, groupBy, now } = options
	const byDate = new Map(logs.map((log) => [dayKey(log.date), log]))
	const aggregate = groupBy === 'task' ? minutesByTask : minutesByTag

	const perDay: DayPoint[] = []
	for (let date = range.start; date <= range.end; date = addDays(date, 1)) {
		const log = byDate.get(dayKey(date))
		const previous = byDate.get(dayKey(addDays(date, -1)))
		const tasks = log ? filterTasks(log.tasks, options.filter) : []
		const grouped =
			groupBy === 'tag' ? restrictTagsToFilter(tasks, options.filter) : tasks
		const minutes = aggregate(grouped, now)
		perDay.push({
			date,
			minutes,
			total: Object.values(minutes).reduce((sum, m) => sum + m, 0),
			// Time-of-day facts describe the whole day, so the filter does not
			// apply: "unlogged" stays "no clock at all", not "not on <filter>".
			...timeOfDay(log, previous, log?.tasks ?? [], now),
		})
	}

	const totals: MinutesByKey = {}
	for (const point of perDay) {
		for (const [key, minutes] of Object.entries(point.minutes)) {
			totals[key] = (totals[key] ?? 0) + minutes
		}
	}
	const totalMinutes = perDay.reduce((sum, point) => sum + point.total, 0)
	const loggedDays = perDay.filter((point) => point.total > 0).length
	const days = countDays(range)

	return {
		days,
		loggedDays,
		totalMinutes,
		byKey: sortByMinutes(totals).filter(([, minutes]) => minutes > 0),
		perDay,
		averagePerDay: days ? totalMinutes / days : 0,
		averagePerLoggedDay: loggedDays ? totalMinutes / loggedDays : 0,
		timeOfDay: {
			sleep: average(perDay.map((p) => p.sleep)),
			unlogged: average(perDay.map((p) => p.unlogged)),
			wake: average(perDay.map((p) => p.wake)),
			bed: average(perDay.map((p) => p.bed)),
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

/**
 * Grouping by tag with a filter only shows the filtered tags, not the other
 * tags carried by the same tasks. A task matched by name (none of its tags
 * is in the filter) keeps all of its tags.
 */
function restrictTagsToFilter(tasks: Task[], filter?: string[]): Task[] {
	if (!filter || filter.length === 0) return tasks
	return tasks.map((task) => {
		const kept = task.tags.filter((tag) => filter.includes(tag))
		return kept.length ? { ...task, tags: kept } : task
	})
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
): Pick<DayPoint, 'sleep' | 'unlogged' | 'wake' | 'bed'> {
	const wakeTime = log?.wakeTime ?? null
	const bedTime = log?.bedTime ?? null
	const previousBed = previous?.bedTime ?? null
	const midnight = log ? startOfDay(log.date) : null

	const sleep =
		previousBed && wakeTime ? getMinutesBetween(previousBed, wakeTime) : null

	let unlogged: number | null = null
	if (wakeTime) {
		const end = bedTime && bedTime < now ? bedTime : now
		unlogged =
			end > wakeTime
				? uncoveredMinutes(tasksToIntervals(tasks, now), {
						start: wakeTime,
						end,
					})
				: null
	}

	return {
		sleep,
		unlogged,
		wake: wakeTime && midnight ? getMinutesBetween(midnight, wakeTime) : null,
		bed: bedTime && midnight ? getMinutesBetween(midnight, bedTime) : null,
	}
}

function dayKey(date: Date): string {
	return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}
