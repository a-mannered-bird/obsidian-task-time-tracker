import type { TagMapping } from 'types/tags'
import type { Task } from 'types/tasks'
import { parseTasks } from './parser'
import { tagEmoji } from './taskPicker'
import { diffTags, retagTaskLines } from './taskEdits'

/**
 * What the tag slot before a tracker row's name shows: one emoji, that of
 * the first tag having one, or a hash icon when none has.
 */
export type TagSlot = {
	emoji: string | null
	/**
	 * The other tags, counted in a badge over the emoji; 0 without an
	 * emoji, as the hash icon then stands for every tag.
	 */
	badge: number
	tagged: boolean
	/** The tooltip: `#work #admin`, or "Add tags". */
	label: string
}

export function tagSlot(tags: string[], mappings: TagMapping[]): TagSlot {
	const unique = [...new Set(tags)]
	const emoji = tagEmoji(unique, mappings)
	return {
		emoji,
		badge: emoji ? unique.length - 1 : 0,
		tagged: unique.length > 0,
		label: unique.length > 0 ? unique.join(' ') : 'Add tags',
	}
}

/**
 * Tags offered when adding one to a line: the note's own first (the day's
 * vocabulary, in note order), then the rest of the vault's, leaving out
 * those the line already has.
 */
export function tagSuggestions(
	noteTasks: Task[],
	vaultTags: string[],
	lineTags: string[]
): string[] {
	const noteTags = noteTasks.flatMap((task) => task.tags)
	return [...new Set([...noteTags, ...vaultTags])].filter(
		(tag) => !lineTags.includes(tag)
	)
}

/**
 * Give the task's line in this note exactly `tags`, leaving every other
 * note alone (tag drift across notes is Manage tasks' business). Null when
 * the task is no longer in the note.
 */
export function setNoteTaskTags(
	content: string,
	name: string,
	tags: string[]
): string | null {
	const lines = parseTasks(content.split('\n')).filter(
		(task) => task.name === name
	)
	if (lines.length === 0) return null
	const current = [...new Set(lines.flatMap((task) => task.tags))]
	return retagTaskLines(content, [name], diffTags(current, tags)).content
}
