import type { Goal } from 'types/goals'
import {
	describeAchieved,
	formatGoalValue,
	goalDirection,
	goalPercent,
	streakDots,
	type GoalStatsRow,
} from './goalStats'
import {
	deltaTone,
	formatDelta,
	trendBaseline,
	type ReadyComparison,
} from './progression'
import { strong, type RichLine } from './richText'
import {
	plural,
	type StatsRow,
	type TableCell,
	type TableColumn,
} from './statsTable'

const STREAK_HELP: RichLine[] = [
	[{ text: 'One dot per day, or per week on long ranges.' }],
	[
		{
			text: 'Filled: met. Hollow: missed. Faint: no goal that day, or not over yet.',
		},
	],
]

/**
 * The Goals table of a `task-stats` block: per goal, achieved and target
 * over the days with a target (combined with the metric's rule), the share
 * reached, the days met, the streak, and a Trend column once compared, in
 * the success color when the goal's direction calls the change good.
 */
export function buildGoalsTable(
	goals: GoalStatsRow[],
	comparison: ReadyComparison | null = null
): { columns: TableColumn[]; rows: StatsRow[] } {
	const columns: TableColumn[] = [
		{ label: 'Goal' },
		{
			label: 'Achieved',
			centered: true,
			tooltip: [
				[
					{
						text: "Over the days with a target, combined with the metric's rule: added up, averaged, the last one, the lowest or the highest.",
					},
				],
			],
		},
		{ label: '%', centered: true },
		{ label: 'Days met', centered: true },
		{ label: 'Streak', centered: true, tooltip: STREAK_HELP },
	]
	if (comparison) {
		columns.push({
			label: 'Trend',
			centered: true,
			tooltip: [
				[{ text: 'Change of the achieved value against the earlier periods.' }],
			],
		})
	}
	const rows = goals.map((row) => {
		const percent = goalPercent(row)
		const dots = streakDots(row)
		const cells: TableCell[] = [
			{ text: row.title },
			{ text: describeAchieved(row) },
			{ text: percent === null ? '–' : `${percent}%` },
			{ text: `${row.daysMet} / ${row.daysWithTarget}` },
			{
				text: `${dots.filter((dot) => dot.status === 'met').length} of ${dots.length} met`,
				dots,
			},
		]
		if (comparison) cells.push(goalTrendCell(row, comparison))
		return { key: row.id, cells }
	})
	return { columns, rows }
}

/**
 * The achieved value's change against the trend baseline, the tooltip
 * giving each baseline's achieved value and days met.
 */
export function goalTrendCell(
	row: GoalStatsRow,
	comparison: ReadyComparison
): TableCell {
	const { goal } = row
	const tooltip: RichLine[] = [
		[strong(row.title)],
		[
			{
				text: `This period · ${formatGoalValue(goal, row.achieved)} · met on ${plural(row.daysMet, 'day')}`,
			},
		],
	]
	const line = (label: string, values: ReadyComparison['previous']) => {
		const before = values?.goals[row.id]
		if (!values) return
		tooltip.push([
			{
				text: before
					? `${label} · ${formatGoalValue(goal, before.achieved)} · met on ${plural(Math.round(before.daysMet), 'day')}`
					: `${label} · no such goal`,
			},
		])
	}
	line('Previous', comparison.previous)
	line(
		comparison.usual ? `Usual (${comparison.usual.label})` : 'Usual',
		comparison.usual?.values ?? null
	)

	const baseline = trendBaseline(comparison)
	const before = baseline?.values.goals[row.id]?.achieved ?? null
	if (row.achieved === null || before === null) return { text: '–', tooltip }
	const delta = goalDelta(goal, row.achieved, before)
	return {
		text: delta.text,
		tooltip,
		...(deltaTone(
			{ minutes: delta.change, percent: null },
			goalDirection(goal)
		) === 'good'
			? { tone: 'good' as const }
			: {}),
	}
}

/** `▲ 2h 00m · +12%` for a time goal, `▲ 2 km · +20%` for a metric. */
function goalDelta(
	goal: Goal,
	current: number,
	before: number
): { text: string; change: number } {
	const change = current - before
	const percent =
		before > 0 ? Math.round(((current - before) / before) * 100) : null
	if (goal.kind === 'time') {
		const minutes = Math.round(change)
		return { text: formatDelta({ minutes, percent }), change: minutes }
	}
	const decimals = Math.max(
		...[current, before].map((v) => String(v).split('.')[1]?.length ?? 0)
	)
	const rounded = Number(change.toFixed(Math.min(decimals, 2)))
	if (rounded === 0) return { text: 'No change', change: 0 }
	const amount = formatGoalValue(goal, Math.abs(rounded))
	const unit = goal.unit ? ` ${goal.unit}` : ''
	const share =
		percent === null ? '' : ` · ${rounded > 0 ? '+' : '−'}${Math.abs(percent)}%`
	return {
		text: `${rounded > 0 ? '▲' : '▼'} ${amount}${unit}${share}`,
		change: rounded,
	}
}
