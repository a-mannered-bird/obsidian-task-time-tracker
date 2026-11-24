import type { TagGoal } from 'types/goals'
import type { Task } from 'types/tasks'
import { readFrontmatterList, setFrontmatterList } from './frontmatter'
import { formatGoalMinutes, parseGoalDuration } from './goals'
import { intervalMinutes, mergeIntervals, tasksToIntervals } from './intervals'
import { parseTaskInput, parseTasks } from './parser'

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

/** The note's `tag_goals` entries as written, read from its text. */
function noteEntries(content: string): string[] {
	return readFrontmatterList(content, TAG_GOALS_PROPERTY) ?? []
}

/** The note's tag goals, read from its text (what the edits below see). */
export function noteTagGoals(content: string): TagGoal[] {
	return readTagGoals(noteEntries(content))
}

/**
 * The note with these tag goals set: each replaces the entry of its tag,
 * or is added after the others, which stay as written.
 */
export function setTagGoals(content: string, goals: TagGoal[]): string {
	const entries = noteEntries(content)
	for (const goal of goals) {
		const index = entries.findIndex(
			(entry) => parseTagGoal(entry)?.tag === goal.tag
		)
		if (index === -1) entries.push(formatTagGoal(goal))
		else entries[index] = formatTagGoal(goal)
	}
	return setFrontmatterList(content, TAG_GOALS_PROPERTY, entries)
}

/** The note with the tag's goal changed by `update`; null when it is gone. */
export function updateTagGoal(
	content: string,
	tag: string,
	update: (goal: TagGoal) => TagGoal
): string | null {
	const goal = noteTagGoals(content).find((g) => g.tag === tag)
	return goal ? setTagGoals(content, [update(goal)]) : null
}

/**
 * The note without the tag's goal, and without the property once empty;
 * null when it is gone.
 */
export function removeTagGoal(content: string, tag: string): string | null {
	const entries = noteEntries(content)
	const kept = entries.filter((entry) => parseTagGoal(entry)?.tag !== tag)
	if (kept.length === entries.length) return null
	return setFrontmatterList(content, TAG_GOALS_PROPERTY, kept)
}

/**
 * The time covered by the tasks carrying the tag: their clocks unioned, so
 * two of them running together count once. Running clocks count up to now.
 */
export function tagCoveredMinutes(
	tasks: Task[],
	tag: string,
	now: Date
): number {
	const tagged = tasks.filter((task) => task.tags.includes(tag))
	return mergeIntervals(tasksToIntervals(tagged, now)).reduce(
		(sum, interval) => sum + intervalMinutes(interval),
		0
	)
}

/**
 * `next` with the tag goals carried over from an earlier day when this is
 * the plugin's first write to a new note: before it, the note had neither
 * a task nor a `tag_goals` property, and the write adds a task. A template
 * that sets `tag_goals` wins, as does a note the user started by hand.
 */
export function carryTagGoals(
	before: string,
	next: string,
	recent: TagGoal[]
): string {
	if (recent.length === 0) return next
	const hasProperty = (content: string) =>
		readFrontmatterList(content, TAG_GOALS_PROPERTY) !== undefined
	const hasTasks = (content: string) =>
		parseTasks(content.split('\n')).length > 0
	if (hasProperty(before) || hasTasks(before)) return next
	if (hasProperty(next) || !hasTasks(next)) return next
	return setFrontmatterList(next, TAG_GOALS_PROPERTY, recent.map(formatTagGoal))
}
