import type { Goal } from 'types/goals'
import type { Task } from 'types/tasks'
import { taskMinutes } from './aggregate'
import { startOfDay } from './dailyNotes'
import { CHART_COLORS } from './chartColors'
import { formatGoal, targetOnly } from './goals'
import { NOTICE_ICON, noticeTask } from './noticeText'
import {
	formatTargetField,
	goalKey,
	goalKeyId,
	type GoalKey,
} from './goalEdits'

/**
 * Open while under way; done once reached (an "at most" goal only when the
 * day is over and it stayed under); over as soon as an "at most" goal is
 * exceeded.
 */
export type GoalCardState = 'open' | 'done' | 'over'

export type GoalCard = {
	key: GoalKey
	id: string
	/** `Run · distance`, `Run · time`. */
	title: string
	goal: Goal
	/** Minutes for a time goal (from the clocks), else the recorded value. */
	achieved: number | null
	target: number | null
	/**
	 * How full the ring is, 0 to 1: the share of the target reached, or for
	 * an "at most" goal the share of the limit still left.
	 */
	progress: number
	state: GoalCardState
}

export const TIME_GOAL_LABEL = 'time'
export const TIME_GOAL_EMOJI = '⏱'
/** Until per-metric emojis are set in the settings. */
export const METRIC_GOAL_EMOJI = '🎯'

/** The goal's name on a card or in a list: its metric, or `time`. */
export function goalLabel(goal: Goal): string {
	return goal.kind === 'time' ? TIME_GOAL_LABEL : goal.metric
}

/**
 * One card per goal line of the note's tasks, in note order. `dayOver`
 * says whether "at most" goals can be judged: the note's day has ended.
 */
export function goalCards(
	tasks: Task[],
	now: Date,
	dayOver: boolean
): GoalCard[] {
	return tasks.flatMap((task) =>
		task.goals.map((goal) => {
			const key = goalKey(task.name, goal)
			const achieved =
				goal.kind === 'time' ? taskMinutes(task, now) : goal.achieved
			const target = goal.kind === 'time' ? goal.minutes : goal.target
			return {
				key,
				id: goalKeyId(key),
				title: `${task.name} · ${goalLabel(goal)}`,
				goal,
				achieved,
				target,
				progress: ringProgress(achieved, target, goal.atMost),
				state: cardState(achieved, target, goal.atMost, dayOver),
			}
		})
	)
}

function ringProgress(
	achieved: number | null,
	target: number | null,
	atMost: boolean
): number {
	if (!target) return 0
	const used = Math.min(1, (achieved ?? 0) / target)
	return atMost ? 1 - used : used
}

/** What the ring shows, for screen readers. */
export function describeRing(card: GoalCard): string {
	const share = Math.round(card.progress * 100)
	if (card.state === 'over') return 'Over the limit'
	if (card.goal.atMost) {
		return card.state === 'done'
			? 'Stayed within the limit, done'
			: `${share}% of the limit left`
	}
	return card.state === 'done'
		? `${share}% of the target, done`
		: `${share}% of the target`
}

function cardState(
	achieved: number | null,
	target: number | null,
	atMost: boolean,
	dayOver: boolean
): GoalCardState {
	if (target === null) return 'open'
	if (atMost) {
		if ((achieved ?? 0) > target) return 'over'
		return dayOver ? 'done' : 'open'
	}
	return achieved !== null && achieved >= target ? 'done' : 'open'
}

export type GoalCardGroup = {
	taskName: string
	cards: GoalCard[]
	suggestions: GoalSuggestion[]
}

/**
 * The cards and suggestions under their task, tasks in note order
 * (`taskNames`); a task with neither has no group.
 */
export function groupGoalCards(
	taskNames: string[],
	cards: GoalCard[],
	suggestions: GoalSuggestion[]
): GoalCardGroup[] {
	return [...new Set(taskNames)].flatMap((taskName) => {
		const group = {
			taskName,
			cards: cards.filter((card) => card.key.taskName === taskName),
			suggestions: suggestions.filter((s) => s.key.taskName === taskName),
		}
		return group.cards.length || group.suggestions.length ? [group] : []
	})
}

/**
 * Until per-metric colors are set in the settings, a goal's color is
 * picked from its metric name, so it stays the same from day to day.
 */
export function defaultGoalColor(goal: Goal): string {
	const name = goalLabel(goal)
	let hash = 0
	for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
	return CHART_COLORS[hash % CHART_COLORS.length]!
}

/** A goal offered for a task of the note that has none yet. */
export type GoalSuggestion = {
	id: string
	key: GoalKey
	title: string
	/** Targets only. */
	goal: Goal
}

/** The goals a task last had before a day, and that day. */
export type RecentGoals = (name: string) => { date: Date; goals: Goal[] } | null

/**
 * For every task of the note, the targets of its most recent goals whose
 * metric (or time goal) none of its lines in the note has yet.
 */
