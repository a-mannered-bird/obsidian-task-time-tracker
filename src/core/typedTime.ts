import { moment } from 'obsidian'
import type { Task } from 'types/tasks'
import { addDays, isSameDay } from './dailyNotes'
import { describeDay } from './overnight'
import { addMinutes } from './time'
import { formatTimeOfDay } from './timeline'

/** A time the user typed, placed on a date, or why it cannot be. */
export type TypedTime = { at: Date } | { error: string }

const TIME_OF_DAY = /^(\d{1,2}):(\d{2})$/
const MINUTES = /^(-?\d+)\s*(?:m|min|mins|minutes?)?$/i
const NOT_A_TIME = 'Enter a number of minutes or a time of day.'

/** A time of day, or a count of minutes back from a reference time. */
type Typed = { hours: number; minutes: number } | { minutesBack: number }

function read(text: string): Typed | null {
	const trimmed = text.trim()
	const clock = TIME_OF_DAY.exec(trimmed)
	if (clock) {
		const hours = Number(clock[1])
		const minutes = Number(clock[2])
		return hours > 23 || minutes > 59 ? null : { hours, minutes }
	}
	const count = MINUTES.exec(trimmed)
	return count ? { minutesBack: Number(count[1]) } : null
}

function onDay(typed: { hours: number; minutes: number }, day: Date): Date {
	return new Date(
		day.getFullYear(),
		day.getMonth(),
		day.getDate(),
		typed.hours,
		typed.minutes
	)
}

/**
 * The end typed for clocks that started at `latestStart`: a time of day on
 * that day, or on the next one when that is not after the start (work past
 * midnight), or minutes before now (negative: after now), which must be
 * after the start. Like the tracking commands, it may be in the future.
 */
export function parseEndTime(
	text: string,
	latestStart: Date,
	now: Date
): TypedTime {
	return parseToggleTime(text, now, { day: latestStart, after: latestStart })
}

/**
 * The start typed for a running clock: a time of day on its start day, or
 * minutes before now (negative: after now). Like the tracking commands, it
 * may be in the future.
 */
export function parseStartTime(
	text: string,
	start: Date,
	now: Date
): TypedTime {
	return parseToggleTime(text, now, { day: start })
}

/**
 * When a tracking command toggles, typed: a time of day on `day` (the
 * reference's by default), or minutes before the reference (negative
 * minutes after it). When the toggle closes clocks, it must come after
 * `after`, the latest of their starts: a time of day that does not moves
 * to the next day (work past midnight). A toggle may be in the future.
 */
export function parseToggleTime(
	text: string,
	reference: Date,
	options: {
		day?: Date
		after?: Date | null
		afterWhat?: string
		/** Accept a time equal to `after`. */
		touching?: boolean
	} = {}
): TypedTime {
	const typed = read(text)
	if (!typed) return { error: NOT_A_TIME }
	const {
		day = reference,
		after = null,
		afterWhat = 'the start',
		touching = false,
	} = options
	const tooEarly = (at: Date, limit: Date) =>
		touching ? at < limit : at <= limit
	if ('minutesBack' in typed) {
		// Notes hold whole seconds, and a clock is found again (to undo an
		// edit) by its exact time: milliseconds of now would never match.
		const at = new Date(
			Math.floor(addMinutes(reference, -typed.minutesBack).valueOf() / 1000) *
				1000
		)
		if (after && tooEarly(at, after)) {
			const relation = touching ? 'is before' : 'is not after'
			return {
				error: `That ${relation} ${afterWhat}, ${formatTimeOfDay(after)}.`,
			}
		}
		return { at }
	}
	const at = onDay(typed, day)
	return { at: after && tooEarly(at, after) ? addDays(at, 1) : at }
}

/**
 * The start of day typed for the note of `day`: a time of day on that day,
 * or minutes before now; never after the note's end of day.
 */
export function parseDayStart(
	text: string,
	day: Date,
	dayEnd: Date | null,
	now: Date
): TypedTime {
	const parsed = parseToggleTime(text, now, { day })
	if ('at' in parsed && dayEnd && parsed.at > dayEnd) {
		return {
			error: `That is after the end of day, ${formatTimeOfDay(dayEnd)}.`,
		}
	}
	return parsed
}

/** What an end of day must come after, and how to name it to the user. */
export type DayEndFloor = { at: Date; what: string }

/**
 * The latest of the start of day and the note's clocks: a closed clock's
 * end, a running one's start (ending the day closes it). Null when the
 * note has none of them.
 */
export function dayEndFloor(
	tasks: Task[],
	dayStart: Date | null
): DayEndFloor | null {
	let floor: DayEndFloor | null = dayStart
		? { at: dayStart, what: 'the start of day' }
		: null
	for (const task of tasks) {
		for (const clock of task.clocks) {
			const mark: DayEndFloor = clock.end
				? { at: clock.end, what: 'the end of the last clock' }
				: { at: clock.start, what: 'the start of a running clock' }
			if (!floor || mark.at > floor.at) floor = mark
		}
	}
	return floor
}

/**
 * The end of day typed for the note of `day`: a time of day on that day,
 * or on the next one when it is before `floor` (a day ending past
 * midnight), or minutes before now, which must not be before `floor`.
 */
export function parseDayEnd(
	text: string,
	day: Date,
	floor: DayEndFloor | null,
	now: Date
): TypedTime {
	return parseToggleTime(text, now, {
		day,
		after: floor?.at ?? null,
		afterWhat: floor?.what,
		touching: true,
	})
}

/**
 * The time of day `minutes` before the reference, for the time field of a
 * prompt whose minutes field was edited; null until it holds whole minutes.
 */
export function timeOfDayBefore(
	minutes: string,
	reference: Date
): string | null {
	const typed = read(minutes)
	if (!typed || !('minutesBack' in typed)) return null
	return formatTimeOfDay(addMinutes(reference, -typed.minutesBack))
}

/** Whole minutes from `at` back to the reference; negative when after it. */
export function minutesBefore(at: Date, reference: Date): number {
	return Math.round((reference.valueOf() - at.valueOf()) / 60000)
}

/**
 * The date of a typed time when it is not the reference's day, which the
 * time field cannot show: `Thursday, November 13 at 00:30`, with the year
 * when it differs. Null on the reference's day.
 */
export function describeOtherDay(at: Date, reference: Date): string | null {
	if (isSameDay(at, reference)) return null
	const format =
		at.getFullYear() === reference.getFullYear()
			? 'dddd, MMMM D'
			: 'dddd, MMMM D, YYYY'
	return `${moment(at).format(format)} at ${formatTimeOfDay(at)}`
}

/**
 * When the open clock a prompt closes or moves started, as a sentence:
 * `Current clock started at 09:00.`, `Current clock started yesterday at 22:40.`
 */
export function describeStart(start: Date, now: Date): string {
	return `Current clock started ${atTime(start, now)}.`
}

/** `at 09:00`, or with its day when not the reference's: `yesterday at 22:40`. */
export function atTime(at: Date, reference: Date): string {
	const day = otherDay(at, reference)
	return `${day ? `${day} ` : ''}at ${formatTimeOfDay(at)}`
}

function otherDay(at: Date, reference: Date): string | null {
	if (isSameDay(at, reference)) return null
	return isSameDay(at, addDays(reference, 1))
		? 'tomorrow'
		: describeDay(at, reference)
}
