import type { Goal } from 'types/goals'
import type { Task } from 'types/tasks'
import type { DailyLog } from './dailyLogs'
import { addDays } from './dailyNotes'
import { goalCards, isDayOver, tagGoalCards, type GoalCard } from './goalCards'
import { formatGoalNumber, type GoalKey } from './goalEdits'
import { aggregate, type AggregationRuleOf } from './goals'
import type { GoalDirection } from './progression'
import { startOfDay, startOfWeek } from './ranges'
import { formatHoursMinutes } from './time'

/** A goal's verdict on one day; pending while an open day may still meet it. */
export type GoalDayStatus = 'met' | 'missed' | 'pending' | 'none'

/** A goal over a range: the task's goal lines (or the tag goal) of each day. */
export type GoalStatsRow = {
	id: string
	key: GoalKey
	/** The tag of a tag goal, null for a task's goal. */
	tag: string | null
	/** `Run · distance`, `Run · time`, `#work`. */
	title: string
	/** The goal of its latest day: kind, unit and direction. */
	goal: Goal
	/**
	 * Achieved and target over the days that had a target, each combined
	 * with the metric's rule (minutes added up for time goals); achieved is
	 * null when no such day recorded a result.
	 */
	achieved: number | null
	target: number | null
	daysWithTarget: number
	daysMet: number
	/** One status per day of the range, oldest first. */
	days: { date: Date; status: GoalDayStatus }[]
}

/**
 * Every goal set on a day of the range, task goals first in order of
 * appearance, then tag goals. A block's filter keeps the goals of the tasks
 * `keepTasks` keeps, and the tag goals of the tags it lists.
 */
export function computeGoalStats(
	logs: DailyLog[],
	range: { start: Date; end: Date },
	now: Date,
	ruleOf: AggregationRuleOf,
	filter: { keepTasks: (tasks: Task[]) => Task[]; tags: string[] } = {
		keepTasks: (tasks) => tasks,
		tags: [],
	}
): GoalStatsRow[] {
	const byDay = new Map(
		logs.map((log) => [startOfDay(log.date).valueOf(), log])
	)
	const days: Date[] = []
	for (
		let date = startOfDay(range.start);
		date <= range.end;
		date = addDays(date, 1)
	) {
		days.push(date)
	}

	type Entry = { date: Date; card: GoalCard; dayOver: boolean }
	const entries = new Map<string, Entry[]>()
	for (const date of days) {
		const log = byDay.get(date.valueOf())
		if (!log) continue
		const dayOver = isDayOver(log, now)
		const tagGoals = filter.tags.length
			? log.tagGoals.filter((goal) => filter.tags.includes(goal.tag))
			: log.tagGoals
		const cards = [
			...goalCards(filter.keepTasks(log.tasks), now, dayOver),
			...tagGoalCards(tagGoals, log.tasks, now, dayOver),
		]
		const seen = new Set<string>()
		for (const card of cards) {
			// A goal set twice in a note (two lines of a task) counts once.
			if (seen.has(card.id)) continue
			seen.add(card.id)
			entries.set(card.id, [
				...(entries.get(card.id) ?? []),
				{ date, card, dayOver },
			])
		}
	}

	return [...entries.values()]
		.sort(
			(a, b) =>
				Number(a[0]!.card.tag !== null) - Number(b[0]!.card.tag !== null)
		)
		.map((list) => goalRow(list, days, ruleOf))
}

function goalRow(
	list: { date: Date; card: GoalCard; dayOver: boolean }[],
	days: Date[],
	ruleOf: AggregationRuleOf
): GoalStatsRow {
	const latest = list[list.length - 1]!.card
	const rule =
		latest.goal.kind === 'metric'
			? ruleOf(latest.goal.metric, latest.goal.unit)
			: 'sum'
	const targeted = list.filter(({ card }) => card.target !== null)
	const statusOn = new Map(
		list.map(({ date, card, dayOver }) => [
			date.valueOf(),
			dayStatus(card, dayOver),
		])
	)
	return {
		id: latest.id,
		key: latest.key,
		tag: latest.tag,
		title: latest.title,
		goal: latest.goal,
		achieved: aggregate(
			rule,
			targeted.flatMap(({ card }) =>
				card.achieved === null ? [] : [card.achieved]
			)
		),
		target: aggregate(
			rule,
			targeted.flatMap(({ card }) =>
				card.target === null ? [] : [card.target]
			)
		),
		daysWithTarget: targeted.length,
		daysMet: [...statusOn.values()].filter((status) => status === 'met').length,
		days: days.map((date) => ({
			date,
			status: statusOn.get(date.valueOf()) ?? 'none',
		})),
	}
}

function dayStatus(card: GoalCard, dayOver: boolean): GoalDayStatus {
	if (card.target === null) return 'none'
	if (card.state === 'done') return 'met'
	if (card.state === 'over') return 'missed'
	return dayOver ? 'missed' : 'pending'
}

/** Past this many days, the streak shows one dot per week. */
export const DAILY_STREAK_MAX_DAYS = 93

export type StreakDot = { label: string; status: GoalDayStatus }

/**
 * The streak cell's dots: one per day, or one per week (Monday first) on
 * long ranges; a week is missed when a day was, met when every day with
 * the goal was.
 */
export function streakDots(row: GoalStatsRow): StreakDot[] {
	const format = (date: Date) =>
		date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
	if (row.days.length <= DAILY_STREAK_MAX_DAYS) {
		return row.days.map(({ date, status }) => ({ label: format(date), status }))
	}
	const weeks = new Map<number, { start: Date; statuses: GoalDayStatus[] }>()
	for (const { date, status } of row.days) {
		const start = startOfWeek(date)
		const week = weeks.get(start.valueOf()) ?? { start, statuses: [] }
		week.statuses.push(status)
		weeks.set(start.valueOf(), week)
	}
	return [...weeks.values()].map(({ start, statuses }) => ({
		label: `Week of ${format(start)}`,
		status: statuses.includes('missed')
			? 'missed'
			: statuses.includes('pending')
				? 'pending'
				: statuses.includes('met')
					? 'met'
					: 'none',
	}))
}

/** The direction the goal of its latest day declares better. */
export function goalDirection(goal: Goal): GoalDirection {
	return goal.atMost ? 'at-most' : 'at-least'
}

/** A goal value as its row shows it: a duration, or a number with its unit. */
export function formatGoalValue(goal: Goal, value: number | null): string {
	if (value === null) return '–'
	if (goal.kind === 'time') return formatHoursMinutes(value)
	return formatGoalNumber(value, goal.decimalComma)
}

/** `8 / 10 km`, `22h 00m / <23h 00m`: the achieved and target cell. */
export function describeAchieved(row: GoalStatsRow): string {
	const { goal } = row
	const target = `${goal.atMost ? '<' : ''}${formatGoalValue(goal, row.target)}`
	const unit = goal.kind === 'metric' && goal.unit ? ` ${goal.unit}` : ''
	return `${formatGoalValue(goal, row.achieved)} / ${target}${unit}`
}

/** The share of the target reached; null without a target or a result. */
export function goalPercent(row: GoalStatsRow): number | null {
	if (!row.target || row.achieved === null) return null
	return Math.round((row.achieved / row.target) * 100)
}

/** A time goal's row for the main table's task or tag key, if any. */
export function timeGoalRow(
	rows: GoalStatsRow[],
	key: string
): GoalStatsRow | undefined {
	return rows.find(
		(row) =>
			row.goal.kind === 'time' &&
			(row.tag === null ? row.key.taskName === key : row.tag === key)
	)
}
