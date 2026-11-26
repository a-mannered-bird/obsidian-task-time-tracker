import { type IconName } from 'obsidian'
import { isPastDay, type DailyTarget } from 'core/dailyNotes'
import { setFrontmatterValue } from 'core/frontmatter'
import { recordWrites, rewriteNote } from 'core/noteRewrite'
import { BUSY_NOTICE } from 'core/trackingRun'
import {
	DAY_END_PROPERTY,
	DAY_START_PROPERTY,
	formatLocalDateTime,
	readFrontmatterTime,
} from 'core/time'
import {
	DAY_MARK_PROPERTY,
	describeMarkSet,
	pastDayMarkDefault,
	type DayMark,
} from 'core/dayBoundaries'
import { formatTimeOfDay } from 'core/timeline'
import { firstDayStartRequest } from 'core/trackingRun'
import { dayEndFloor, parseDayEnd, parseDayStart } from 'core/typedTime'
import { showNotice } from 'ui/notice'
import { promptTime } from 'ui/timePrompt'
import { showUndoNotice } from 'ui/undoNotice'
import type TaskTimeTracker from '../main'
import { currentTarget, readTaskNote, targetIo } from './target'
import { undoNoteWrite } from './undo'

export type TimeCommand = {
	id: string
	name: string
	icon: IconName
	/** The end of day comes after the start of day and every clock. */
	mark: DayMark
}

export const DAY_START_COMMAND: TimeCommand = {
	id: 'set-day-start',
	name: 'Set start of day',
	icon: 'sunrise',
	mark: 'start',
}

export const DAY_END_COMMAND: TimeCommand = {
	id: 'set-day-end',
	name: 'Set end of day',
	icon: 'sunset',
	mark: 'end',
}

export const TIME_COMMANDS: TimeCommand[] = [DAY_START_COMMAND, DAY_END_COMMAND]

const DAY_MARK_QUESTIONS: Record<DayMark, string> = {
	start: 'When does the tracking period start?',
	end: 'When does the tracking period end?',
}

export function registerFrontmatterTimeCommands(plugin: TaskTimeTracker) {
	for (const command of TIME_COMMANDS) {
		plugin.addCommand({
			id: command.id,
			name: command.name,
			icon: command.icon,
			callback: () => void runTimeCommand(plugin, command),
		})
	}
}

/**
 * How a start or end of day is asked: on a past day, as a time of day only
 * (minutes before now mean nothing there), opening on `pastDayMarkDefault`;
 * `endingDay` for End day.
 */
type MarkPrompt = { past: boolean; endingDay?: boolean }

function markPrompt(
	plugin: TaskTimeTracker,
	target: DailyTarget,
	endingDay = false
): MarkPrompt {
	const past = isPastDay(plugin.app, plugin.getDailyNotesConfig(), target)
	return { past, endingDay }
}

/** Ask for the time and write it; the time written, or null when dismissed. */
export function runTimeCommand(
	plugin: TaskTimeTracker,
	command: TimeCommand
): Promise<Date | null> {
	const target = currentTarget(plugin)
	return promptDayMark(plugin, target, command.mark, markPrompt(plugin, target))
}

/** Ask for the end of day as End day does. */
export function promptEndOfDay(plugin: TaskTimeTracker): Promise<Date | null> {
	const target = currentTarget(plugin)
	return promptDayMark(plugin, target, 'end', markPrompt(plugin, target, true))
}

/**
 * After the first clock of a past day without a start of day, ask when the
 * day started, as the tracking commands do on the first task; opens on the
 * clock's start, never later. The time written, or null when dismissed.
 */
export async function promptFirstDayStart(
	plugin: TaskTimeTracker,
	target: DailyTarget,
	firstClock: Date
): Promise<Date | null> {
	const time = await promptTime(plugin.app, {
		...firstDayStartRequest(firstClock, target.date),
		timeOnly: firstClock,
	})
	if (time === null) return null
	await writeDayTime(plugin, target, 'start', time)
	return time
}

/**
 * Ask for a note's start or end of day and write it; the time written, or
 * null when dismissed.
 */
export async function promptDayMark(
	plugin: TaskTimeTracker,
	target: DailyTarget,
	mark: DayMark,
	how: MarkPrompt = { past: false }
): Promise<Date | null> {
	const { app } = plugin
	const frontmatter =
		target.file && app.metadataCache.getFileCache(target.file)?.frontmatter
	const dayStart = readFrontmatterTime(frontmatter?.[DAY_START_PROPERTY])
	const dayEnd = readFrontmatterTime(frontmatter?.[DAY_END_PROPERTY])
	const tasks = target.file
		? (await readTaskNote(plugin, target.file)).tasks
		: []
	const floor = mark === 'end' ? dayEndFloor(tasks, dayStart) : null
	const time = await promptTime(app, {
		timeOnly: how.past
			? pastDayMarkDefault(
					mark,
					tasks,
					target.date,
					{ dayStart, dayEnd },
					how.endingDay
				)
			: undefined,
		title: DAY_MARK_QUESTIONS[mark],
		description:
			mark === 'start' && dayEnd
				? `No later than the end of day, ${formatTimeOfDay(dayEnd)}.`
				: undefined,
		verb: 'Set',
		parse: (text, now) =>
			mark === 'end'
				? parseDayEnd(text, target.date, floor, now)
				: parseDayStart(text, target.date, dayEnd, now),
	})
	if (time === null) return null
	await writeDayTime(plugin, target, mark, time)
	return time
}

/**
 * Write a start or end of day to the note's frontmatter, with a notice
 * offering Change and Undo. True when the note holds it.
 */
export async function writeDayTime(
	plugin: TaskTimeTracker,
	target: DailyTarget,
	mark: DayMark,
	time: Date
): Promise<boolean> {
	const io = targetIo(plugin, target)
	const recorder = recordWrites(io)
	const outcome = await rewriteNote(recorder.io, (content) =>
		setFrontmatterValue(
			content,
			DAY_MARK_PROPERTY[mark],
			formatLocalDateTime(time)
		)
	)
	if (outcome === 'busy') showNotice(BUSY_NOTICE)
	const write = recorder.written()
	if (!write) return outcome === 'unchanged'
	showUndoNotice(
		describeMarkSet(mark, time, new Date()),
		undoNoteWrite(io, write),
		[
			{
				label: 'Change',
				run: () =>
					void promptDayMark(plugin, target, mark, markPrompt(plugin, target)),
			},
		]
	)
	return true
}
