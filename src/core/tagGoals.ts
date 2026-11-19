import type { TagGoal } from 'types/goals'
import { formatGoalMinutes, parseGoalDuration } from './goals'
import { parseTaskInput } from './parser'

export const TAG_GOALS_PROPERTY = 'tag_goals'

/** One `tag_goals` entry, `#work 6h` or `#leisure <2h`; null when malformed. */
export function parseTagGoal(entry: string): TagGoal | null {
	const match = /^\s*(\S+)\s+(.+)$/.exec(entry)
	if (!match) return null
	const { name, tags } = parseTaskInput(match[1]!)
	const duration = parseGoalDuration(match[2]!.trim())
	if (name !== '' || tags.length !== 1 || !duration) return null
	return { tag: tags[0]!, ...duration }
}

/**
 * The tag goals of a note's `tag_goals` property, as Obsidian reads it: a
 * list of strings (a single string is taken as a list of one). Malformed
 * entries are skipped.
 */
export function readTagGoals(value: unknown): TagGoal[] {
	const entries: unknown[] = Array.isArray(value) ? value : [value]
	return entries.flatMap((entry) => {
		const goal = typeof entry === 'string' ? parseTagGoal(entry) : null
		return goal ? [goal] : []
	})
}

/** A `tag_goals` entry as the plugin writes it. */
export function formatTagGoal(goal: TagGoal): string {
	return `${goal.tag} ${goal.atMost ? '<' : ''}${formatGoalMinutes(goal.minutes)}`
}
