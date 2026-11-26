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
 * The goals reached since `before`. A card new since then counts as open
 * before, so a goal set already reached counts too. An "at most" goal is
 * reached only from open, by its day ending under the limit: one going from
 * over to done had its limit raised (or was added on a day already over),
 * which is no achievement.
 */
export function cardsReached(before: GoalStates, cards: GoalCard[]): string[] {
	return cards
		.filter((card) => {
			if (card.state !== 'done') return false
			const was = before.get(card.id)
			return card.goal.atMost ? was === 'open' : was !== 'done'
		})
		.map((card) => card.id)
}

/** The "at most" goals that went over their limit since `before`. */
export function cardsWentOver(before: GoalStates, cards: GoalCard[]): string[] {
	return cards
		.filter((card) => card.state === 'over' && before.get(card.id) !== 'over')
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
	if (cardsWentOver(before, cards).length) return 'over'
	if (cardsReached(before, cards).length) return 'reached'
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
