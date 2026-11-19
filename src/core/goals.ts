import type { AggregationRule, Goal, MetricGoal, TimeGoal } from 'types/goals'
import type { Task } from 'types/tasks'

export const GOAL_KEY = 'goal'

const NUMBER = String.raw`\d+(?:[.,]\d+)?`
const DURATION = new RegExp(
	String.raw`^(?:(${NUMBER})\s*h)?\s*(?:(${NUMBER})\s*m)?$`,
	'i'
)
const BARE_NUMBER = new RegExp(String.raw`^<?\s*${NUMBER}$`)
const VALUES = new RegExp(
	String.raw`^(${NUMBER})?\s*(?:\/\s*(<)?\s*(${NUMBER})?)?\s*(.*)$`
)

export const BARE_NUMBER_PROBLEM = 'Add h or m, or a metric name'

export type ParsedGoal = { goal: Goal } | { problem: string }

/**
 * Read what a `[goal::…]` line holds: a time goal (`1h30m`, `<30m`, `1.5h`)
 * or a metric (`distance 8/10 km`, `weight 81.4/<80 kg`, `5k pace: 5.2/5
 * min/km`). The metric is the text before the first number or `/`, or before
 * a colon when there is one; achieved and target are optional.
 */
export function parseGoal(text: string): ParsedGoal {
	const trimmed = text.trim()
	if (trimmed === '')
		return { problem: 'Write a goal, like 1h or distance /10 km' }

	const time = parseGoalDuration(trimmed)
	if (time) return { goal: { kind: 'time', ...time } }
	if (BARE_NUMBER.test(trimmed)) return { problem: BARE_NUMBER_PROBLEM }

	const colon = trimmed.indexOf(':')
	const valuesAt = colon >= 0 ? colon + 1 : trimmed.search(/[\d/]/)
	const metric = (
		valuesAt < 0 ? trimmed : trimmed.slice(0, colon >= 0 ? colon : valuesAt)
	).trim()
	const rest = valuesAt < 0 ? '' : trimmed.slice(valuesAt).trim()

	if (metric === '') {
		return {
			problem: trimmed.includes('/')
				? 'Add a metric name before the numbers'
				: BARE_NUMBER_PROBLEM,
		}
	}
	if (metric.endsWith('<')) {
		return { problem: 'Put < after the /, as in /<10' }
	}

	const values = VALUES.exec(rest)
	const [, achieved, atMost, target, unit = ''] = values ?? []
	if (!values || (atMost && !target) || /^[\d/<]/.test(unit)) {
		return { problem: 'Write it as: metric achieved/target unit' }
	}
	return {
		goal: {
			kind: 'metric',
			metric,
			achieved: achieved === undefined ? null : parseNumber(achieved),
			target: target === undefined ? null : parseNumber(target),
			atMost: Boolean(atMost && target),
			unit: unit.trim(),
			decimalComma: [achieved, target].some((n) => n?.includes(',')),
		},
	}
}

/**
 * A duration with `h` or `m`, `<` in front for a limit; null otherwise.
 * Shared by goal lines and `tag_goals` entries.
 */
export function parseGoalDuration(text: string): Omit<TimeGoal, 'kind'> | null {
	const atMost = text.startsWith('<')
	const body = (atMost ? text.slice(1) : text).trim()
	const match = DURATION.exec(body)
	if (!match || (match[1] === undefined && match[2] === undefined)) return null
	const hours = match[1] === undefined ? 0 : parseNumber(match[1])
	const minutes = match[2] === undefined ? 0 : parseNumber(match[2])
	return { minutes: Math.round(hours * 60 + minutes), atMost }
}

function parseNumber(text: string): number {
	return Number(text.replace(',', '.'))
}

/** What goes between `[goal::` and `]`, as the plugin writes it. */
export function formatGoal(goal: Goal): string {
	if (goal.kind === 'time') {
		return `${goal.atMost ? '<' : ''}${formatGoalMinutes(goal.minutes)}`
	}
	// A metric containing a digit needs the colon to tell it from the values.
	const name = /\d/.test(goal.metric) ? `${goal.metric}:` : goal.metric
	const number = (value: number) =>
		goal.decimalComma ? String(value).replace('.', ',') : String(value)
	const achieved = goal.achieved === null ? '' : number(goal.achieved)
	const values =
		goal.target !== null
			? `${achieved}/${goal.atMost ? '<' : ''}${number(goal.target)}`
			: achieved || '/'
	return [name, values, goal.unit].filter(Boolean).join(' ')
}

export function formatGoalLine(goal: Goal, indent: string): string {
	return `${indent}[${GOAL_KEY}::${formatGoal(goal)}]`
}

/** `1h30m`, `1h`, `45m`: how the plugin writes a time goal. */
export function formatGoalMinutes(minutes: number): string {
	const hours = Math.floor(minutes / 60)
	const rest = minutes % 60
	if (hours === 0) return `${rest}m`
	return rest === 0 ? `${hours}h` : `${hours}h${rest}m`
}

/** The goal as a new day starts it: targets only, nothing achieved yet. */
export function targetOnly(goal: Goal): Goal {
	return goal.kind === 'metric' ? { ...goal, achieved: null } : goal
}

/**
 * The task with its goal lines, in note order, for a list or confirmation:
 * `Run · 1h, distance 8/10 km`. Malformed lines show as written.
 */
export function describeTaskGoals(
	task: Pick<Task, 'name' | 'goals' | 'malformedGoals'>
): string {
	const lines = [
		...task.goals.map((goal) => ({ ...goal, text: formatGoal(goal) })),
		...task.malformedGoals,
	].sort((a, b) => a.lineIndex - b.lineIndex)
	return `${task.name} · ${lines.map((line) => line.text).join(', ')}`
}

