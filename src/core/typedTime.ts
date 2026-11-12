import { addDays } from './dailyNotes'

/** A time of day the user typed, placed on a date, or why it cannot be. */
export type TypedTime = { at: Date } | { error: string }

const TIME_OF_DAY = /^(\d{1,2}):(\d{2})$/
const NOT_A_TIME = 'Enter a time like 23:15.'
const STILL_TO_COME = 'That time is still to come.'

function timeOnDay(text: string, day: Date): Date | null {
	const match = TIME_OF_DAY.exec(text.trim())
	const hours = Number(match?.[1])
	const minutes = Number(match?.[2])
	if (!match || hours > 23 || minutes > 59) return null
	return new Date(
		day.getFullYear(),
		day.getMonth(),
		day.getDate(),
		hours,
		minutes
	)
}

/**
 * The end typed for clocks that started at `latestStart`: a time of day on
 * that day, or on the next one when that is not after the start (work past
 * midnight). It cannot be later than now.
 */
export function parseEndTime(
	text: string,
	latestStart: Date,
	now: Date
): TypedTime {
	let at = timeOnDay(text, latestStart)
	if (!at) return { error: NOT_A_TIME }
	if (at <= latestStart) at = addDays(at, 1)
	if (at > now) return { error: STILL_TO_COME }
	return { at }
}

/** The start typed for a running clock: a time of day on its start day, not later than now. */
export function parseStartTime(
	text: string,
	start: Date,
	now: Date
): TypedTime {
	const at = timeOnDay(text, start)
	if (!at) return { error: NOT_A_TIME }
	if (at > now) return { error: STILL_TO_COME }
	return { at }
}
