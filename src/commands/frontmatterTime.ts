import { Notice, type IconName } from 'obsidian'
import {
	addMinutes,
	BED_TIME_PROPERTY,
	formatLocalDateTime,
	WAKE_TIME_PROPERTY,
} from 'core/time'
import { promptMinutes } from 'ui/MinutesPromptModal'
import type TaskTimeTracker from '../main'
import { NOTICE_DURATION, resolveTargetFileOrNotify } from './target'

export type TimeCommand = {
	id: string
	name: string
	icon: IconName
	property: string
	/** Minutes pre-filled in the prompt; negative = in the past. */
	defaultOffset: number
}

export const TIME_COMMANDS: TimeCommand[] = [
	{
		id: 'set-wake-time',
		name: 'Set wake time',
		icon: 'sunrise',
		property: WAKE_TIME_PROPERTY,
		// Reaching the note takes a few minutes after actually getting up.
		defaultOffset: -3,
	},
	{
		id: 'set-bed-time',
		name: 'Set bed time',
		icon: 'moon',
		property: BED_TIME_PROPERTY,
		defaultOffset: 0,
	},
]

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

export async function runTimeCommand(
	plugin: TaskTimeTracker,
	command: TimeCommand
) {
	const { app } = plugin
	const file = resolveTargetFileOrNotify(plugin)
	if (!file) return

	const offset = await promptMinutes(app, {
		title: command.name,
		description:
			'Minutes relative to now: negative values go back in time, positive ones forward.',
		defaultValue: command.defaultOffset,
	})
	if (offset === null) return

	const { property } = command
	const value = formatLocalDateTime(addMinutes(new Date(), offset))
	await app.fileManager.processFrontMatter(
		file,
		(frontmatter: Record<string, unknown>) => {
			frontmatter[property] = value
		}
	)
	new Notice(`${property}: ${value}`, NOTICE_DURATION)
}
