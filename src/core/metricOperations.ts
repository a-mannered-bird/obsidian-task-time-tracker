import type { Goal, GoalLine } from 'types/goals'
import type { Task } from 'types/tasks'
import {
	runBulkEdit,
	type BulkEditReport,
	type BulkEditVault,
} from './bulkEdit'
import { countCombinedGoalLines } from './consolidate'
import { TIME_GOAL_LABEL } from './goalCards'
import {
	formatGoal,
	formatGoalLine,
	parseGoal,
	planGoalMerge,
	type AggregationRuleOf,
} from './goals'
import { getIndent, parseTasks } from './parser'
import type { VaultTaskIndex } from './vaultTaskIndex'

/** A vault-wide edit of the metric goal lines, as the Metrics tab runs it. */
export type MetricOperation =
	| {
			/** Rename (one source) or merge: the sources become the target. */
			kind: 'consolidate'
			sources: string[]
			target: string
			ruleOf: AggregationRuleOf
	  }
	| { kind: 'delete'; metrics: string[] }
	| {
			/** The unit text replaced, the values kept as written. */
			kind: 'changeUnit'
			metric: string
			fromUnits: string[]
			toUnit: string
	  }

/** One goal line rewritten, or removed (`goal` null). */
type GoalLineEdit = { lineIndex: number; goal: Goal | null }

type TaskPlan = {
	edits: GoalLineEdit[]
	/** Goal lines folded into one line with another's (see planGoalMerge). */
	combinedGoalLines: number
}

export type MetricEditResult = {
	content: string
	changed: boolean
	/** Goal lines rewritten or removed. */
	changedGoalLines: number
	combinedGoalLines: number
}

/**
 * Why the text cannot name a metric, or null when it can: it must read back
 * as the same metric once written in a goal line, and `time` is the time
 * goals' own name.
 */
export function metricNameProblem(name: string): string | null {
	const trimmed = name.trim()
	if (!trimmed) return 'Write a metric name'
	if (trimmed === TIME_GOAL_LABEL)
		return `"${TIME_GOAL_LABEL}" names the time goals`
	const problem = 'A metric name cannot contain a colon, a slash or brackets'
	// Brackets would end the `[goal::…]` field early; the parser never sees them.
	if (/[[\]]/.test(trimmed)) return problem
	const sample: Goal = {
		kind: 'metric',
		metric: trimmed,
		achieved: 1,
		target: 2,
		atMost: false,
		unit: 'u',
		decimalComma: false,
	}
	const parsed = parseGoal(formatGoal(sample))
	return 'goal' in parsed &&
		parsed.goal.kind === 'metric' &&
		parsed.goal.metric === trimmed
		? null
		: problem
}

/** The note with the operation applied to every task's goal lines. */
export function editMetricsInNote(
	content: string,
	operation: MetricOperation
): MetricEditResult {
	const lines = content.split('\n')
	const edits: GoalLineEdit[] = []
	let combinedGoalLines = 0
	for (const task of parseTasks(lines)) {
		const plan = planTask(task, operation)
		edits.push(...plan.edits)
		combinedGoalLines += plan.combinedGoalLines
	}
	if (edits.length === 0) {
		return {
			content,
			changed: false,
			changedGoalLines: 0,
			combinedGoalLines: 0,
		}
	}
	// From the bottom up, so a removed line does not shift the ones above.
	for (const { lineIndex, goal } of [...edits].sort(
		(a, b) => b.lineIndex - a.lineIndex
	)) {
		if (goal === null) {
			lines.splice(lineIndex, 1)
		} else {
			lines[lineIndex] = formatGoalLine(goal, getIndent(lines[lineIndex]!))
		}
	}
	return {
		content: lines.join('\n'),
		changed: true,
		changedGoalLines: edits.length,
		combinedGoalLines,
	}
}

