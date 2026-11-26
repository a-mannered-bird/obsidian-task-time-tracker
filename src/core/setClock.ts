import { moment } from 'obsidian'
import type { Clock, FinishedClockTimes, Task } from 'types/tasks'
import { isSameDay } from './dailyNotes'
import { addMinutes, formatHoursMinutes, getMinutesBetween } from './time'
import { formatTimeOfDay } from './timeline'
import { parseTimeOfDay } from './typedTime'

/** How long a clock set on a past day lasts until the user says otherwise. */
export const DEFAULT_CLOCK_MINUTES = 30
/** Where the first clock of a day without a start of day begins. */
const FALLBACK_START_HOUR = 8

/**
 * The times a clock set on a past note opens with: from where the note's
 * last clock ended, else its start of day, else 08:00, for half an hour.
 * Only times on the note's day count, as the fields hold times of day on
 * it; the end stops at 23:59 rather than spill into the next day.
 */
export function defaultClockTimes(
	tasks: Task[],
	day: Date,
	dayStart: Date | null
): FinishedClockTimes {
	const start =
		lastClockEnd(tasks, day) ??
		(dayStart && isSameDay(dayStart, day) ? dayStart : null) ??
		atTime(day, FALLBACK_START_HOUR, 0)
	const end = addMinutes(start, DEFAULT_CLOCK_MINUTES)
	return { start, end: isSameDay(end, day) ? end : atTime(day, 23, 59) }
}

function lastClockEnd(tasks: Task[], day: Date): Date | null {
	let last: Date | null = null
	for (const task of tasks) {
		for (const { end } of task.clocks) {
			if (end && isSameDay(end, day) && (!last || end > last)) last = end
		}
	}
	return last
}

function atTime(day: Date, hours: number, minutes: number): Date {
	return new Date(
		day.getFullYear(),
		day.getMonth(),
		day.getDate(),
		hours,
		minutes
	)
}

export type ClockField = 'start' | 'end'

/** The clock typed in the two fields, or why it cannot be added. */
export type TypedClock =
	| { times: FinishedClockTimes }
	| { error: string; fields: ClockField[] }

/**
 * The clock typed as two times of day on the note's `day`, for a task
 * holding `clocks`: the start must come before the end, and the clock may
 * not overlap one of the task's own (it would count the time twice); it
 * may touch one. A running clock counts as going on forever.
 */
export function parseClockTimes(
	startText: string,
	endText: string,
	day: Date,
	clocks: Clock[]
): TypedClock {
	const start = parseTimeOfDay(startText, day)
	const end = parseTimeOfDay(endText, day)
	if (!start && !end) {
		return { error: 'Enter a start and an end time.', fields: ['start', 'end'] }
	}
	if (!start) return { error: 'Enter a start time.', fields: ['start'] }
	if (!end) return { error: 'Enter an end time.', fields: ['end'] }
	if (end <= start) {
		return {
			error: 'The start must be before the end.',
			fields: ['start', 'end'],
		}
	}
	const overlapped = clocks.find(
		(clock) => end > clock.start && (!clock.end || start < clock.end)
	)
	if (overlapped) {
		return {
			error: `It overlaps this task's clock ${describeClock(overlapped)}.`,
			fields: ['start', 'end'],
		}
	}
	return { times: { start, end } }
}

function describeClock(clock: Clock): string {
	return clock.end
		? `${formatTimeOfDay(clock.start)}–${formatTimeOfDay(clock.end)}`
		: `running since ${formatTimeOfDay(clock.start)}`
}

/** What a valid clock adds, under the fields: `Lasts 1h 15m`. */
export function describeClockLength(times: FinishedClockTimes): string {
	return `Lasts ${formatHoursMinutes(getMinutesBetween(times.start, times.end))}`
}

/** The day the clock goes on: `On Monday, November 23.`, with its year when not this one's. */
export function describeClockDay(day: Date, now: Date): string {
	const format =
		day.getFullYear() === now.getFullYear()
			? 'dddd, MMMM D'
			: 'dddd, MMMM D, YYYY'
	return `On ${moment(day).format(format)}.`
}
