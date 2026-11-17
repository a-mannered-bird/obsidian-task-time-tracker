import { Notice, type IconName, type TFile } from 'obsidian'
import {
	DAY_END_PROPERTY,
	DAY_START_PROPERTY,
	formatLocalDateTime,
	readFrontmatterTime,
} from 'core/time'
import { formatTimeOfDay } from 'core/timeline'
import { dayEndFloor, parseDayEnd, parseDayStart } from 'core/typedTime'
import { promptTime } from 'ui/timePrompt'
import type TaskTimeTracker from '../main'
import {
	currentTarget,
	ensureTargetFile,
	NOTICE_DURATION,
	readTaskNote,
} from './target'

export type TimeCommand = {
	id: string
	name: string
	icon: IconName
	property: string
	/** The end of day, which comes after the start of day and every clock. */
	endsDay?: boolean
}

export const DAY_START_COMMAND: TimeCommand = {
	id: 'set-day-start',
	name: 'Set start of day',
	icon: 'sunrise',
	property: DAY_START_PROPERTY,
}

export const DAY_END_COMMAND: TimeCommand = {
	id: 'set-day-end',
	name: 'Set end of day',
	icon: 'sunset',
	property: DAY_END_PROPERTY,
	endsDay: true,
}

export const TIME_COMMANDS: TimeCommand[] = [DAY_START_COMMAND, DAY_END_COMMAND]

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
export async function runTimeCommand(
	plugin: TaskTimeTracker,
	command: TimeCommand
): Promise<Date | null> {
	const { app } = plugin
	const target = currentTarget(plugin)
	const frontmatter =
		target.file && app.metadataCache.getFileCache(target.file)?.frontmatter
	const dayStart = readFrontmatterTime(frontmatter?.[DAY_START_PROPERTY])
	const dayEnd = readFrontmatterTime(frontmatter?.[DAY_END_PROPERTY])
	const floor =
		command.endsDay && target.file
			? dayEndFloor((await readTaskNote(plugin, target.file)).tasks, dayStart)
			: null
	const now = new Date()
	const time = await promptTime(app, {
		title: command.name,
		description: command.endsDay
			? floor
				? `A time before ${formatTimeOfDay(floor.at)}, ${floor.what}, is the next day.`
				: undefined
			: dayEnd
				? `No later than the end of day, ${formatTimeOfDay(dayEnd)}.`
				: undefined,
		reference: now,
		parse: (text) =>
			command.endsDay
				? parseDayEnd(text, target.date, floor, now)
				: parseDayStart(text, target.date, dayEnd, now),
	})
	if (time === null) return null
	await writeDayTime(
		plugin,
		await ensureTargetFile(plugin, target),
		command.property,
		time
	)
	return time
}

/** Write a start or end of day to the note's frontmatter. */
export async function writeDayTime(
	plugin: TaskTimeTracker,
	file: TFile,
	property: string,
	time: Date
): Promise<void> {
	const value = formatLocalDateTime(time)
	await plugin.app.fileManager.processFrontMatter(
		file,
		(frontmatter: Record<string, unknown>) => {
			frontmatter[property] = value
		}
	)
	new Notice(`${property}: ${value}`, NOTICE_DURATION)
}
