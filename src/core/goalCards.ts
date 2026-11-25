import type { Goal, GoalLine, MetricGoal, TagGoal, TimeGoal } from 'types/goals'
import type { Task } from 'types/tasks'
import { taskMinutes } from './aggregate'
import { startOfDay } from './dailyNotes'
import { CHART_COLORS } from './chartColors'
import { formatGoal, targetOnly } from './goals'
import { NOTICE_ICON, noticeTask } from './noticeText'
import { formatTagGoal, tagCoveredMinutes } from './tagGoals'
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
	/** `Run · distance`, `Run · time`, or the tag of a tag goal. */
	title: string
	/**
	 * The tag of a tag goal (in the note's `tag_goals`), null for a task's
	 * goal line. A tag goal's key holds the tag as its task name: a task
	 * name never is a tag.
	 */
	tag: string | null
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
				tag: null,
				goal,
				achieved,
				target,
				progress: ringProgress(achieved, target, goal.atMost),
				state: cardState(achieved, target, goal.atMost, dayOver),
			}
		})
	)
}

/** A tag goal as a goal: a time goal measured on the tag's tasks. */
export function tagTimeGoal(goal: TagGoal): TimeGoal {
	return { kind: 'time', minutes: goal.minutes, atMost: goal.atMost }
}

export function tagGoalKey(tag: string): GoalKey {
	return { taskName: tag, metric: null, unit: '' }
}

/**
 * One card per tag goal of the note, measured as the time covered by the
 * tasks carrying the tag (two of them at once count once).
 */
export function tagGoalCards(
	tagGoals: TagGoal[],
	tasks: Task[],
	now: Date,
	dayOver: boolean
): GoalCard[] {
	return tagGoals.map((tagGoal) => {
		const key = tagGoalKey(tagGoal.tag)
		const achieved = tagCoveredMinutes(tasks, tagGoal.tag, now)
		return {
			key,
			id: goalKeyId(key),
			title: tagGoal.tag,
			tag: tagGoal.tag,
			goal: tagTimeGoal(tagGoal),
			achieved,
			target: tagGoal.minutes,
			progress: ringProgress(achieved, tagGoal.minutes, tagGoal.atMost),
			state: cardState(achieved, tagGoal.minutes, tagGoal.atMost, dayOver),
		}
	})
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

const GOAL_GROUPINGS = ['none', 'task', 'tag'] as const
/** How the Goals tab groups the tasks' goals. */
export type GoalGrouping = (typeof GOAL_GROUPINGS)[number]

export const GOAL_GROUPING_NAMES: Record<GoalGrouping, string> = {
	none: 'None',
	task: 'Task',
	tag: 'Tag',
}

export function isGoalGrouping(value: unknown): value is GoalGrouping {
	return GOAL_GROUPINGS.some((grouping) => grouping === value)
}

export const UNTAGGED_GROUP = 'No tag'

export type GoalCardGroup = {
	/** The task name, the tag, or null when not grouped. */
	label: string | null
	cards: GoalCard[]
	suggestions: GoalSuggestion[]
}

/**
 * The cards and suggestions in task order (note order of `tasks`), each
 * task's suggestions after its group's cards: in one group (`none`), under
 * their task, or under their task's first tag, groups in order of first
 * appearance. A group with neither cards nor suggestions is left out.
 */
export function groupGoalCards(
	tasks: Task[],
	cards: GoalCard[],
	suggestions: GoalSuggestion[],
	grouping: GoalGrouping
): GoalCardGroup[] {
	const names = [...new Set(tasks.map((task) => task.name))]
	const labelOf = (name: string): string | null => {
		if (grouping === 'none') return null
		if (grouping === 'task') return name
		const tagged = tasks.find((t) => t.name === name && t.tags.length > 0)
		return tagged?.tags[0] ?? UNTAGGED_GROUP
	}
	const groups = new Map<string | null, GoalCardGroup>()
	for (const name of names) {
		const label = labelOf(name)
		const group = groups.get(label) ?? { label, cards: [], suggestions: [] }
		group.cards.push(...cards.filter((card) => card.key.taskName === name))
		group.suggestions.push(
			...suggestions.filter((s) => s.key.taskName === name)
		)
		groups.set(label, group)
	}
	return [...groups.values()].filter(
		(group) => group.cards.length || group.suggestions.length
	)
}

export const TAG_GOALS_GROUP = 'Tags'
export const OTHER_TAG_GOALS_GROUP = 'Other tags'

/**
 * The task groups with the tag goals placed, and the group of the tag goals
 * left over (always shown, as it holds the Add tag goal card). Grouped by
 * tag, a tag goal leads the group of its tag, where the tasks' goals show
 * it what it counts; a tag with no task goal to join keeps it among the
 * other tags.
 */
export function placeTagGoals(
	groups: GoalCardGroup[],
	tagCards: GoalCard[],
	tagSuggestions: GoalSuggestion[],
	grouping: GoalGrouping
): { groups: GoalCardGroup[]; tagGroup: GoalCardGroup } {
	if (grouping !== 'tag') {
		return {
			groups,
			tagGroup: {
				label: TAG_GOALS_GROUP,
				cards: tagCards,
				suggestions: tagSuggestions,
			},
		}
	}
	const labels = new Set(groups.map((group) => group.label))
	return {
		groups: groups.map((group) => ({
			label: group.label,
			cards: [
				...tagCards.filter((card) => card.tag === group.label),
				...group.cards,
			],
			suggestions: [
				...tagSuggestions.filter((s) => s.tag === group.label),
				...group.suggestions,
			],
		})),
		tagGroup: {
			label: OTHER_TAG_GOALS_GROUP,
			cards: tagCards.filter((card) => !labels.has(card.tag)),
			suggestions: tagSuggestions.filter((s) => !labels.has(s.tag)),
		},
	}
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

/** A goal offered for a task of the note, or a tag, that has none yet. */
export type GoalSuggestion = {
	id: string
	key: GoalKey
	title: string
	/** The tag of a suggested tag goal, null for a task's goal. */
	tag: string | null
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
					tag: null,
					goal: targetOnly(goal),
				},
			]
		})
	})
}

