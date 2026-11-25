import type { AggregationRule, Goal, TagGoal } from 'types/goals'
import type { TagMapping } from 'types/tags'
import type { Task } from 'types/tasks'
import { tagColor } from './chartColors'
import { addDays, startOfDay } from './dailyNotes'
import {
	defaultGoalColor,
	goalCards,
	goalLabel,
	METRIC_GOAL_EMOJI,
	tagGoalCards,
	TIME_GOAL_EMOJI,
	type GoalCard,
} from './goalCards'
import {
	formatGoalNumber,
	formatTargetField,
	goalKeyId,
	type GoalKey,
} from './goalEdits'
import {
	defaultAggregation,
	formatGoalMinutes,
	type AggregationRuleOf,
} from './goals'

/** What the user set for one metric; unset fields keep their default. */
export type MetricSetting = {
	color?: string
	emoji?: string
	rule?: AggregationRule
}

/**
 * Per-metric settings keyed by metric name; time goals are under their
 * label, `time`, and have no rule.
 */
export type MetricSettings = Record<string, MetricSetting>

export const AGGREGATION_RULES: AggregationRule[] = [
	'sum',
	'average',
	'last',
	'min',
	'max',
]

export const AGGREGATION_RULE_NAMES: Record<AggregationRule, string> = {
	sum: 'Sum',
	average: 'Average',
	last: 'Last',
	min: 'Minimum',
	max: 'Maximum',
}

export function isAggregationRule(value: unknown): value is AggregationRule {
	return AGGREGATION_RULES.some((rule) => rule === value)
}

export function goalColor(goal: Goal, settings: MetricSettings): string {
	return settings[goalLabel(goal)]?.color ?? defaultGoalColor(goal)
}

export function goalEmoji(goal: Goal, settings: MetricSettings): string {
	return (
		settings[goalLabel(goal)]?.emoji ??
		(goal.kind === 'time' ? TIME_GOAL_EMOJI : METRIC_GOAL_EMOJI)
	)
}

/**
 * A card's color: a tag goal's is its tag's (from the tag mappings), a
 * task goal's its metric's; the metric default otherwise.
 */
export function cardColor(
	card: Pick<GoalCard, 'goal' | 'tag'>,
	settings: MetricSettings,
	mappings: TagMapping[]
): string {
	return (
		(card.tag === null ? undefined : tagColor(card.tag, mappings)) ??
		goalColor(card.goal, settings)
	)
}

/** A card's emoji: a tag goal's is its tag's, if mapped; else its metric's. */
export function cardEmoji(
	card: Pick<GoalCard, 'goal' | 'tag'>,
	settings: MetricSettings,
	mappings: TagMapping[]
): string {
	const tagEmoji =
		card.tag === null
			? undefined
			: mappings.find((mapping) => mapping.tag === card.tag)?.emoji
	return tagEmoji || goalEmoji(card.goal, settings)
}

/** Each metric's rule: the one set, else the default for its unit. */
export function metricRuleOf(settings: MetricSettings): AggregationRuleOf {
	return (metric, unit) => settings[metric]?.rule ?? defaultAggregation(unit)
}

export const DONE_BADGES = [
	'none',
	'tick',
	'star',
	'rosette',
	'stamp',
	'trophy',
	'flame',
] as const

export type DoneBadge = (typeof DONE_BADGES)[number]

export const DONE_BADGE_NAMES: Record<DoneBadge, string> = {
	none: 'None',
	tick: 'Tick',
	star: 'Gold star',
	rosette: 'Rosette',
	stamp: 'Rubber stamp',
	trophy: 'Trophy',
	flame: 'Streak flame',
}

export function isDoneBadge(value: unknown): value is DoneBadge {
	return DONE_BADGES.some((badge) => badge === value)
}

/** A badge setting: a badge, or one picked at random per goal and day. */
export type DoneBadgeChoice = DoneBadge | 'random'

export const DONE_BADGE_CHOICES: DoneBadgeChoice[] = [...DONE_BADGES, 'random']

export const DONE_BADGE_CHOICE_NAMES: Record<DoneBadgeChoice, string> = {
	...DONE_BADGE_NAMES,
	random: 'Random',
}

export function isDoneBadgeChoice(value: unknown): value is DoneBadgeChoice {
	return value === 'random' || isDoneBadge(value)
}

/** A goal's own badge, overriding the "Done badge" setting. */
export type GoalBadge = { key: GoalKey; badge: DoneBadgeChoice }

/** The goal's own badge choice; null when it follows the setting. */
export function ownGoalBadge(
	goalBadges: GoalBadge[],
	key: GoalKey
): DoneBadgeChoice | null {
	const id = goalKeyId(key)
	return goalBadges.find((entry) => goalKeyId(entry.key) === id)?.badge ?? null
}

/**
 * The badge a done card shows. Random picks any badge but None, the same
 * all day for that goal; the rubber stamp only when it has texts to show.
 */
