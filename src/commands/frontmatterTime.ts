import { Notice, type IconName } from 'obsidian'
import type { DailyTarget } from 'core/dailyNotes'
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
	type DayMark,
} from 'core/dayBoundaries'
import { formatTimeOfDay } from 'core/timeline'
import { dayEndFloor, parseDayEnd, parseDayStart } from 'core/typedTime'
import { promptTime } from 'ui/timePrompt'
import { showUndoNotice } from 'ui/undoNotice'
import type TaskTimeTracker from '../main'
import {
	currentTarget,
	NOTICE_DURATION,
	readTaskNote,
	targetIo,
} from './target'
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

const COMMANDS: Record<DayMark, TimeCommand> = {
	start: DAY_START_COMMAND,
	end: DAY_END_COMMAND,
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

/** Ask for the time and write it; the time written, or null when dismissed. */
export function runTimeCommand(
	plugin: TaskTimeTracker,
	command: TimeCommand
): Promise<Date | null> {
	return promptDayMark(plugin, currentTarget(plugin), command.mark)
}

/**
 * Ask for a note's start or end of day and write it; the time written, or
 * null when dismissed.
 */
export async function promptDayMark(
	plugin: TaskTimeTracker,
	target: DailyTarget,
	mark: DayMark
): Promise<Date | null> {
	const { app } = plugin
	const frontmatter =
		target.file && app.metadataCache.getFileCache(target.file)?.frontmatter
	const dayStart = readFrontmatterTime(frontmatter?.[DAY_START_PROPERTY])
	const dayEnd = readFrontmatterTime(frontmatter?.[DAY_END_PROPERTY])
	const floor =
		mark === 'end' && target.file
			? dayEndFloor((await readTaskNote(plugin, target.file)).tasks, dayStart)
			: null
	const now = new Date()
	const time = await promptTime(app, {
		title: COMMANDS[mark].name,
		description:
			mark === 'start' && dayEnd
				? `No later than the end of day, ${formatTimeOfDay(dayEnd)}.`
				: undefined,
		reference: now,
		parse: (text) =>
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
	if (outcome === 'busy') new Notice(BUSY_NOTICE, NOTICE_DURATION)
	const write = recorder.written()
	if (!write) return outcome === 'unchanged'
	showUndoNotice(
		describeMarkSet(mark, time, new Date()),
		undoNoteWrite(io, write),
		[{ label: 'Change', run: () => void promptDayMark(plugin, target, mark) }]
	)
	return true
}
