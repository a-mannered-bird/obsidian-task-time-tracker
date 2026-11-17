import type { Task } from 'types/tasks'
import { isRunning } from './note'
import { parseTasks } from './parser'
import { readFrontmatterValue, setFrontmatterValue } from './frontmatter'
import {
	DAY_END_PROPERTY,
	DAY_START_PROPERTY,
	formatLocalDateTime,
	readFrontmatterTime,
} from './time'
import { atTime, dayEndFloor } from './typedTime'

export type DayMark = 'start' | 'end'

/** A note with a start or end of day the plugin recorded on its own. */
export type RecordedMark = { content: string; mark: DayMark; at: Date }

/** The frontmatter property holding each mark. */
export const DAY_MARK_PROPERTY: Record<DayMark, string> = {
	start: DAY_START_PROPERTY,
	end: DAY_END_PROPERTY,
}

const LABEL: Record<DayMark, string> = {
	start: 'Start of day',
	end: 'End of day',
}

function tasksOf(content: string): Task[] {
	return parseTasks(content.split('\n'))
}

function markOf(content: string, mark: DayMark): Date | null {
	return readFrontmatterTime(
		readFrontmatterValue(content, DAY_MARK_PROPERTY[mark])
	)
}

function withMark(content: string, mark: DayMark, at: Date): RecordedMark {
	return {
		content: setFrontmatterValue(
			content,
			DAY_MARK_PROPERTY[mark],
			formatLocalDateTime(at)
		),
		mark,
		at,
	}
}

/**
 * The day starts with its first clock: when a write turns a note without
 * clocks into one with some, and no start of day is recorded, the earliest
 * clock's start becomes it. Null when nothing is to record.
 */
export function startDayWithFirstClock(
	before: string,
	after: string
): RecordedMark | null {
	if (markOf(after, 'start')) return null
	if (tasksOf(before).some((task) => task.clocks.length > 0)) return null
	const starts = tasksOf(after).flatMap((task) =>
		task.clocks.map((clock) => clock.start)
	)
	if (starts.length === 0) return null
	const first = new Date(Math.min(...starts.map((start) => start.valueOf())))
	return withMark(after, 'start', first)
}

/**
 * The day ends with its last clock: once no clock of the note runs, the
 * end of day becomes the end of its last clock, unless one recorded is
 * already as late. Null when nothing is to record.
 */
export function endDayWithLastClock(content: string): RecordedMark | null {
	const tasks = tasksOf(content)
	if (tasks.some(isRunning)) return null
	if (!tasks.some((task) => task.clocks.length > 0)) return null
	const floor = dayEndFloor(tasks, markOf(content, 'start'))
	const dayEnd = markOf(content, 'end')
	if (!floor || (dayEnd && dayEnd >= floor.at)) return null
	return withMark(content, 'end', floor.at)
}

/** `Start of day set to 07:05.`, `End of day set to yesterday at 23:40.` */
export function describeMarkSet(mark: DayMark, at: Date, now: Date): string {
	const when = atTime(at, now)
	return `${LABEL[mark]} set to ${when.startsWith('at ') ? when.slice(3) : when}.`
}