export function doneBadgeOf(
	choice: DoneBadgeChoice,
	day: string,
	goalId: string,
	stampTexts: string[]
): DoneBadge {
	if (choice !== 'random') return choice
	const badges = DONE_BADGES.filter(
		(badge) => badge !== 'none' && (badge !== 'stamp' || stampTexts.length)
	)
	return dailyPick(badges, `${day}\nbadge\n${goalId}`) ?? 'tick'
}

/** Whether some badge setting can show the rubber stamp, needing texts. */
export function usesStamps(choices: DoneBadgeChoice[]): boolean {
	return choices.some((choice) => choice === 'stamp' || choice === 'random')
}

export const DEFAULT_STAMP_TEXTS = ['Done', 'Nailed it', 'Approved']

/** The "Stamp texts" setting as typed: one per line, blank lines ignored. */
export function parseStampTexts(text: string): string[] {
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
}

/**
 * The stamp text of a card: picked at random among the texts, but the same
 * all day for that goal, so a card does not change its stamp on each render.
 */
export function stampText(
	texts: string[],
	day: string,
	goalId: string
): string | null {
	return dailyPick(texts, `${day}\n${goalId}`)
}

/** One of the items, chosen by hashing the seed: random-looking but stable. */
function dailyPick<T>(items: readonly T[], seed: string): T | null {
	if (items.length === 0) return null
	let hash = 0
	for (const char of seed) {
		hash = (hash * 31 + char.charCodeAt(0)) >>> 0
	}
	return items[hash % items.length]!
}

/** A task's line on one day, as the index holds it. */
export type DatedTask = { date: Date; task: Task }

/**
 * The days in a row, ending on `day`, the goal was met; a day it was set
 * and missed ends the streak. A day without the task or the goal ends it
 * too, unless `skipMissing` (the goal's own setting): then only the days
 * holding the goal count. Past days are judged as over ("at most" goals
 * that stayed under count).
 */
export function goalStreak(
	occurrences: DatedTask[],
	key: GoalKey,
	day: Date,
	skipMissing = false
): number {
	const id = goalKeyId(key)
	const metOn = new Map<number, boolean>()
	for (const { date, task } of occurrences) {
		const time = startOfDay(date).valueOf()
		if (time > startOfDay(day).valueOf() || metOn.get(time)) continue
		// A past day's clocks are closed, so `now` only matters for today's.
		const card = goalCards([task], new Date(), true).find((c) => c.id === id)
		if (card) metOn.set(time, card.state === 'done')
	}
	return countStreak(metOn, day, skipMissing)
}

/** A note as the index holds it, for the tag goals' streaks. */
export type DatedNote = { date: Date; tasks: Task[]; tagGoals: TagGoal[] }

/** goalStreak for a tag goal, met on a day by its covered time. */
export function tagGoalStreak(
	notes: DatedNote[],
	tag: string,
	day: Date,
	skipMissing = false
): number {
	const metOn = new Map<number, boolean>()
	for (const note of notes) {
		const time = startOfDay(note.date).valueOf()
		if (time > startOfDay(day).valueOf()) continue
		const goals = note.tagGoals.filter((goal) => goal.tag === tag)
		const [card] = tagGoalCards(goals, note.tasks, new Date(), true)
		if (card) metOn.set(time, card.state === 'done')
	}
	return countStreak(metOn, day, skipMissing)
}

/** Days in a row met, back from `day`, the missing ones ending it or skipped. */
function countStreak(
	metOn: Map<number, boolean>,
	day: Date,
	skipMissing: boolean
): number {
	if (skipMissing) {
		const days = [...metOn].sort(([a], [b]) => b - a)
		const missed = days.findIndex(([, met]) => !met)
		return missed === -1 ? days.length : missed
	}
	let streak = 0
	for (
		let date = startOfDay(day);
		metOn.get(date.valueOf());
		date = addDays(date, -1)
	) {
		streak++
	}
	return streak
}

/** Bars shown on a tracker row; the rest fold into "+n". */
export const MAX_GOAL_BARS = 3

export function goalBars(cards: GoalCard[]): {
	shown: GoalCard[]
	folded: GoalCard[]
} {
	return {
		shown: cards.slice(0, MAX_GOAL_BARS),
		folded: cards.slice(MAX_GOAL_BARS),
	}
}

/** A bar's tooltip: `🏃 distance · 8 / 10 km · 80%`. */
export function describeGoalBar(card: GoalCard, emoji: string): string {
	const { goal } = card
	const achieved =
		goal.kind === 'time'
			? formatGoalMinutes(card.achieved ?? 0)
			: formatGoalNumber(card.achieved ?? 0, goal.decimalComma)
	const limit = formatTargetField(goal) || '…'
	const unit = goal.kind === 'metric' && goal.unit ? ` ${goal.unit}` : ''
	const share = Math.round(card.progress * 100)
	const status =
		card.state === 'over'
			? 'over the limit'
			: goal.atMost
				? `${share}% left`
				: `${share}%`
	return `${emoji} ${goalLabel(goal)} · ${achieved} / ${limit}${unit} · ${status}`
}
