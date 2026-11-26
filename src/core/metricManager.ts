import { taskMinutes } from './aggregate'
import { TIME_GOAL_LABEL } from './goalCards'
import { aggregate, type AggregationRuleOf } from './goals'
import type { IndexedNote } from './vaultTaskIndex'

type MetricCounts = {
	/** Task names with a goal of the metric on at least one line. */
	taskCount: number
	/** Notes with at least one goal line of the metric. */
	noteCount: number
	/** The most recent of those notes; null for a metric no note uses. */
	lastUsed: Date | null
}

/** The time goals' row: its Total is the clocked time of their tasks. */
export type TimeMetricInfo = MetricCounts & {
	kind: 'time'
	metric: typeof TIME_GOAL_LABEL
	/** Minutes clocked by each task on the days it had a time goal. */
	total: number
}

export type NamedMetricInfo = MetricCounts & {
	kind: 'metric'
	metric: string
	/** The unit of the most recent goal line; '' for a metric no note uses. */
	unit: string
	/** Goal lines per unit, the most used first: several mean unit drift. */
	units: { unit: string; count: number }[]
	/**
	 * Every recorded result in the current unit, combined with the metric's
	 * rule in date order; null without one.
	 */
	total: number | null
	/** Recorded results left out of the total for being in another unit. */
	leftOut: number
}

/** Aggregate of one metric over every daily note, for the Metrics tab. */
export type MetricInfo = TimeMetricInfo | NamedMetricInfo

export type MetricSortKey = 'notes' | 'metric' | 'tasks' | 'lastUsed' | 'total'

type Result = { value: number; unit: string }

type Accumulator = MetricCounts & {
	tasks: Set<string>
	/** By unit, counted in goal lines. */
	units: Map<string, number>
	latestUnit: { unit: string; date: Date } | null
	results: Result[]
	minutes: number
}

/**
 * The time row, then one row per metric used in a goal line or having
 * settings (`settingsMetrics`), most used first. `ruleOf` is the metrics'
 * aggregation rule as set, so a rule changed in the tab changes the totals.
 */
export function metricInfos(
	notes: IndexedNote[],
	settingsMetrics: string[],
	ruleOf: AggregationRuleOf,
	now: Date
): MetricInfo[] {
	const byMetric = new Map<string, Accumulator>()
	const accumulatorOf = (metric: string) => {
		let acc = byMetric.get(metric)
		if (!acc) {
			acc = {
				taskCount: 0,
				noteCount: 0,
				lastUsed: null,
				tasks: new Set(),
				units: new Map(),
				latestUnit: null,
				results: [],
				minutes: 0,
			}
			byMetric.set(metric, acc)
		}
		return acc
	}
	accumulatorOf(TIME_GOAL_LABEL)

	// Oldest first, so a `last` rule takes the most recent result.
	const ordered = [...notes].sort((a, b) => a.date.valueOf() - b.date.valueOf())
	for (const note of ordered) {
		const inNote = new Set<string>()
		for (const task of note.tasks) {
			for (const goal of task.goals) {
				const metric = goal.kind === 'time' ? TIME_GOAL_LABEL : goal.metric
				const acc = accumulatorOf(metric)
				acc.tasks.add(task.name)
				inNote.add(metric)
				if (goal.kind === 'time') {
					// A line holding two time goals still clocked its time once.
					if (task.goals.find((g) => g.kind === 'time') === goal) {
						acc.minutes += taskMinutes(task, now)
					}
					continue
				}
				acc.units.set(goal.unit, (acc.units.get(goal.unit) ?? 0) + 1)
				if (!acc.latestUnit || note.date >= acc.latestUnit.date) {
					acc.latestUnit = { unit: goal.unit, date: note.date }
				}
				if (goal.achieved !== null) {
					acc.results.push({ value: goal.achieved, unit: goal.unit })
				}
			}
		}
		for (const metric of inNote) {
			const acc = accumulatorOf(metric)
			acc.noteCount++
			acc.lastUsed = note.date
		}
	}
	for (const metric of settingsMetrics) accumulatorOf(metric)

	const infos = [...byMetric].map(([metric, acc]) =>
		metricInfo(metric, acc, ruleOf)
	)
	return sortMetricInfos(infos, 'notes')
}

function metricInfo(
	metric: string,
	acc: Accumulator,
	ruleOf: AggregationRuleOf
): MetricInfo {
	const counts: MetricCounts = {
		taskCount: acc.tasks.size,
		noteCount: acc.noteCount,
		lastUsed: acc.lastUsed,
	}
	if (metric === TIME_GOAL_LABEL) {
		return { kind: 'time', metric, ...counts, total: acc.minutes }
	}
	const unit = acc.latestUnit?.unit ?? ''
	const current = acc.results.filter((result) => result.unit === unit)
	return {
		kind: 'metric',
		metric,
		...counts,
		unit,
		units: [...acc.units]
			.map(([unit, count]) => ({ unit, count }))
			.sort((a, b) => b.count - a.count || a.unit.localeCompare(b.unit)),
		total: aggregate(
			ruleOf(metric, unit),
			current.map((result) => result.value)
		),
		leftOut: acc.results.length - current.length,
	}
}

/** Metrics containing the query, case folded. */
export function filterMetricInfos(
	infos: MetricInfo[],
	query: string
): MetricInfo[] {
	const needle = query.trim().toLowerCase()
	if (!needle) return infos
	return infos.filter((info) => info.metric.toLowerCase().includes(needle))
}

/**
 * Sort for the Metrics tab, the time row always first. `ascending` flips the
 * natural direction of the key: counts, total and last used biggest/newest
 * first, metrics alphabetical. Metrics without a total come last either way,
 * and ties fall back to the metric, so the order is stable.
 */
export function sortMetricInfos(
	infos: MetricInfo[],
	key: MetricSortKey,
	ascending = key === 'metric'
): MetricInfo[] {
	const direction = ascending ? 1 : -1
	return [...infos].sort(
		(a, b) =>
			pinned(b) - pinned(a) ||
			(key === 'total' ? missingTotal(a) - missingTotal(b) : 0) ||
			direction * compare(a, b, key) ||
			a.metric.localeCompare(b.metric)
	)
}

function pinned(info: MetricInfo): number {
	return info.kind === 'time' ? 1 : 0
}

function missingTotal(info: MetricInfo): number {
	return info.total === null ? 1 : 0
}

function compare(a: MetricInfo, b: MetricInfo, key: MetricSortKey): number {
	switch (key) {
		case 'notes':
			return a.noteCount - b.noteCount
		case 'metric':
			return a.metric.localeCompare(b.metric)
		case 'tasks':
			return a.taskCount - b.taskCount
		case 'lastUsed':
			return (a.lastUsed?.valueOf() ?? 0) - (b.lastUsed?.valueOf() ?? 0)
		case 'total':
			return (a.total ?? 0) - (b.total ?? 0)
	}
}
