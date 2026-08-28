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

/**
 * Minutes per filter entry: a task name entry counts that task, a tag entry
 * counts every task carrying the tag. A task matching several entries is
 * counted once per entry; entries matching nothing are omitted.
 */
export function minutesByFilterEntry(
	tasks: Task[],
	entries: string[],
	now: Date
): MinutesByKey {
	const result: MinutesByKey = {}
	for (const entry of entries) {
		for (const task of tasks) {
			if (task.name !== entry && !task.tags.includes(entry)) continue
			result[entry] = (result[entry] ?? 0) + taskMinutes(task, now)
		}
	}
	return result
}

/** `[key, minutes]` entries, most minutes first. */
export function sortByMinutes(minutes: MinutesByKey): [string, number][] {
	return Object.entries(minutes).sort((a, b) => b[1] - a[1])
}
