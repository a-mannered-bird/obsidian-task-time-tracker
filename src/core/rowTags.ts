import type { TagMapping } from 'types/tags'
import type { Task } from 'types/tasks'
import { parseTasks } from './parser'
import { diffTags, retagTaskLines } from './taskEdits'

/** What the tag slot before a tracker row's name shows. */
export type TagSlot = {
	/** Emojis of the mapped tags, in mapping order, each once. */
	emojis: string[]
	/** How many tags have no emoji. */
	others: number
	/** `#work #admin`, or "No tags". */
	label: string
}

export function tagSlot(tags: string[], mappings: TagMapping[]): TagSlot {
	const unique = [...new Set(tags)]
	const emojis: string[] = []
	const withEmoji = new Set<string>()
	for (const { tag, emoji } of mappings) {
		if (!emoji || !unique.includes(tag)) continue
		withEmoji.add(tag)
		if (!emojis.includes(emoji)) emojis.push(emoji)
	}
	return {
		emojis,
		others: unique.filter((tag) => !withEmoji.has(tag)).length,
		label: unique.length > 0 ? unique.join(' ') : 'No tags',
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
