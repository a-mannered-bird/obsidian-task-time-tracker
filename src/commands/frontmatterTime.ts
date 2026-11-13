import { Notice, type IconName } from 'obsidian'
import {
	DAY_END_PROPERTY,
	DAY_START_PROPERTY,
	formatLocalDateTime,
	readFrontmatterTime,
} from 'core/time'
import { formatTimeOfDay } from 'core/timeline'
import { parseToggleTime, timeInputHelp } from 'core/typedTime'
import { promptTime } from 'ui/timePrompt'
import type TaskTimeTracker from '../main'
import { currentTarget, ensureTargetFile, NOTICE_DURATION } from './target'

export type TimeCommand = {
	id: string
	name: string
	icon: IconName
	property: string
	/**
	 * The property this time must come after: a time of day typed before
	 * it means the next day (a day ending past midnight).
	 */
	afterProperty?: string
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
	afterProperty: DAY_START_PROPERTY,
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
	const saved =
		target.file && app.metadataCache.getFileCache(target.file)?.frontmatter
	const after = command.afterProperty
		? readFrontmatterTime(saved?.[command.afterProperty])
		: null
	const time = await promptTime(app, {
		title: command.name,
		description: after
			? `${timeInputHelp()} A time of day before ${formatTimeOfDay(after)} means the next day.`
			: timeInputHelp(),
		parse: (text) =>
			parseToggleTime(text, new Date(), { day: target.date, after }),
	})
	if (time === null) return null

	const { property } = command
	const value = formatLocalDateTime(time)
	await app.fileManager.processFrontMatter(
		await ensureTargetFile(plugin, target),
		(frontmatter: Record<string, unknown>) => {
			frontmatter[property] = value
		}
	)
	new Notice(`${property}: ${value}`, NOTICE_DURATION)
	return time
}
