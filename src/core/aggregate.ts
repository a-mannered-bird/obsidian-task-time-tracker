import type { MinutesByKey, Task } from 'types/tasks'
import { clockToInterval, intervalMinutes } from './intervals'

/** Minutes logged on a task; a running clock counts up to `now`. */
export function taskMinutes(task: Task, now: Date): number {
	return task.clocks.reduce(
		(sum, clock) => sum + intervalMinutes(clockToInterval(clock, now)),
		0
	)
}

export function totalMinutes(tasks: Task[], now: Date): number {
	return tasks.reduce((sum, task) => sum + taskMinutes(task, now), 0)
}

export function minutesByTask(tasks: Task[], now: Date): MinutesByKey {
	const result: MinutesByKey = {}
	for (const task of tasks) {
		result[task.name] = (result[task.name] ?? 0) + taskMinutes(task, now)
	}
	return result
}

/** A task's minutes count once for each of its tags. */
export function minutesByTag(tasks: Task[], now: Date): MinutesByKey {
	const result: MinutesByKey = {}
	for (const task of tasks) {
		const minutes = taskMinutes(task, now)
		for (const tag of task.tags) {
			result[tag] = (result[tag] ?? 0) + minutes
		}
	}
	return result
}

/** `[key, minutes]` entries, most minutes first. */
export function sortByMinutes(minutes: MinutesByKey): [string, number][] {
	return Object.entries(minutes).sort((a, b) => b[1] - a[1])
}
