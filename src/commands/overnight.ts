import type { TFile } from 'obsidian'
import type { OvernightClock } from 'core/overnight'
import { formatTimeOfDay } from 'core/timeline'
import { parseEndTime, timeInputHelp } from 'core/typedTime'
import { promptTime } from 'ui/timePrompt'
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
	const at = await promptTime(plugin.app, {
		title: `Stop ${clock.taskName}`,
		description: `Running since ${formatTimeOfDay(clock.start)}. When did it stop? ${timeInputHelp()} A time of day before the start means the next day.`,
		parse: (text) => parseEndTime(text, clock.start, new Date()),
		confirmText: 'Stop',
	})
	if (at) await stopOvernightClock(plugin, file, clock, at)
}
