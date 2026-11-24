import type { MinutesByKey } from 'types/tasks'
import type { TaskOverlap } from './overlap'
import {
	deltaTone,
	durationDelta,
	trendBaseline,
	trendCell,
	type GoalDirection,
	type PeriodValues,
	type ReadyComparison,
} from './progression'
import {
	goalDirection,
	timeGoalRow,
	type GoalStatsRow,
	type StreakDot,
} from './goalStats'
import { strong, type RichLine } from './richText'
import type { DayPoint, GroupBy, RangeStats } from './stats'
import { formatHoursMinutes } from './time'

export const OTHER = 'Other'

export type TableCell = {
	text: string
	tooltip?: RichLine[]
	/** A delta a goal declares good: shown in the success color. */
	tone?: 'good'
	/** A streak, one dot per day or week, shown instead of the text. */
	dots?: StreakDot[]
}

export type TableColumn = {
	label: string
	/** Right-aligned tabular numbers. */
	numeric?: boolean
	/** Centered, like the Goals table's value columns. */
	centered?: boolean
	tooltip?: RichLine[]
}

export type StatsRow = { key: string; cells: TableCell[] }

export type FooterRow = { cells: TableCell[]; emphasis?: boolean }

export type StatsTable = {
	columns: TableColumn[]
	rows: StatsRow[]
	footer: FooterRow[]
}

/** The rows kept by `top: N`, with everything below folded into Other. */
export function topRows(
	byKey: [string, number][],
	top: number | null
): [string, number][] {
	if (top === null || byKey.length <= top) return byKey
	const folded = byKey.slice(top).reduce((sum, [, minutes]) => sum + minutes, 0)
	return [...byKey.slice(0, top), [OTHER, folded]]
}

/** Whether the block shows overlap: in task mode, once two tasks ran together. */
export function showsOverlap(stats: RangeStats, groupBy: GroupBy): boolean {
	return (
		groupBy === 'task' &&
		Object.values(stats.byTask).some((task) => task.shared > 0)
	)
}

const percent = (part: number, whole: number) =>
	whole ? `${Math.round((part / whole) * 100)}%` : '0%'

const KEY_LABEL: Record<GroupBy, string> = {
	task: 'Task',
	tag: 'Tag',
	filter: 'Task / tag',
}

const SHARE_EXCESS: Record<GroupBy, string> = {
	task: 'Tasks that ran at the same time each count their full time, so shares can add up to more than 100%.',
	tag: 'A task counts for each of its tags, and tasks that ran at the same time each count their full time, so shares can add up to more than 100%.',
	filter:
		'A task counts for each entry it matches, and tasks that ran at the same time each count their full time, so shares can add up to more than 100%.',
}

/**
 * The main table of a `task-stats` block: one row per task, tag or entry,
 * with a Trend column once a comparison is ready.
 */
