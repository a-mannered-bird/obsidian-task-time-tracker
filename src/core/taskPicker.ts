import type { SearchMatchPart, SearchResult } from 'obsidian'
import type { TagMapping } from 'types/tags'
import type { Task } from 'types/tasks'
import { getLastEnd, isRunning } from './note'
import { parseTaskInput } from './parser'
import { taskChoice, type TaskChoice } from './toggle'
import type { VaultTaskInfo } from './vaultTaskIndex'

/** Vault entries rendered besides the note's own tasks (display cap only). */
export const VAULT_DISPLAY_LIMIT = 50

/** A picker suggestion: a task of the note, or a vault-wide aggregate. */
export type PickerEntry =
	| { kind: 'note'; task: Task }
	| { kind: 'vault'; info: VaultTaskInfo }

/** Vault suggestions, split by the hide flags of the management panel. */
export type VaultPickerEntries = {
	visible: VaultTaskInfo[]
	/** Only offered when the query names one exactly (see resurfacedEntry). */
	hidden: VaultTaskInfo[]
}

/**
 * The vault entries without the tasks the note has, named anywhere in it
 * and not only among the offered tasks (a switch leaves the running ones
 * out): picking such an entry would add a twin of the note's task.
 */
export function withoutNoteTasks(
	entries: VaultPickerEntries,
	noteNames: Iterable<string>
): VaultPickerEntries {
	const inNote = new Set(noteNames)
	const keep = (info: VaultTaskInfo) => !inNote.has(info.name)
	return {
		visible: entries.visible.filter(keep),
		hidden: entries.hidden.filter(keep),
	}
}

/** A picker row: a task of the note, another note's, or one to create. */
export type TaskSuggestion<Match> =
	| { kind: 'note'; task: Task; match: Match | null }
	| { kind: 'vault'; info: VaultTaskInfo; match: Match | null }
	| { kind: 'create'; name: string; tags: string[] }

export type SuggestionRequest<Match> = {
	query: string
	/** The note's tasks offered. */
	tasks: Task[]
	/**
	 * Every task name of the note, offered or not: neither the vault rows
	 * nor the create row may offer a twin of one left out of `tasks`.
	 */
	noteNames: Iterable<string>
	/** Null while the index loads or when vault tasks are off. */
	vault: VaultPickerEntries | null
	/** Scores a task name against the query; null when it does not match. */
	match: (text: string) => Match | null
	/** Other notes' tasks shown at most (resurfaced one aside). */
	otherLimit: number
	/** Whether a query naming no task becomes a create row. */
	offersCreate: boolean
}

/**
 * The rows of both task pickers (the tracker's bar and the modal), in the
 * order shown: the note's tasks in picker order (sortForPicker), then the
 * other notes' (usage-first from the index), each group ranked by match
 * score once something is typed — today's tasks come first however well a
 * vault task scores. Last, a hidden task the query names exactly, or else
 * an offer to create the typed task when it names none.
 */
export function taskSuggestions<Match extends { score: number }>(
	request: SuggestionRequest<Match>
): TaskSuggestion<Match>[] {
	const { query, vault, match } = request
	const typed = query.trim() !== ''
	const noteNames = new Set(request.noteNames)
	const ranked = <T>(items: T[], name: (item: T) => string) => {
		if (!typed) return items.map((item) => ({ item, match: null }))
		return items
			.map((item) => ({ item, match: match(name(item)) }))
			.filter(
				(entry): entry is { item: T; match: Match } => entry.match !== null
			)
			.sort((a, b) => b.match.score - a.match.score)
	}

	const { visible, hidden } = withoutNoteTasks(
		vault ?? { visible: [], hidden: [] },
		noteNames
	)
	const resurfaced = typed ? resurfacedEntry(query, hidden) : null
	const created =
		typed && request.offersCreate
			? createEntryFromQuery(query, [
					...noteNames,
					...visible.map((info) => info.name),
					...hidden.map((info) => info.name),
				])
			: null

	return [
		...ranked(sortForPicker(request.tasks), (task) => task.name).map(
			({ item, match }) => ({ kind: 'note' as const, task: item, match })
		),
		...ranked(visible, (info) => info.name)
			.slice(0, request.otherLimit)
			.map(({ item, match }) => ({
				kind: 'vault' as const,
				info: item,
				match,
			})),
		...(resurfaced
			? [{ kind: 'vault' as const, info: resurfaced, match: null }]
			: []),
		...(created ? [{ kind: 'create' as const, ...created }] : []),
	]
}

/** The text of a row, the name prefixed by an emoji for tasks. */
export function suggestionLabel(
	row: TaskSuggestion<unknown>,
	mappings: TagMapping[]
): string {
	if (row.kind === 'create') {
		return `➕ Create "${[row.name, ...row.tags].join(' ')}"`
	}
	return entryLabel(row, mappings)
}

/** `running` for a running task of the note, the note count of a vault one. */
export function suggestionMeta(row: TaskSuggestion<unknown>): string | null {
	if (row.kind === 'note') return isRunning(row.task) ? 'running' : null
	if (row.kind === 'vault') {
		const count = row.info.noteCount
		return `${count} note${count === 1 ? '' : 's'}`
	}
	return null
}

