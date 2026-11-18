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
import { atTime } from './typedTime'
import { NOTICE_ICON } from './noticeText'

export type DayMark = 'start' | 'end'

/** A note with a start or end of day the plugin recorded on its own. */
export type RecordedMark = { content: string; mark: DayMark; at: Date }

/** The frontmatter property holding each mark. */
export const DAY_MARK_PROPERTY: Record<DayMark, string> = {
	start: DAY_START_PROPERTY,
	end: DAY_END_PROPERTY,
}

const LABEL: Record<DayMark, string> = {
	start: `${NOTICE_ICON.dayStart} Start of day`,
	end: `${NOTICE_ICON.dayEnd} End of day`,
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
 * clock's start, which the start of day may not come after. Null when the
 * write does not start the day.
 */
export function firstClockOfDay(before: string, after: string): Date | null {
	if (markOf(after, 'start')) return null
	if (tasksOf(before).some((task) => task.clocks.length > 0)) return null
	return firstClockStart(after)
}

/** `content` with its start of day set to `at`. */
export function withDayStart(content: string, at: Date): string {
	return withMark(content, 'start', at).content
}

/**
 * The day ends with its last clock: once no clock of the note runs, the
 * end of day becomes the end of its last clock, earlier or later than a
 * recorded one. Null when nothing is to record.
 */
export function endDayWithLastClock(content: string): RecordedMark | null {
	const tasks = tasksOf(content)
	if (tasks.some(isRunning)) return null
	const ends = tasks.flatMap((task) =>
		task.clocks.flatMap((clock) => (clock.end ? [clock.end] : []))
	)
	if (ends.length === 0) return null
	const last = new Date(Math.max(...ends.map((end) => end.valueOf())))
	if (markOf(content, 'end')?.valueOf() === last.valueOf()) return null
	return withMark(content, 'end', last)
}

function firstClockStart(content: string): Date | null {
	const starts = tasksOf(content).flatMap((task) =>
		task.clocks.map((clock) => clock.start.valueOf())
	)
	return starts.length > 0 ? new Date(Math.min(...starts)) : null
}

/**
 * A start of day set by the first clock follows it when that clock moves:
 * `after` with its start of day moved along, when `before` had it on its
 * first clock's start.
 */
export function keepDayStartOnFirstClock(
	before: string,
	after: string
): string {
	const dayStart = markOf(before, 'start')
	const first = firstClockStart(before)
	if (!dayStart || !first || dayStart.valueOf() !== first.valueOf()) {
		return after
	}
	const moved = firstClockStart(after)
	if (!moved || moved.valueOf() === dayStart.valueOf()) return after
	return withMark(after, 'start', moved).content
}

/** What a write did to the start and end of day, one sentence each. */
export function describeMarkChanges(
	before: string,
	after: string,
	now: Date
): string[] {
	const marks: DayMark[] = ['start', 'end']
	return marks.flatMap((mark) => {
		const at = markOf(after, mark)
		if (!at || markOf(before, mark)?.valueOf() === at.valueOf()) return []
		return [describeMarkSet(mark, at, now)]
	})
}

/** `🌅 Start of day set to 07:05.`, `🌇 End of day set to yesterday at 23:40.` */
export function describeMarkSet(mark: DayMark, at: Date, now: Date): string {
	const when = atTime(at, now)
	return `${LABEL[mark]} set to ${when.startsWith('at ') ? when.slice(3) : when}.`
}
