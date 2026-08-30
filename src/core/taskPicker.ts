import type { TagMapping } from 'types/tags'
import type { Task } from 'types/tasks'
import { getLastEnd, isRunning } from './note'
import type { VaultTaskInfo } from './vaultTaskIndex'

/** Vault entries rendered besides the note's own tasks (display cap only). */
export const VAULT_DISPLAY_LIMIT = 50

/** A picker suggestion: a task of the note, or a vault-wide aggregate. */
export type PickerEntry =
	| { kind: 'note'; task: Task }
	| { kind: 'vault'; info: VaultTaskInfo }

/**
 * Note tasks in picker order, then the vault entries whose name is not among
 * them (`vaultInfos` keeps its order, usage-first from the index). Callers
 * must already have dropped vault entries present elsewhere in the note, e.g.
 * running tasks a switch excludes from the candidates.
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

function tagEmoji(tags: string[], mappings: TagMapping[]): string | null {
	for (const mapping of mappings) {
		if (mapping.emoji && tags.includes(mapping.tag)) return mapping.emoji
	}
	return null
}
