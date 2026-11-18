import type { ClockKey, ClockTimes, Task } from 'types/tasks'
import { taskMinutes } from './aggregate'
import { isSameDay } from './dailyNotes'
import { TaskNote } from './note'
import { NOTICE_ICON, noticeTask } from './noticeText'
import { describeDay } from './overnight'
import { formatHoursMinutes, getMinutesBetween } from './time'
import { describeClockEdit, formatTimeOfDay } from './timeline'

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

/** The note a stop happened in, as the write left it. */
export type StopContext = { tasks: Task[]; day: Date; now: Date }

/**
 * `🔀 Switched from "Chores" (25m of 1h 10m today) to "Email" at 10:42`,
 * `⏹️ Stopped "Chores" (…) at 10:42`, `▶️ Started "Email" at 10:42`; null
 * when no clock started or stopped. A stopped clock tells how long it ran
 * out of its task's time that day.
 */
export function describeHandOff(
	handOff: HandOff,
	context: StopContext
): string | null {
	const started = handOff.started
		.map((clock) => noticeTask(clock.taskName))
		.join(', ')
	const first = handOff.stopped[0]
	if (!first) {
		const [clock] = handOff.started
		if (!clock) return null
		return `${NOTICE_ICON.start} Started ${started} at ${formatTimeOfDay(clock.start)}`
	}
	if (handOff.started.length === 0)
		return describeStops(handOff.stopped, context)
	const stopped = handOff.stopped
		.map((clock) => describeStoppedClock(clock, context))
		.join(', ')
	return `${NOTICE_ICON.switch} Switched from ${stopped} to ${started} at ${formatTimeOfDay(first.end)}`
}

/** `⏹️ Stopped "Chores" (25m of 1h 10m today) at 10:42`; null for none. */
export function describeStops(
	stopped: HandOff['stopped'],
	context: StopContext
): string | null {
	const [first] = stopped
	return first ? stopSentence(stopped, first.end, context) : null
}

function stopSentence(
	stopped: HandOff['stopped'],
	at: Date,
	context: StopContext
): string {
	const clocks = stopped
		.map((clock) => describeStoppedClock(clock, context))
		.join(', ')
	return `${NOTICE_ICON.stop} Stopped ${clocks} at ${formatTimeOfDay(at)}`
}

/** `"Chores" (25m of 1h 10m today)`: the clock's length, then its task's day. */
export function describeStoppedClock(
	clock: ClockKey & { end: Date },
	context: StopContext
): string {
	const task = context.tasks.find((other) => other.name === clock.taskName)
	const total = task ? taskMinutes(task, context.now) : 0
	const lasted = getMinutesBetween(clock.start, clock.end)
	return `${noticeTask(clock.taskName)} (${formatHoursMinutes(lasted)} of ${formatHoursMinutes(total)} ${dayPhrase(context.day, context.now)})`
}

function dayPhrase(day: Date, now: Date): string {
	if (isSameDay(day, now)) return 'today'
	const described = describeDay(day, now)
	return described === 'yesterday' ? described : `on ${described}`
}

/** A running clock given an end reads as its stop; other edits show both ranges. */
export function describeRetime(
	key: ClockKey,
	times: ClockTimes,
	context: StopContext
): string {
	if (key.end !== null || times.end === null) {
		return describeClockEdit(key.taskName, key, times)
	}
	const clock = { taskName: key.taskName, start: times.start, end: times.end }
	return stopSentence([clock], times.end, context)
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
