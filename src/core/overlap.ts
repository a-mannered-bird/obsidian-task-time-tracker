import type { Interval, MinutesByKey } from 'types/tasks'

/** A clock of a task, with the row keys (task, tags…) it counts towards. */
export type TaskSpan = {
	task: string
	keys: string[]
	interval: Interval
}

export type TaskOverlap = {
	/** Minutes the task ran; its own overlapping clocks count once. */
	minutes: number
	/** Minutes during which at least one other task ran too. */
	shared: number
	/** Minutes shared with each other task. */
	partners: MinutesByKey
}

export type OverlapStats = {
	/** Minutes during which at least one task ran. */
	covered: number
	/** The tasks' minutes added up, minus covered: time counted twice or more. */
	concurrent: number
	/** Minutes during which at least one span carrying the key ran. */
	byKey: MinutesByKey
	byTask: Record<string, TaskOverlap>
}

const MINUTE = 60_000

/** Whole minutes since the epoch: the stats count minutes, not seconds. */
const toMinute = (date: Date) => Math.floor(date.valueOf() / MINUTE)

type Boundary = { at: number; delta: 1 | -1; span: TaskSpan }

/**
 * Covered, concurrent and per-task minutes of a set of clocks, from one
 * sweep over their start and end points: between two consecutive points the
 * set of running tasks is constant, so each stretch is credited at once.
 */
export function computeOverlap(spans: TaskSpan[]): OverlapStats {
	const boundaries: Boundary[] = []
	for (const span of spans) {
		const start = toMinute(span.interval.start)
		const end = toMinute(span.interval.end)
		if (end <= start) continue
		boundaries.push({ at: start, delta: 1, span }, { at: end, delta: -1, span })
	}
	boundaries.sort((a, b) => a.at - b.at)

	const runningTasks = new Map<string, number>()
	const runningKeys = new Map<string, number>()
	const result: OverlapStats = {
		covered: 0,
		concurrent: 0,
		byKey: {},
		byTask: {},
	}

	for (let i = 0; i < boundaries.length; i++) {
		const boundary = boundaries[i]!
		bump(runningTasks, boundary.span.task, boundary.delta)
		for (const key of new Set(boundary.span.keys)) {
			bump(runningKeys, key, boundary.delta)
		}
		const next = boundaries[i + 1]
		if (!next || next.at === boundary.at) continue
		creditStretch(result, next.at - boundary.at, runningTasks, runningKeys)
	}

	const counted = Object.values(result.byTask).reduce(
		(sum, task) => sum + task.minutes,
		0
	)
	result.concurrent = counted - result.covered
	return result
}

function creditStretch(
	result: OverlapStats,
	minutes: number,
	runningTasks: Map<string, number>,
	runningKeys: Map<string, number>
) {
	const tasks = [...runningTasks.keys()]
	if (tasks.length === 0) return
	result.covered += minutes
	for (const key of runningKeys.keys()) {
		result.byKey[key] = (result.byKey[key] ?? 0) + minutes
	}
	for (const task of tasks) {
		const entry = (result.byTask[task] ??= {
			minutes: 0,
			shared: 0,
			partners: {},
		})
		entry.minutes += minutes
		if (tasks.length < 2) continue
		entry.shared += minutes
		for (const partner of tasks) {
			if (partner === task) continue
			entry.partners[partner] = (entry.partners[partner] ?? 0) + minutes
		}
	}
}

/** Count running spans per name, dropping a name once none runs. */
function bump(counts: Map<string, number>, name: string, delta: 1 | -1) {
	const count = (counts.get(name) ?? 0) + delta
	if (count > 0) counts.set(name, count)
	else counts.delete(name)
}

/** Adds the second set of stats into the first, e.g. day after day. */
export function addOverlap(total: OverlapStats, day: OverlapStats): void {
	total.covered += day.covered
	total.concurrent += day.concurrent
	addMinutes(total.byKey, day.byKey)
	for (const [task, stats] of Object.entries(day.byTask)) {
		const entry = (total.byTask[task] ??= {
			minutes: 0,
			shared: 0,
			partners: {},
		})
		entry.minutes += stats.minutes
		entry.shared += stats.shared
		addMinutes(entry.partners, stats.partners)
	}
}

export function emptyOverlap(): OverlapStats {
	return { covered: 0, concurrent: 0, byKey: {}, byTask: {} }
}

function addMinutes(total: MinutesByKey, added: MinutesByKey) {
	for (const [key, minutes] of Object.entries(added)) {
		total[key] = (total[key] ?? 0) + minutes
	}
}