function planTask(task: Task, operation: MetricOperation): TaskPlan {
	switch (operation.kind) {
		case 'consolidate':
			return planConsolidation(task.goals, operation)
		case 'delete': {
			const metrics = new Set(operation.metrics)
			return {
				edits: task.goals
					.filter((goal) => goal.kind === 'metric' && metrics.has(goal.metric))
					.map((goal) => ({ lineIndex: goal.lineIndex, goal: null })),
				combinedGoalLines: 0,
			}
		}
		case 'changeUnit': {
			const { metric, fromUnits, toUnit } = operation
			return {
				edits: task.goals.flatMap((goal) =>
					goal.kind === 'metric' &&
					goal.metric === metric &&
					goal.unit !== toUnit &&
					fromUnits.includes(goal.unit)
						? [{ lineIndex: goal.lineIndex, goal: { ...goal, unit: toUnit } }]
						: []
				),
				combinedGoalLines: 0,
			}
		}
	}
}

/**
 * The task's goal lines of the sources renamed to the target. Where the
 * task line holds several of the metrics in the same unit, they combine as a
 * task merge combines them, with the target's rule: the target's own line
 * survives in place, else the first in the note; the others are removed.
 */
function planConsolidation(
	goals: GoalLine[],
	{ sources, target, ruleOf }: Extract<MetricOperation, { kind: 'consolidate' }>
): TaskPlan {
	const involved = (metric: string) =>
		metric === target || sources.includes(metric)
	const byMetric = new Map<string, GoalLine[]>()
	for (const goal of goals) {
		if (goal.kind !== 'metric' || !involved(goal.metric)) continue
		byMetric.set(goal.metric, [...(byMetric.get(goal.metric) ?? []), goal])
	}
	if (![...byMetric.keys()].some((metric) => metric !== target)) {
		return { edits: [], combinedGoalLines: 0 }
	}
	// One group per metric, as one per task line in a task merge, so two
	// lines of the same metric (left apart until now) stay apart.
	const groups = [
		byMetric.get(target) ?? [],
		...[...byMetric]
			.filter(([metric]) => metric !== target)
			.map(([, lines]) => lines),
	]
	const plan = planGoalMerge(groups, 0, (line) => renamed(line, target), ruleOf)
	const edits = plan.flatMap((output): GoalLineEdit[] => {
		if (output.kind === 'keep') {
			const { item } = output
			return item.kind === 'metric' && item.metric !== target
				? [{ lineIndex: item.lineIndex, goal: renamed(item, target) }]
				: []
		}
		const [first, ...rest] = output.items
		return [
			{ lineIndex: first!.lineIndex, goal: output.goal },
			...rest.map((item) => ({ lineIndex: item.lineIndex, goal: null })),
		]
	})
	return { edits, combinedGoalLines: countCombinedGoalLines(plan) }
}

function renamed(goal: GoalLine, metric: string): Goal {
	return goal.kind === 'metric' ? { ...goal, metric } : goal
}

/** What an operation touches, from the index alone. */
export type MetricEditPreview = {
	notes: number
	goalLines: number
	/** Goal lines combined with another line's, and the notes holding them. */
	combinedGoalLines: number
	notesCombiningGoals: number
}

export function previewMetricEdit(
	index: VaultTaskIndex,
	operation: MetricOperation
): MetricEditPreview {
	const preview: MetricEditPreview = {
		notes: 0,
		goalLines: 0,
		combinedGoalLines: 0,
		notesCombiningGoals: 0,
	}
	for (const note of index.notes()) {
		const plans = note.tasks.map((task) => planTask(task, operation))
		const goalLines = plans.reduce((sum, plan) => sum + plan.edits.length, 0)
		if (goalLines === 0) continue
		const combined = plans.reduce(
			(sum, plan) => sum + plan.combinedGoalLines,
			0
		)
		preview.notes++
		preview.goalLines += goalLines
		preview.combinedGoalLines += combined
		if (combined > 0) preview.notesCombiningGoals++
	}
	return preview
}

/** Apply the operation to every daily note it touches, oldest first. */
export function editMetricsInVault(
	vault: BulkEditVault,
	index: VaultTaskIndex,
	operation: MetricOperation,
	onProgress?: (done: number, total: number) => void
): Promise<BulkEditReport<MetricEditResult>> {
	const paths = index
		.notes()
		.filter((note) =>
			note.tasks.some((task) => planTask(task, operation).edits.length > 0)
		)
		.sort((a, b) => a.date.valueOf() - b.date.valueOf())
		.map((note) => note.path)
	return runBulkEdit(
		vault,
		paths,
		(content) => editMetricsInNote(content, operation),
		onProgress
	)
}
