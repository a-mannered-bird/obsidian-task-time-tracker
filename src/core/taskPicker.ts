import type { SearchMatchPart, SearchResult } from 'obsidian'
import type { TagMapping } from 'types/tags'
import type { Task } from 'types/tasks'
import { getLastEnd, isRunning } from './note'
import { parseTaskInput } from './parser'
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

/**
 * Note tasks in picker order, then the vault entries whose name is not among
 * them (`vaultInfos` keeps its order, usage-first from the index). Callers
 * must already have dropped vault entries present elsewhere in the note
 * (withoutNoteTasks).
 */
export function buildPickerEntries(
	noteTasks: Task[],
	vaultInfos: VaultTaskInfo[]
): PickerEntry[] {
	const noteNames = new Set(noteTasks.map((task) => task.name))
	return [
		...sortForPicker(noteTasks).map((task) => ({
			kind: 'note' as const,
			task,
		})),
		...vaultInfos
			.filter((info) => !noteNames.has(info.name))
			.map((info) => ({ kind: 'vault' as const, info })),
	]
}

/**
 * Matches of the note's own tasks before the vault ones, each group keeping
 * its order (the fuzzy ranking while typing): today's tasks are what the
 * user most likely means, however well a vault task scores.
 */
export function noteMatchesFirst<Match extends { item: PickerEntry }>(
	matches: Match[]
): Match[] {
	const rank = (match: Match) => (match.item.kind === 'note' ? 0 : 1)
	return [...matches].sort((a, b) => rank(a) - rank(b))
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