/** The tag goals of the latest earlier day that the note lacks. */
export function tagGoalSuggestions(
	noteTagGoals: TagGoal[],
	recentTagGoals: TagGoal[]
): GoalSuggestion[] {
	const present = new Set(noteTagGoals.map((goal) => goal.tag))
	return recentTagGoals
		.filter((goal) => !present.has(goal.tag))
		.map((goal) => {
			const key = tagGoalKey(goal.tag)
			return {
				id: goalKeyId(key),
				key,
				title: goal.tag,
				tag: goal.tag,
				goal: tagTimeGoal(goal),
			}
		})
}

/** A note's suggestions: still offered, or rejected for its day. */
export type DaySuggestions = {
	offered: GoalSuggestion[]
	rejected: GoalSuggestion[]
}

/** The note's tag goals and those of the latest earlier day that had any. */
export type DayTagGoals = { note: TagGoal[]; recent: TagGoal[] }

export function daySuggestions(
	tasks: Task[],
	recentGoals: RecentGoals,
	dismissals: GoalSuggestionDismissal[],
	day: string,
	tagGoals: DayTagGoals = { note: [], recent: [] }
): DaySuggestions {
	const dismissed = dismissedOn(dismissals, day)
	const all = [
		...goalSuggestions(tasks, recentGoals),
		...tagGoalSuggestions(tagGoals.note, tagGoals.recent),
	]
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

/**
 * A task's metric goals with a target it has not reached: no result yet,
 * under an "at least" target, or over an "at most" one. Time goals are
 * left out, their result coming from the clocks.
 */
export function unmetMetricGoals(task: Task): MetricGoal[] {
	return task.goals.filter(
		(goal): goal is GoalLine & MetricGoal =>
			goal.kind === 'metric' &&
			goal.target !== null &&
			(goal.achieved === null ||
				(goal.atMost
					? goal.achieved > goal.target
					: goal.achieved < goal.target))
	)
}

/** The names of the tasks ticked in `after` that were not in `before`. */
export function newlyTicked(before: Task[], after: Task[]): string[] {
	const ticked = new Set(before.filter((t) => t.ticked).map((t) => t.name))
	return [
		...new Set(
			after.filter((t) => t.ticked && !ticked.has(t.name)).map((t) => t.name)
		),
	]
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

export function describeTagGoalSet(goal: TagGoal): string {
	return `${NOTICE_ICON.goal} Tag goal set: ${formatTagGoal(goal)}.`
}

export function describeTagGoalDeleted(goal: TagGoal): string {
	return `${NOTICE_ICON.remove} Deleted the tag goal ${formatTagGoal(goal)}.`
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
