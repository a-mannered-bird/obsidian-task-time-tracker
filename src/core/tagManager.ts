import { tagCoveredMinutes } from './tagGoals'
import type { IndexedNote } from './vaultTaskIndex'

/** Aggregate of one tag over every daily note, for the Tags tab. */
export type TagInfo = {
	tag: string
	/** Task names carrying the tag on at least one line. */
	taskCount: number
	/** Notes with the tag on a task line or in their tag goals. */
	noteCount: number
	/** The most recent of those notes; null for a mapped tag no note uses. */
	lastUsed: Date | null
	/** Covered time of the tag's tasks, summed over the notes. */
	totalMinutes: number
}

export type TagSortKey = 'notes' | 'tag' | 'tasks' | 'lastUsed' | 'total'

/**
 * One row per tag used in a note (task lines and tag goals) or mapped in
 * the settings, most used first.
 */
export function tagInfos(
	notes: IndexedNote[],
	mappedTags: string[],
	now: Date
): TagInfo[] {
	const infos = new Map<string, TagInfo>()
	const tasks = new Map<string, Set<string>>()
	const infoOf = (tag: string) => {
		let info = infos.get(tag)
		if (!info) {
			info = {
				tag,
				taskCount: 0,
				noteCount: 0,
				lastUsed: null,
				totalMinutes: 0,
			}
			infos.set(tag, info)
		}
		return info
	}
	for (const note of notes) {
		const noteTags = new Set([
			...note.tasks.flatMap((task) => task.tags),
			...note.tagGoals.map((goal) => goal.tag),
		])
		for (const tag of noteTags) {
			const info = infoOf(tag)
			info.noteCount++
			if (!info.lastUsed || note.date > info.lastUsed) info.lastUsed = note.date
			info.totalMinutes += tagCoveredMinutes(note.tasks, tag, now)
		}
		for (const task of note.tasks) {
			for (const tag of task.tags) {
				const names = tasks.get(tag) ?? new Set<string>()
				names.add(task.name)
				tasks.set(tag, names)
			}
		}
	}
	for (const tag of mappedTags) infoOf(tag)
	for (const [tag, names] of tasks) infoOf(tag).taskCount = names.size
	return sortTagInfos([...infos.values()], 'notes')
}

/** Tags containing the query, case folded; the leading `#` is optional. */
export function filterTagInfos(infos: TagInfo[], query: string): TagInfo[] {
	const needle = query.trim().toLowerCase()
	if (!needle) return infos
	return infos.filter((info) => info.tag.toLowerCase().includes(needle))
}

/**
 * Sort for the Tags tab. `ascending` flips the natural direction of the
 * key: counts, total and last used biggest/newest first, tags alphabetical.
 * Ties fall back to the tag, so the order is stable.
 */
export function sortTagInfos(
	infos: TagInfo[],
	key: TagSortKey,
	ascending = key === 'tag'
): TagInfo[] {
	const direction = ascending ? 1 : -1
	return [...infos].sort(
		(a, b) => direction * compare(a, b, key) || a.tag.localeCompare(b.tag)
	)
}

function compare(a: TagInfo, b: TagInfo, key: TagSortKey): number {
	switch (key) {
		case 'notes':
			return a.noteCount - b.noteCount
		case 'tag':
			return a.tag.localeCompare(b.tag)
		case 'tasks':
			return a.taskCount - b.taskCount
		case 'lastUsed':
			return (a.lastUsed?.valueOf() ?? 0) - (b.lastUsed?.valueOf() ?? 0)
		case 'total':
			return a.totalMinutes - b.totalMinutes
	}
}
