import { moment } from 'obsidian'
import type { Task } from 'types/tasks'
import type { DailyLog } from './dailyLogs'
import { addDays, isSameDay } from './dailyNotes'

/** A clock left running in a note earlier than the one tracked today. */
export type OvernightClock = {
	taskName: string
	start: Date
	/** That note's bed time, when it can end the clock (after its start, past). */
	bedTime: Date | null
}

export function findOvernightClocks(
	tasks: Task[],
	bedTime: Date | null,
	now: Date
): OvernightClock[] {
	return tasks.flatMap((task) =>
		task.clocks
			.filter((clock) => clock.end === null)
			.map((clock) => ({
				taskName: task.name,
				start: clock.start,
				bedTime:
					bedTime && bedTime > clock.start && bedTime <= now ? bedTime : null,
			}))
	)
}

/** A day other than today: `yesterday`, a weekday within a week, else the date. */
export function describeDay(date: Date, today: Date): string {
	if (isSameDay(date, addDays(today, -1))) return 'yesterday'
	if (date > addDays(today, -7) && date < addDays(today, 7)) {
		return moment(date).format('dddd')
	}
	return moment(date).format('LL')
}

/** The latest earlier note, holding clocks left running. */
export type OvernightNote = {
	log: DailyLog
	clocks: OvernightClock[]
}

export type StopTime = { at: Date } | { error: string }

const TIME_OF_DAY = /^(\d{1,2}):(\d{2})$/

/**
 * The end typed for a clock left running: a time of day on the clock's
 * start day, or on the next one when that is not after the start (work past
 * midnight). It cannot be later than now.
 */
export function parseStopTime(text: string, start: Date, now: Date): StopTime {
	const match = TIME_OF_DAY.exec(text.trim())
	const hours = Number(match?.[1])
	const minutes = Number(match?.[2])
	if (!match || hours > 23 || minutes > 59) {
		return { error: 'Enter a time like 23:15.' }
	}
	let at = new Date(
		start.getFullYear(),
		start.getMonth(),
		start.getDate(),
		hours,
		minutes
	)
	if (at <= start) at = addDays(at, 1)
	if (at > now) return { error: 'That time is still to come.' }
	return { at }
}
