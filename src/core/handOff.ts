import type { ClockKey, Task } from 'types/tasks'
import { TaskNote } from './note'
import { formatTimeOfDay } from './timeline'

/**
 * What one tracker action did to the clocks: those it stopped (with the
 * time they stopped at) and those it started. Fixing that time afterwards
 * moves both, so a switch stays a clean hand-off.
 */
export type HandOff = {
	stopped: (ClockKey & { end: Date })[]
	started: ClockKey[]
}

const clockId = (taskName: string, start: Date) =>
	`${taskName}|${start.valueOf()}`

/**
 * The clocks running in `before` and closed in `after`, and the new running
 * ones. A running clock moved to another task (migrated) keeps its start:
 * it is no new start.
 */
export function clockChanges(before: Task[], after: Task[]): HandOff {
	const runningBefore = new Set(
		before.flatMap((task) =>
			task.clocks
				.filter((clock) => clock.end === null)
				.map((clock) => clockId(task.name, clock.start))
		)
	)
	const known = new Set(
		before.flatMap((task) =>
			task.clocks.map((clock) => clockId(task.name, clock.start))
		)
	)
	const kept = new Set(
		after.flatMap((task) =>
			task.clocks.map((clock) => clockId(task.name, clock.start))
		)
	)
	const vanishedStarts = new Set(
		before.flatMap((task) =>
			task.clocks
				.filter((clock) => !kept.has(clockId(task.name, clock.start)))
				.map((clock) => clock.start.valueOf())
		)
	)
	const stopped: HandOff['stopped'] = []
	const started: ClockKey[] = []
	for (const task of after) {
		for (const { start, end } of task.clocks) {
			const id = clockId(task.name, start)
			if (end && runningBefore.has(id)) {
				stopped.push({ taskName: task.name, start, end })
			} else if (
				!end &&
				!known.has(id) &&
				!vanishedStarts.has(start.valueOf())
			) {
				started.push({ taskName: task.name, start, end: null })
			}
		}
	}
	return { stopped, started }
}

/**
 * `Switched from Chores to Email at 10:42`, `Stopped Chores at 10:42`,
 * `Started Email at 10:42`; null when no clock started or stopped.
 */
export function describeHandOff(handOff: HandOff): string | null {
	const names = (clocks: ClockKey[]) =>
		clocks.map((clock) => clock.taskName).join(', ')
	const first = handOff.stopped[0]
	if (!first) {
		const started = handOff.started[0]
		if (!started) return null
		return `Started ${names(handOff.started)} at ${formatTimeOfDay(started.start)}`
	}
	const at = formatTimeOfDay(first.end)
	if (handOff.started.length === 0)
		return `Stopped ${names(handOff.stopped)} at ${at}`
	return `Switched from ${names(handOff.stopped)} to ${names(handOff.started)} at ${at}`
}

/**
 * The note with the hand-off moved to `at`: the stopped clocks end there,
 * the started ones begin there. Null when one of them is gone or no longer
 * as the action left it.
 */
export function moveHandOff(
	content: string,
	handOff: HandOff,
	at: Date
): string | null {
	const note = new TaskNote(content)
	for (const key of handOff.stopped) {
		const clock = note.findClock(key)
		if (!clock) return null
		note.setClockTimes(clock, { start: clock.start, end: at })
	}
	for (const key of handOff.started) {
		const clock = note.findClock(key)
		if (!clock) return null
		note.setClockTimes(clock, { start: at, end: null })
	}
	return note.toString()
}
