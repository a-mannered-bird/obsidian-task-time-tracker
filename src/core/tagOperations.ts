import type { TagGoal } from 'types/goals'
import {
	runBulkEdit,
	type BulkEditReport,
	type BulkEditVault,
} from './bulkEdit'
import { readFrontmatterList, setFrontmatterList } from './frontmatter'
import { parseTasks, TAG } from './parser'
import {
	formatTagGoal,
	parseTagGoal,
	removeTagGoal,
	TAG_GOALS_PROPERTY,
} from './tagGoals'
import { TASK_PREFIX } from './taskEdits'
import type { IndexedNote, VaultTaskIndex } from './vaultTaskIndex'

export type TagEditResult = {
	content: string
	changed: boolean
	/** Task lines whose tags changed. */
	changedTaskLines: number
	/** `tag_goals` entries renamed, combined or removed. */
	changedGoals: number
}

/**
 * Rename or merge tags in one note: every source tag on a task line becomes
 * the target, kept once per line, and the sources' tag goals become the
 * target's (see combineTagGoals). Tags that merely start like a source
 * (`#work/meeting` for `#work`) are other tags and stay.
 */
export function consolidateTagsInNote(
	content: string,
	sourceTags: string[],
	targetTag: string
): TagEditResult {
	const sources = new Set(sourceTags.filter((tag) => tag !== targetTag))
	return editNote(content, sources, targetTag, (text) =>
		consolidateTagGoals(text, sources, targetTag)
	)
}

/** Remove the tags from every task line of the note and drop their goals. */
export function deleteTagsInNote(
	content: string,
	tags: string[]
): TagEditResult {
	const sources = new Set(tags)
	return editNote(content, sources, null, (text) => {
		let removed = 0
		let next = text
		for (const tag of sources) {
			const before = goalEntries(next).length
			const without = removeTagGoal(next, tag)
			if (without === null) continue
			removed += before - goalEntries(without).length
			next = without
		}
		return { content: next, changedGoals: removed }
	})
}

function editNote(
	content: string,
	sources: Set<string>,
	target: string | null,
	editGoals: (content: string) => { content: string; changedGoals: number }
): TagEditResult {
	const lines = content.split('\n')
	let changedTaskLines = 0
	for (const task of parseTasks(lines)) {
		if (!task.tags.some((tag) => sources.has(tag))) continue
		const line = lines[task.lineIndex]!
		const next = rewriteLineTags(line, sources, target)
		if (next !== line) {
			lines[task.lineIndex] = next
			changedTaskLines++
		}
	}
	const goals = editGoals(changedTaskLines ? lines.join('\n') : content)
	const changed = changedTaskLines > 0 || goals.changedGoals > 0
	return {
		content: changed ? goals.content : content,
		changed,
		changedTaskLines,
		changedGoals: goals.changedGoals,
	}
}

/**
 * The task line with each source tag replaced by the target in place (the
 * first one standing, later copies dropped), or removed when there is no
 * target; spacing tidied as the retag edit does.
 */
function rewriteLineTags(
	line: string,
	sources: Set<string>,
	target: string | null
): string {
	const match = TASK_PREFIX.exec(line)
	if (!match) return line
	const [, prefix, rest] = match
	let targetPlaced = false
	const text = rest!
		.replace(TAG, (token) => {
			const becomesTarget =
				target !== null && (token === target || sources.has(token))
			if (!becomesTarget) return sources.has(token) ? '' : token
			if (targetPlaced) return ''
			targetPlaced = true
			return target
		})
		.replace(/\s{2,}/g, ' ')
		.trim()
	return `${prefix}${text}`
}

function goalEntries(content: string): string[] {
	return readFrontmatterList(content, TAG_GOALS_PROPERTY) ?? []
}

/**
 * The note's `tag_goals` with the sources' entries folded into one target
 * entry, written where the first of them stood. Entries that cannot be read
 * stay as written.
 */
