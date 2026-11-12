import type { TFile } from 'obsidian'
import type { OvernightClock } from 'core/overnight'
import { formatTimeOfDay } from 'core/timeline'
import { parseEndTime } from 'core/typedTime'
import { promptText } from 'ui/TextPromptModal'
import type TaskTimeTracker from '../main'
import { retimeClockLine } from './timelineEdits'

/** End a clock left running in an earlier note, with the timeline's Undo. */
export function stopOvernightClock(
	plugin: TaskTimeTracker,
	file: TFile,
	clock: OvernightClock,
	at: Date
): Promise<boolean> {
	const { taskName, start } = clock
	return retimeClockLine(
		plugin,
		file,
		{ taskName, start, end: null },
		{ start, end: at }
	)
}

/** Ask when a clock left running ended, then end it there. */
export async function promptOvernightStop(
	plugin: TaskTimeTracker,
	file: TFile,
	clock: OvernightClock
): Promise<void> {
	const stopTime = (text: string) => parseEndTime(text, clock.start, new Date())
	const value = await promptText(plugin.app, {
		title: `Stop ${clock.taskName}`,
		description: `Running since ${formatTimeOfDay(clock.start)}. A time before that means the next day.`,
		label: 'End time',
		placeholder: 'HH:MM',
		confirmText: 'Stop',
		validate: (text) => {
			const parsed = stopTime(text)
			return 'error' in parsed ? parsed.error : null
		},
	})
	if (value === null) return
	const parsed = stopTime(value)
	if ('at' in parsed) await stopOvernightClock(plugin, file, clock, parsed.at)
}
