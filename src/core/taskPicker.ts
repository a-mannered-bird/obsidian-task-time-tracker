import type { TagMapping } from 'types/tags'
import type { Task } from 'types/tasks'
import { getLastEnd, isRunning } from './note'

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
	const emoji = statusEmoji(task) ?? tagEmoji(task, mappings)
	return emoji ? `${emoji} ${task.name}` : task.name
}

function statusEmoji(task: Task): string | null {
	if (isRunning(task)) return '⏳'
	if (task.ticked) return '✅'
	return null
}

function tagEmoji(task: Task, mappings: TagMapping[]): string | null {
	for (const mapping of mappings) {
		if (mapping.emoji && task.tags.includes(mapping.tag)) return mapping.emoji
	}
	return null
}