function consolidateTagGoals(
	content: string,
	sources: Set<string>,
	target: string
): { content: string; changedGoals: number } {
	const entries = goalEntries(content)
	const involved = entries.flatMap((entry, index) => {
		const goal = parseTagGoal(entry)
		return goal && (goal.tag === target || sources.has(goal.tag))
			? [{ index, goal }]
			: []
	})
	const fromSources = involved.filter(({ goal }) => goal.tag !== target)
	if (fromSources.length === 0) return { content, changedGoals: 0 }
	const combined = combineTagGoals(
		involved.map(({ goal }) => goal),
		target
	)
	const at = involved[0]!.index
	const skip = new Set(involved.map(({ index }) => index))
	const next = entries.flatMap((entry, index) => {
		if (index === at) return [formatTagGoal(combined)]
		return skip.has(index) ? [] : [entry]
	})
	return {
		content: setFrontmatterList(content, TAG_GOALS_PROPERTY, next),
		changedGoals: fromSources.length,
	}
}

/**
 * One target goal out of several tag goals of a note: the target's own
 * first, then the others in order, each added when it compares the same way
 * (`6h` + `2h`, `<6h` + `<2h`) and dropped otherwise.
 */
export function combineTagGoals(goals: TagGoal[], target: string): TagGoal {
	const ordered = [
		...goals.filter((goal) => goal.tag === target),
		...goals.filter((goal) => goal.tag !== target),
	]
	const [first, ...rest] = ordered
	if (!first) throw new Error('No tag goal to combine')
	return rest.reduce<TagGoal>(
		(sum, goal) =>
			goal.atMost === sum.atMost
				? { ...sum, minutes: sum.minutes + goal.minutes }
				: sum,
		{ ...first, tag: target }
	)
}

/** What a tag edit touches, from the index alone. */
export type TagEditPreview = {
	notes: number
	taskLines: number
	goals: number
	/** Notes where a source's goal meets another goal of the merge. */
	notesCombiningGoals: number
}

/** What renaming or merging the sources into the target touches. */
export function previewTagConsolidation(
	index: VaultTaskIndex,
	sourceTags: string[],
	targetTag: string
): TagEditPreview {
	const sources = new Set(sourceTags.filter((tag) => tag !== targetTag))
	return preview(index, sources, (note) => {
		const goals = note.tagGoals.filter(
			(goal) => goal.tag === targetTag || sources.has(goal.tag)
		)
		return goals.length > 1
	})
}

/** What deleting the tags touches. */
export function previewTagDeletion(
	index: VaultTaskIndex,
	tags: string[]
): TagEditPreview {
	return preview(index, new Set(tags), () => false)
}

function preview(
	index: VaultTaskIndex,
	sources: Set<string>,
	combinesGoals: (note: IndexedNote) => boolean
): TagEditPreview {
	const result: TagEditPreview = {
		notes: 0,
		taskLines: 0,
		goals: 0,
		notesCombiningGoals: 0,
	}
	for (const note of affectedNotes(index, sources)) {
		result.notes++
		result.taskLines += note.tasks.filter((task) =>
			task.tags.some((tag) => sources.has(tag))
		).length
		result.goals += note.tagGoals.filter((goal) => sources.has(goal.tag)).length
		if (combinesGoals(note)) result.notesCombiningGoals++
	}
	return result
}

/** Rename or merge tags across every daily note holding a source. */
export function consolidateTagsInVault(
	vault: BulkEditVault,
	index: VaultTaskIndex,
	sourceTags: string[],
	targetTag: string,
	onProgress?: (done: number, total: number) => void
): Promise<BulkEditReport<TagEditResult>> {
	const sources = new Set(sourceTags.filter((tag) => tag !== targetTag))
	return runBulkEdit(
		vault,
		affectedNotes(index, sources).map((note) => note.path),
		(content) => consolidateTagsInNote(content, sourceTags, targetTag),
		onProgress
	)
}

/** Remove the tags and their goals from every daily note. */
export function deleteTagsInVault(
	vault: BulkEditVault,
	index: VaultTaskIndex,
	tags: string[],
	onProgress?: (done: number, total: number) => void
): Promise<BulkEditReport<TagEditResult>> {
	return runBulkEdit(
		vault,
		affectedNotes(index, new Set(tags)).map((note) => note.path),
		(content) => deleteTagsInNote(content, tags),
		onProgress
	)
}

/** Notes with one of the tags on a task line or in their goals, oldest first. */
function affectedNotes(
	index: VaultTaskIndex,
	tags: Set<string>
): IndexedNote[] {
	return index
		.notes()
		.filter(
			(note) =>
				note.tasks.some((task) => task.tags.some((tag) => tags.has(tag))) ||
				note.tagGoals.some((goal) => tags.has(goal.tag))
		)
		.sort((a, b) => a.date.valueOf() - b.date.valueOf())
}
