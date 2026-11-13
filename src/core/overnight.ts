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

/** Heading over a note's tasks: `Today`, `Yesterday`, `Monday`, the date. */
export function noteDayHeading(date: Date, today: Date): string {
	if (isSameDay(date, today)) return 'Today'
	const day = describeDay(date, today)
	return day.charAt(0).toUpperCase() + day.slice(1)
}

/** The latest earlier note, holding clocks left running. */
export type OvernightNote = {
	log: DailyLog
	clocks: OvernightClock[]
}
