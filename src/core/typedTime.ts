import { addDays } from './dailyNotes'
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
	const typed = read(text)
	if (!typed) return { error: NOT_A_TIME }
	let at: Date
	if ('minutesBack' in typed) {
		at = addMinutes(now, -typed.minutesBack)
		if (at <= latestStart) {
			return {
				error: `That is not after the start, ${formatTimeOfDay(latestStart)}.`,
			}
		}
	} else {
		at = onDay(typed, latestStart)
		if (at <= latestStart) at = addDays(at, 1)
	}
	return { at }
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
	const typed = read(text)
	if (!typed) return { error: NOT_A_TIME }
	return {
		at:
			'minutesBack' in typed
				? addMinutes(now, -typed.minutesBack)
				: onDay(typed, start),
	}
}

/**
 * When a tracking command toggles, typed: a time of day on the reference's
 * day, or minutes before the reference (negative minutes after it). Unlike
 * a clock already written, a toggle may be set in the future.
 */
export function parseToggleTime(text: string, reference: Date): TypedTime {
	const typed = read(text)
	if (!typed) return { error: NOT_A_TIME }
	return {
		at:
			'minutesBack' in typed
				? addMinutes(reference, -typed.minutesBack)
				: onDay(typed, reference),
	}
}

/**
 * The time a prompt would set, shown under the field as the user types:
 * `14:15 · 15m ago`, `23:15 yesterday · 8h 45m ago`, `now`.
 */
export function describeTypedTime(at: Date, now: Date): string {
	const minutes = Math.round(getMinutesBetween(at, now))
	if (minutes === 0) return `${formatTimeOfDay(at)} · now`
	const days = Math.round(
		(onDay({ hours: 0, minutes: 0 }, at).valueOf() -
			onDay({ hours: 0, minutes: 0 }, now).valueOf()) /
			(24 * 60 * 60 * 1000)
	)
	const day = days === -1 ? ' yesterday' : days === 1 ? ' tomorrow' : ''
	const distance = formatHoursMinutes(Math.abs(minutes))
	const relative = minutes > 0 ? `${distance} ago` : `in ${distance}`
	return `${formatTimeOfDay(at)}${day} · ${relative}`
}
