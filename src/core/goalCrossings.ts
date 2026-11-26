import type { TagGoal } from 'types/goals'
import type { Task } from 'types/tasks'
import {
	goalCards,
	isDayOver,
	tagGoalCards,
	type GoalCard,
	type GoalCardState,
} from './goalCards'

/** Each goal's state by card id, as last shown. */
export type GoalStates = ReadonlyMap<string, GoalCardState>

export function goalStates(cards: GoalCard[]): GoalStates {
	return new Map(cards.map((card) => [card.id, card.state]))
}

/**
 * The cards that are now in `state` and were not before. A card new since
 * then counts as open before, so a goal set already reached counts too.
 */
export function cardsEntering(
	before: GoalStates,
	cards: GoalCard[],
	state: GoalCardState
): string[] {
	return cards
		.filter((card) => card.state === state && before.get(card.id) !== state)
		.map((card) => card.id)
}

/** Reached: a goal turned done. Over: an "at most" goal went over its limit. */
export type GoalSound = 'reached' | 'over'

/**
 * The one sound a change of the note's goals plays, if any: the warning wins
 * over the success when both happen at once.
 */
export function crossingSound(
	before: GoalStates,
	cards: GoalCard[]
): GoalSound | null {
	if (cardsEntering(before, cards, 'over').length) return 'over'
	if (cardsEntering(before, cards, 'done').length) return 'reached'
	return null
}

/** Every goal card of a note: its tasks' goals, then its tag goals. */
export function noteGoalCards(
	note: { date: Date; dayEnd: Date | null; tasks: Task[]; tagGoals: TagGoal[] },
	now: Date
): GoalCard[] {
	const dayOver = isDayOver(note, now)
	return [
		...goalCards(note.tasks, now, dayOver),
		...tagGoalCards(note.tagGoals, note.tasks, now, dayOver),
	]
}