export function buildStatsTable(
	stats: RangeStats,
	groupBy: GroupBy,
	top: number | null,
	comparison: ReadyComparison | null = null
): StatsTable {
	const rows = topRows(stats.byKey, top)
	const withOverlap = showsOverlap(stats, groupBy)
	const kept = new Set(rows.map(([key]) => key))
	const covered = stats.coveredMinutes

	const columns: TableColumn[] = [
		{ label: KEY_LABEL[groupBy] },
		{ label: 'Time spent', numeric: true },
		{
			label: 'Share',
			numeric: true,
			tooltip: [
				[{ text: 'Share of the covered time.' }],
				[{ text: SHARE_EXCESS[groupBy] }],
			],
		},
	]
	if (withOverlap) {
		columns.push({
			label: 'Overlap',
			numeric: true,
			tooltip: [
				[{ text: "Time shared with another task, out of the task's time." }],
				[
					{
						text: 'When three tasks ran at once, the times shared with each partner add up to more than the overlap.',
					},
				],
			],
		})
	}
	if (comparison) columns.push(trendColumn(comparison))

	const tableRows = rows.map(([key, minutes]) => {
		const timeGoal =
			groupBy === 'filter' ? undefined : timeGoalRow(stats.goals, key)
		const cells: TableCell[] = [
			{ text: key },
			timeCell(minutes, timeGoal),
			{ text: percent(minutes, covered) },
		]
		if (withOverlap) {
			const overlap =
				key === OTHER
					? foldTasks(stats.byTask, kept)
					: (stats.byTask[key] ?? { minutes, shared: 0, partners: {} })
			cells.push(overlapCell(key, overlap, kept))
		}
		if (comparison) {
			const pick = (values: PeriodValues) =>
				baselineRowMinutes(values, key, kept)
			cells.push({
				...trendCell(key, minutes, pick, comparison),
				...trendTone(
					minutes,
					pick,
					comparison,
					timeGoal ? goalDirection(timeGoal.goal) : null
				),
			})
		}
		return { key, cells }
	})

	const coveredTrend = comparison
		? trendCell('Covered', covered, (values) => values.covered, comparison)
		: null
	return {
		columns,
		rows: tableRows,
		footer: footerRows(stats, rows, columns.length, coveredTrend),
	}
}

/**
 * A row's time, with its time goal's progress over the range when it has
 * one: `22h 00m · ⏱ 96%`, the numbers in the tooltip.
 */
function timeCell(
	minutes: number,
	timeGoal: GoalStatsRow | undefined
): TableCell {
	const text = formatHoursMinutes(minutes)
	if (!timeGoal?.target || timeGoal.achieved === null) return { text }
	const share = Math.round((timeGoal.achieved / timeGoal.target) * 100)
	const limit = timeGoal.goal.atMost ? 'at most ' : ''
	return {
		text: `${text} · ⏱ ${share}%`,
		tooltip: [
			[strong(timeGoal.title)],
			[
				{
					text: `${formatHoursMinutes(timeGoal.achieved)} of ${limit}${formatHoursMinutes(timeGoal.target)} on the ${plural(timeGoal.daysWithTarget, 'day')} with a time goal`,
				},
			],
			[{ text: `Met on ${plural(timeGoal.daysMet, 'day')}` }],
		],
	}
}

/** The good tone of a delta its goal declares better; none otherwise. */
export function trendTone(
	current: number,
	pick: (values: PeriodValues) => number | null,
	comparison: ReadyComparison,
	direction: GoalDirection | null
): Pick<TableCell, 'tone'> {
	const baseline = trendBaseline(comparison)
	const before = baseline ? pick(baseline.values) : null
	if (before === null) return {}
	return deltaTone(durationDelta(current, before), direction) === 'good'
		? { tone: 'good' }
		: {}
}

export function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function trendColumn(comparison: ReadyComparison): TableColumn {
	const against = comparison.usual
		? `the usual level, the ${comparison.usual.label} with logged time`
		: 'the previous period'
	return {
		label: 'Trend',
		numeric: true,
		tooltip: [
			[{ text: `Change against ${against}.` }],
			[
				{
					text: 'While a week, month or year is still running, earlier ones are cut to as many days.',
				},
			],
		],
	}
}

/** A row's minutes in a baseline; Other adds up every key not shown as a row. */
function baselineRowMinutes(
	values: PeriodValues,
	key: string,
	kept: Set<string>
): number {
	if (key !== OTHER) return values.byKey[key] ?? 0
	return Object.entries(values.byKey)
		.filter(([name]) => !kept.has(name))
		.reduce((sum, [, minutes]) => sum + minutes, 0)
}

/** The tasks folded into Other, added up; their partners are not listed. */
function foldTasks(
	byTask: Record<string, TaskOverlap>,
	kept: Set<string>
): TaskOverlap {
	const folded: TaskOverlap = { minutes: 0, shared: 0, partners: {} }
	for (const [task, overlap] of Object.entries(byTask)) {
		if (kept.has(task)) continue
		folded.minutes += overlap.minutes
		folded.shared += overlap.shared
	}
	return folded
}