/** Units per hour, minute… are rates: they average rather than add up. */
export function defaultAggregation(unit: string): AggregationRule {
	return unit.includes('/') ? 'average' : 'sum'
}

/** The rule of a metric, from its name and unit (settings come later). */
export type AggregationRuleOf = (
	metric: string,
	unit: string
) => AggregationRule

export const defaultAggregationRuleOf: AggregationRuleOf = (_, unit) =>
	defaultAggregation(unit)

/**
 * The values combined by the rule, in the given order (`last` takes the last
 * one); null without values. Rounded to the inputs' decimals, one more for
 * an average, so floating-point noise never reaches a note.
 */
export function aggregate(
	rule: AggregationRule,
	values: number[]
): number | null {
	if (values.length === 0) return null
	const result =
		rule === 'sum'
			? values.reduce((sum, value) => sum + value, 0)
			: rule === 'average'
				? values.reduce((sum, value) => sum + value, 0) / values.length
				: rule === 'last'
					? values[values.length - 1]!
					: rule === 'min'
						? Math.min(...values)
						: Math.max(...values)
	const decimals =
		Math.max(...values.map(decimalCount)) + (rule === 'average' ? 1 : 0)
	return Number(result.toFixed(decimals))
}

function decimalCount(value: number): number {
	return String(value).split('.')[1]?.length ?? 0
}

/** One goal line of a merge, kept as it is or standing for several combined. */
export type GoalMergeOutput<T> =
	| { kind: 'keep'; item: T }
	| { kind: 'combined'; goal: Goal; items: T[] }

/**
 * The goal lines left when task lines merge into the survivor (`groups` are
 * the lines' goals in note order, `survivor` the index of the surviving
 * line). A metric found on one line only moves over unchanged; the same
 * metric and unit on several lines combines with its rule, achieved and
 * targets alike (targets with different directions: the survivor's, else the
 * first, wins); different units stay apart. Time goals: two minimums add up,
 * otherwise the survivor's wins. Malformed lines (`goalOf` null) are kept.
 * The survivor's lines come first, then the others in note order; a combined
 * goal takes the place of its first line.
 */
export function planGoalMerge<T>(
	groups: T[][],
	survivor: number,
	goalOf: (item: T) => Goal | null,
	ruleOf: AggregationRuleOf = defaultAggregationRuleOf
): GoalMergeOutput<T>[] {
	type Entry = { item: T; group: number; goal: Goal | null }
	const entry = (item: T, group: number): Entry => ({
		item,
		group,
		goal: goalOf(item),
	})
	const ordered = [
		...(groups[survivor] ?? []).map((item) => entry(item, survivor)),
		...groups.flatMap((items, group) =>
			group === survivor ? [] : items.map((item) => entry(item, group))
		),
	]
	const buckets = new Map<string, { group: number; item: T; goal: Goal }[]>()
	for (const { item, group, goal } of ordered) {
		if (!goal) continue
		const key = bucketKey(goal)
		buckets.set(key, [...(buckets.get(key) ?? []), { item, group, goal }])
	}

	const outputs: GoalMergeOutput<T>[] = []
	const done = new Set<string>()
	for (const { item, goal } of ordered) {
		const key = goal ? bucketKey(goal) : null
		const bucket = key === null ? [] : (buckets.get(key) ?? [])
		if (key === null || new Set(bucket.map((b) => b.group)).size < 2) {
			outputs.push({ kind: 'keep', item })
			continue
		}
		if (done.has(key)) continue
		done.add(key)
		// A stable sort: within a line, goals keep their order.
		const inNoteOrder = [...bucket].sort((a, b) => a.group - b.group)
		outputs.push({
			kind: 'combined',
			goal: combineGoals(
				inNoteOrder.map((b) => b.goal),
				bucket.map((b) => b.goal),
				ruleOf
			),
			items: bucket.map((b) => b.item),
		})
	}
	return outputs
}

function bucketKey(goal: Goal): string {
	return goal.kind === 'time'
		? 'time'
		: JSON.stringify([goal.metric, goal.unit])
}

/** Goals of one bucket: `goals` in note order, `priority` survivor first. */
function combineGoals(
	goals: Goal[],
	priority: Goal[],
	ruleOf: AggregationRuleOf
): Goal {
	const first = priority[0]!
	if (first.kind === 'time') {
		const times = goals.filter((goal): goal is TimeGoal => goal.kind === 'time')
		return times.every((goal) => !goal.atMost)
			? {
					kind: 'time',
					atMost: false,
					minutes: times.reduce((sum, goal) => sum + goal.minutes, 0),
				}
			: first
	}
	const metrics = goals.filter(
		(goal): goal is MetricGoal => goal.kind === 'metric'
	)
	const rule = ruleOf(first.metric, first.unit)
	const withTarget = metrics.filter((goal) => goal.target !== null)
	const sameDirection = withTarget.every(
		(goal) => goal.atMost === withTarget[0]?.atMost
	)
	const leading = priority.find(
		(goal): goal is MetricGoal => goal.kind === 'metric' && goal.target !== null
	)
	return {
		kind: 'metric',
		metric: first.metric,
		unit: first.unit,
		achieved: aggregate(
			rule,
			metrics.flatMap((goal) => (goal.achieved === null ? [] : [goal.achieved]))
		),
		target: sameDirection
			? aggregate(
					rule,
					withTarget.flatMap((goal) => goal.target ?? [])
				)
			: (leading?.target ?? null),
		atMost: sameDirection
			? (withTarget[0]?.atMost ?? false)
			: (leading?.atMost ?? false),
		decimalComma: metrics.some((goal) => goal.decimalComma),
	}
}
