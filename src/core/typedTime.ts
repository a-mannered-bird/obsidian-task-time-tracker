import type { Task } from 'types/tasks'
import { addDays } from './dailyNotes'
import { describeDay } from './overnight'
import { addMinutes, formatHoursMinutes, getMinutesBetween } from './time'
import { formatTimeOfDay } from './timeline'

/** A time the user typed, placed on a date, or why it cannot be. */
export type TypedTime = { at: Date } | { error: string }

/**
 * Every time prompt takes either form in the same field, so the
 * placeholder shows one of each and the description says what they mean.
 */
export const TIME_PLACEHOLDER = '14:30 or 15'

/** The sentence every time prompt's description ends with. */
export function timeInputHelp(reference: 'now' | Date = 'now'): string {
	const relative =
		reference === 'now'
			? 'minutes ago (15)'
			: `minutes before ${formatTimeOfDay(reference)} (15)`
	return `Type a time of day (14:30) or a number of ${relative}; negative minutes are in the future.`
}

const TIME_OF_DAY = /^(\d{1,2}):(\d{2})$/
const MINUTES = /^(-?\d+)\s*(?:m|min|mins|minutes?)?$/i
const NOT_A_TIME = 'Enter a time of day like 14:30, or minutes ago like 15.'

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
		const at = addMinutes(reference, -typed.minutesBack)
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
 * The time a prompt would set, shown under the field as the user types:
 * `14:15 · 15m ago`, `23:15 yesterday · 8h 45m ago`, `09:00 Monday`, `now`.
 */
export function describeTypedTime(at: Date, now: Date): string {
	const minutes = Math.round(getMinutesBetween(at, now))
	if (minutes === 0) return `${formatTimeOfDay(at)} · now`
	const days = Math.round(
		(onDay({ hours: 0, minutes: 0 }, at).valueOf() -
			onDay({ hours: 0, minutes: 0 }, now).valueOf()) /
			(24 * 60 * 60 * 1000)
	)
	// Hours ago stop helping past a day: the day itself says it.
	if (Math.abs(days) > 1)
		return `${formatTimeOfDay(at)} ${describeDay(at, now)}`
	const day = days === -1 ? ' yesterday' : days === 1 ? ' tomorrow' : ''
	const distance = formatHoursMinutes(Math.abs(minutes))
	const relative = minutes > 0 ? `${distance} ago` : `in ${distance}`
	return `${formatTimeOfDay(at)}${day} · ${relative}`
}