/** The task a row stands for; a vault or created task is not running. */
export function suggestionChoice(row: TaskSuggestion<unknown>): TaskChoice {
	if (row.kind === 'note') return taskChoice(row.task)
	if (row.kind === 'vault') {
		return { name: row.info.name, tags: row.info.tags, running: false }
	}
	return { name: row.name, tags: row.tags, running: false }
}

export function suggestionGroup(row: TaskSuggestion<unknown>): RowGroup {
	return row.kind
}

type TextSearch = (text: string) => SearchResult | null

/**
 * Search that matches each whitespace-separated word of the query on its
 * own, so the words may appear in any order in the text. Every word must
 * match; the scores add up and the highlights are unioned. `prepareWord`
 * is the single-word matcher (Obsidian's fuzzy search in the picker).
 */
export function prepareWordSearch(
	query: string,
	prepareWord: (word: string) => TextSearch
): TextSearch {
	const searches = query.split(/\s+/).filter(Boolean).map(prepareWord)
	return (text) => {
		let score = 0
		const matches: SearchMatchPart[] = []
		for (const search of searches) {
			const result = search(text)
			if (!result) return null
			score += result.score
			matches.push(...result.matches)
		}
		return { score, matches: unionRanges(matches) }
	}
}

/** Sorted ranges with the overlapping and touching ones merged. */
function unionRanges(ranges: SearchMatchPart[]): SearchMatchPart[] {
	const union: SearchMatchPart[] = []
	for (const [start, end] of [...ranges].sort((a, b) => a[0] - b[0])) {
		const last = union[union.length - 1]
		if (last && start <= last[1]) last[1] = Math.max(last[1], end)
		else union.push([start, end])
	}
	return union
}

/**
 * Task the picker offers to create from the typed query, or null when the
 * text names an existing task. The name comparison is case-insensitive so a
 * casing slip cannot spawn a twin task; tags typed in the query become the
 * new task's tags and never block the offer.
 */
export function createEntryFromQuery(
	query: string,
	existingNames: Iterable<string>
): { name: string; tags: string[] } | null {
	const { name, tags } = parseTaskInput(query)
	if (!name) return null
	const known = new Set<string>()
	for (const existing of existingNames) known.add(existing.toLowerCase())
	return known.has(name.toLowerCase()) ? null : { name, tags }
}

/**
 * Hidden vault task named exactly (case-insensitively) by the typed query,
 * or null. Hiding must never cause the picker to create a twin of a task it
 * knows about, so an exact match resurfaces the task as a suggestion.
 */
export function resurfacedEntry(
	query: string,
	hidden: VaultTaskInfo[]
): VaultTaskInfo | null {
	const name = parseTaskInput(query).name.toLowerCase()
	if (!name) return null
	return hidden.find((info) => info.name.toLowerCase() === name) ?? null
}

/**
 * Picker order: running tasks first, then unticked before ticked, then the
 * most recently worked on. Does not mutate the input.
 */
export function sortForPicker(tasks: Task[]): Task[] {
	return [...tasks].sort((a, b) => {
		const runningDiff = Number(isRunning(b)) - Number(isRunning(a))
		if (runningDiff !== 0) return runningDiff
		const tickedDiff = Number(a.ticked) - Number(b.ticked)
		if (tickedDiff !== 0) return tickedDiff
		return (getLastEnd(b)?.valueOf() ?? 0) - (getLastEnd(a)?.valueOf() ?? 0)
	})
}

/**
 * Label shown in the picker: a status emoji (running, ticked) or the emoji of
 * the first tag that has one in the mappings, followed by the task name.
 */
export function pickerLabel(task: Task, mappings: TagMapping[]): string {
	const emoji = statusEmoji(task) ?? tagEmoji(task.tags, mappings)
	return emoji ? `${emoji} ${task.name}` : task.name
}

/** pickerLabel for either entry kind; vault entries have no status emoji. */
export function entryLabel(entry: PickerEntry, mappings: TagMapping[]): string {
	if (entry.kind === 'note') return pickerLabel(entry.task, mappings)
	const emoji = tagEmoji(entry.info.tags, mappings)
	return emoji ? `${emoji} ${entry.info.name}` : entry.info.name
}

function statusEmoji(task: Task): string | null {
	if (isRunning(task)) return '⏳'
	if (task.ticked) return '✅'
	return null
}

/** Emoji of the first of the tags that has one in the mappings. */
export function tagEmoji(
	tags: string[],
	mappings: TagMapping[]
): string | null {
	for (const mapping of mappings) {
		if (mapping.emoji && tags.includes(mapping.tag)) return mapping.emoji
	}
	return null
}

/** What a picker row belongs to, for its group heading. */
export type RowGroup = 'note' | 'vault' | 'create'

/** Shown above a row: a group heading, or a separator before the create row. */
export type GroupBreak = { heading: string } | { separator: true }

/**
 * The breaks above each row, by index: a heading where the note's tasks
 * and the other notes' begin, a separator before the create row.
 */
export function groupBreaks(
	groups: RowGroup[],
	noteHeading: string
): Map<number, GroupBreak> {
	const breaks = new Map<number, GroupBreak>()
	groups.forEach((group, index) => {
		if (index > 0 && groups[index - 1] === group) return
		if (group === 'note') breaks.set(index, { heading: noteHeading })
		else if (group === 'vault') breaks.set(index, { heading: 'Other notes' })
		else if (index > 0) breaks.set(index, { separator: true })
	})
	return breaks
}