function overlapCell(
	key: string,
	overlap: TaskOverlap,
	kept: Set<string>
): TableCell {
	const text = percent(overlap.shared, overlap.minutes)
	if (overlap.shared === 0) return { text }
	const summary: RichLine = [
		strong(key),
		{
			text: ` · ${formatHoursMinutes(overlap.shared)} of ${formatHoursMinutes(overlap.minutes)} shared (${text})`,
		},
	]
	const partners = foldPartners(overlap.partners, kept).map(
		([partner, minutes]): RichLine => [
			{ text: 'with ' },
			strong(partner),
			{ text: ` · ${formatHoursMinutes(minutes)}` },
		]
	)
	return { text, tooltip: [summary, ...partners] }
}

/** Partners by minutes, those not shown as rows added up into a last Other. */
export function foldPartners(
	partners: MinutesByKey,
	kept: Set<string>
): [string, number][] {
	const shown: [string, number][] = []
	let other = 0
	for (const [partner, minutes] of Object.entries(partners)) {
		if (kept.has(partner)) shown.push([partner, minutes])
		else other += minutes
	}
	shown.sort((a, b) => b[1] - a[1])
	return other ? [...shown, [OTHER, other]] : shown
}

/**
 * Reconciles the rows with the covered time: in task mode the rows minus the
 * concurrent time are exactly the covered time; tags and filter entries can
 * also count a task twice, or not at all, so only their sum is shown.
 */
function footerRows(
	stats: RangeStats,
	rows: [string, number][],
	columnCount: number,
	coveredTrend: TableCell | null
): FooterRow[] {
	const covered = stats.coveredMinutes
	const rowsTotal = rows.reduce((sum, [, minutes]) => sum + minutes, 0)
	const pad = (cells: TableCell[]) => [
		...cells,
		...Array.from({ length: columnCount - cells.length }, () => ({ text: '' })),
	]
	const coveredCells = pad([
		{ text: 'Covered' },
		{ text: formatHoursMinutes(covered) },
		{ text: '100%' },
	])
	if (coveredTrend) coveredCells[columnCount - 1] = coveredTrend
	const coveredRow: FooterRow = { cells: coveredCells, emphasis: true }
	if (rowsTotal === covered) return [coveredRow]

	const rowsLine: FooterRow = {
		cells: pad([
			{ text: 'Rows' },
			{ text: formatHoursMinutes(rowsTotal) },
			{ text: percent(rowsTotal, covered) },
		]),
	}
	if (rowsTotal !== covered + stats.concurrentMinutes) {
		return [rowsLine, coveredRow]
	}
	return [
		rowsLine,
		{
			cells: pad([
				{ text: 'Concurrent' },
				{ text: `− ${formatHoursMinutes(stats.concurrentMinutes)}` },
			]),
		},
		coveredRow,
	]
}

export type ChartDay = {
	/** Minutes per kept row key, Other included. */
	minutes: MinutesByKey
	/** Shared minutes per kept task (task mode with overlap only). */
	shared: MinutesByKey
	covered: number
	concurrent: number
}

/** One day of the chart, its keys folded like the table's rows. */
export function chartDay(
	point: DayPoint,
	kept: Set<string>,
	withShared: boolean
): ChartDay {
	const fold = (values: [string, number][]) => {
		const result: MinutesByKey = {}
		for (const [key, value] of values) {
			const slot = kept.has(key) ? key : OTHER
			result[slot] = (result[slot] ?? 0) + value
		}
		return result
	}
	return {
		minutes: fold(Object.entries(point.minutes)),
		shared: withShared
			? fold(
					Object.entries(point.byTask).map(([task, overlap]) => [
						task,
						overlap.shared,
					])
				)
			: {},
		covered: point.covered,
		concurrent: point.concurrent,
	}
}
