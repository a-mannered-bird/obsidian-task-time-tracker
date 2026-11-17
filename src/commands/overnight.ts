import type { TFile } from 'obsidian'
import {
	describeMarkSet,
	endDayWithLastClock,
	type RecordedMark,
} from 'core/dayBoundaries'
import { recordWrites, rewriteNote } from 'core/noteRewrite'
import type { OvernightClock } from 'core/overnight'
import { describeClockEdit, retimeClock } from 'core/timeline'
import { describeStart, parseEndTime } from 'core/typedTime'
import { promptTime } from 'ui/timePrompt'
import { showUndoNotice } from 'ui/undoNotice'
import type TaskTimeTracker from '../main'
import { noteIo } from './target'
import { wrote } from './timelineEdits'
import { undoNoteWrite } from './undo'

/**
 * End a clock left running in an earlier note. Stopping its last running
 * clock also ends that day, in the same write: one Undo restores both.
 */
export async function stopOvernightClock(
	plugin: TaskTimeTracker,
	file: TFile,
	clock: OvernightClock,
	at: Date
): Promise<boolean> {
	const { taskName, start } = clock
	const key = { taskName, start, end: null }
	const times = { start, end: at }
	const io = noteIo(plugin, file)
	const recorder = recordWrites(io)
	// Set by the transform, which may run again on newer content.
	const ended: { mark: RecordedMark | null } = { mark: null }
	const outcome = await rewriteNote(recorder.io, (content) => {
		const next = retimeClock(content, key, times)
		ended.mark = next === null ? null : endDayWithLastClock(next)
		return ended.mark?.content ?? next
	})
	const write = recorder.written()
	if (!wrote(outcome) || !write) return outcome === 'unchanged'
	const messages = [describeClockEdit(taskName, key, times)]
	if (ended.mark) {
		messages.push(describeMarkSet('end', ended.mark.at, new Date()))
	}
	showUndoNotice(messages.join('\n'), undoNoteWrite(io, write))
	return true
}

/** Ask when a clock left running ended, then end it there. */
export async function promptOvernightStop(
	plugin: TaskTimeTracker,
	file: TFile,
	clock: OvernightClock
): Promise<void> {
	const now = new Date()
	const at = await promptTime(plugin.app, {
		title: `Stop ${clock.taskName}`,
		description: describeStart(clock.start, now),
		reference: now,
		parse: (text) => parseEndTime(text, clock.start, now),
		confirmText: 'Stop',
	})
	if (at) await stopOvernightClock(plugin, file, clock, at)
}