export function goalSuggestions(
	tasks: Task[],
	recentGoals: RecentGoals
): GoalSuggestion[] {
	const names = [...new Set(tasks.map((task) => task.name))]
	return names.flatMap((name) => {
		const recent = recentGoals(name)
		if (!recent) return []
		const present = new Set(
			tasks
				.filter((task) => task.name === name)
				.flatMap((task) => task.goals.map(goalLabel))
		)
		return recent.goals.flatMap((goal) => {
			if (present.has(goalLabel(goal))) return []
			const key = goalKey(name, goal)
			return [
				{
					id: goalKeyId(key),
					key,
					title: `${name} · ${goalLabel(goal)}`,
					goal: targetOnly(goal),
				},
			]
		})
	})
}

/** A note's suggestions: still offered, or rejected for its day. */
export type DaySuggestions = {
	offered: GoalSuggestion[]
	rejected: GoalSuggestion[]
}

export function daySuggestions(
	tasks: Task[],
	recentGoals: RecentGoals,
	dismissals: GoalSuggestionDismissal[],
	day: string
): DaySuggestions {
	const dismissed = dismissedOn(dismissals, day)
	const all = goalSuggestions(tasks, recentGoals)
	return {
		offered: all.filter((s) => !dismissed.has(s.id)),
		rejected: all.filter((s) => dismissed.has(s.id)),
	}
}

/** A dismissed suggestion: for one note's day (`YYYY-MM-DD`), kept a week. */
export type GoalSuggestionDismissal = GoalKey & { day: string }

export const DISMISSALS_KEPT_DAYS = 7

/** The dismissals of the note's day, as ids. */
export function dismissedOn(
	dismissals: GoalSuggestionDismissal[],
	day: string
): Set<string> {
	return new Set(dismissals.filter((entry) => entry.day === day).map(goalKeyId))
}

/** The dismissals still worth keeping: days less than a week before today. */
export function pruneDismissals(
	dismissals: GoalSuggestionDismissal[],
	today: string
): GoalSuggestionDismissal[] {
	const limit = new Date(`${today}T00:00:00`)
	limit.setDate(limit.getDate() - DISMISSALS_KEPT_DAYS)
	return dismissals.filter(
		(entry) => new Date(`${entry.day}T00:00:00`) >= limit
	)
}

/** The dismissals without those of the day (`YYYY-MM-DD`). */
export function restoreDismissals(
	dismissals: GoalSuggestionDismissal[],
	day: string
): GoalSuggestionDismissal[] {
	return dismissals.filter((entry) => entry.day !== day)
}

/** The metric targets of the note still without a result. */
export function missingResults(tasks: Task[]): string[] {
	return tasks.flatMap((task) =>
		task.goals
			.filter(
				(goal) =>
					goal.kind === 'metric' &&
					goal.target !== null &&
					goal.achieved === null
			)
			.map((goal) => `${task.name} · ${goalLabel(goal)}`)
	)
}

/** End day's warning above the targets without a result. */
export const MISSING_RESULTS_MESSAGE =
	'No results entered for the following goals:'

/** A suggestion's line under the ring: `/ 50 reviews`, `1h`. */
export function describeSuggestedTarget(goal: Goal): string {
	if (goal.kind === 'time') return formatTargetField(goal)
	return `/ ${formatTargetField(goal)} ${goal.unit}`.trim()
}

/** `"Run" · distance /10 km`: a task's goal line in a notice. */
function noticeGoal(taskName: string, goal: Goal): string {
	return `${noticeTask(taskName)} · ${formatGoal(goal)}`
}

export function describeGoalSet(taskName: string, goal: Goal): string {
	return `${NOTICE_ICON.goal} Goal set: ${noticeGoal(taskName, goal)}.`
}

export function describeGoalRecorded(taskName: string, goal: Goal): string {
	return `${NOTICE_ICON.goal} Recorded ${noticeGoal(taskName, goal)}.`
}

export function describeGoalDeleted(taskName: string, goal: Goal): string {
	return `${NOTICE_ICON.remove} Deleted the goal ${noticeGoal(taskName, goal)}.`
}

export function describeGoalsAdded(count: number): string {
	return `${NOTICE_ICON.goal} ${count} goal${count === 1 ? '' : 's'} added to this day.`
}

function suggestions(count: number): string {
	return `${count} goal suggestion${count === 1 ? '' : 's'}`
}

export function describeSuggestionsRejected(count: number): string {
	return `${NOTICE_ICON.remove} ${suggestions(count)} rejected for this day.`
}

export function describeSuggestionsReset(count: number): string {
	return `${NOTICE_ICON.undone} ${suggestions(count)} brought back for this day.`
}

export const NO_SUGGESTION_TO_ACCEPT = `${NOTICE_ICON.info} No goal suggestion to accept for this day.`
export const NO_SUGGESTION_TO_REJECT = `${NOTICE_ICON.info} No goal suggestion to reject for this day.`
export const NO_SUGGESTION_TO_RESET = `${NOTICE_ICON.info} No rejected goal suggestion for this day.`

/**
 * Whether "at most" goals can be judged: the note's day has an end of day,
 * or is before today.
 */
export function isDayOver(
	day: { date: Date; dayEnd: Date | null },
	now: Date
): boolean {
	return day.dayEnd !== null || startOfDay(day.date) < startOfDay(now)
}
