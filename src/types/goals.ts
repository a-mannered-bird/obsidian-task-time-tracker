/**
 * A time goal: no metric name, the task's clocks are its achieved value.
 * `atMost` for a limit (`<30m`), otherwise a minimum.
 */
export type TimeGoal = { kind: 'time'; minutes: number; atMost: boolean }

/** A named metric with an optional achieved value and target, unit as written. */
export type MetricGoal = {
	kind: 'metric'
	metric: string
	achieved: number | null
	target: number | null
	/** Whether the target is a limit (`/<80`); false without a target. */
	atMost: boolean
	unit: string
	/** The line wrote its numbers with a decimal comma (`5,2`). */
	decimalComma: boolean
}

export type Goal = TimeGoal | MetricGoal

/** A goal read from a `[goal::…]` line under a task. */
export type GoalLine = Goal & { lineIndex: number }

/** A `[goal::…]` line under a task that does not read as a goal. */
export type MalformedGoalLine = {
	lineIndex: number
	/** What is written between `[goal::` and `]`. */
	text: string
	/** How to fix it, as shown in the task manager. */
	problem: string
}

/** One entry of a note's `tag_goals` list: time only. */
export type TagGoal = { tag: string; minutes: number; atMost: boolean }

/** How a metric's values combine (merging task lines, stats over days). */
export type AggregationRule = 'sum' | 'average' | 'last' | 'min' | 'max'
