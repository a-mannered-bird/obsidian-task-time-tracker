import type { MinutesByKey } from 'types/tasks'
import type { TaskOverlap } from './overlap'
import { strong, type RichLine } from './richText'
import type { DayPoint, GroupBy, RangeStats } from './stats'
import { formatHoursMinutes } from './time'

export const OTHER = 'Other'

export type TableCell = { text: string; tooltip?: RichLine[] }

export type TableColumn = {
	label: string
	numeric?: boolean
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

/** The main table of a `task-stats` block: one row per task, tag or entry. */
export function buildStatsTable(
	stats: RangeStats,
	groupBy: GroupBy,
	top: number | null
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

	const tableRows = rows.map(([key, minutes]) => {
		const cells: TableCell[] = [
			{ text: key },
			{ text: formatHoursMinutes(minutes) },
			{ text: percent(minutes, covered) },
		]
		if (withOverlap) {
			const overlap =
				key === OTHER
					? foldTasks(stats.byTask, kept)
					: (stats.byTask[key] ?? { minutes, shared: 0, partners: {} })
			cells.push(overlapCell(key, overlap, kept))
		}
		return { key, cells }
	})

	return {
		columns,
		rows: tableRows,
		footer: footerRows(stats, rows, columns.length),
	}
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
	columnCount: number
): FooterRow[] {
	const covered = stats.coveredMinutes
	const rowsTotal = rows.reduce((sum, [, minutes]) => sum + minutes, 0)
	const pad = (cells: TableCell[]) => [
		...cells,
		...Array.from({ length: columnCount - cells.length }, () => ({ text: '' })),
	]
	const coveredRow: FooterRow = {
		cells: pad([
			{ text: 'Covered' },
			{ text: formatHoursMinutes(covered) },
			{ text: '100%' },
		]),
		emphasis: true,
	}
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
