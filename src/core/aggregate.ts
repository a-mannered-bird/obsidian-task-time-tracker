import type { MinutesByKey, Task } from 'types/tasks'
import { clockToInterval, intervalMinutes } from './intervals'

/** Minutes logged on a task; a running clock counts up to `now`. */
export function taskMinutes(task: Task, now: Date): number {
	return task.clocks.reduce(
		(sum, clock) => sum + intervalMinutes(clockToInterval(clock, now)),
		0
	)
}

/** `[key, minutes]` entries, most minutes first. */
export function sortByMinutes(minutes: MinutesByKey): [string, number][] {
	return Object.entries(minutes).sort((a, b) => b[1] - a[1])
}
