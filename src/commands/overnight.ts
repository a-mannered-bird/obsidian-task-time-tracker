import type { TFile } from 'obsidian'
import { describeMarkChanges, endDayWithLastClock } from 'core/dayBoundaries'
import { recordWrites, rewriteNote } from 'core/noteRewrite'
import type { OvernightClock } from 'core/overnight'
import { describeClockEdit, retimeClock } from 'core/timeline'
import { describeStart, parseEndTime } from 'core/typedTime'
import type { ClockKey } from 'types/tasks'
import { promptTime } from 'ui/timePrompt'
import { showUndoNotice } from 'ui/undoNotice'
import type TaskTimeTracker from '../main'
import { noteIo } from './target'
import { wrote } from './timelineEdits'
import { undoNoteWrite } from './undo'

/** End a clock left running in an earlier note. */
export function stopOvernightClock(
	plugin: TaskTimeTracker,
	file: TFile,
	clock: OvernightClock,
	at: Date
): Promise<boolean> {
	const { taskName, start } = clock
	return endClockAt(plugin, file, { taskName, start, end: null }, at)
}

/**
 * Give the clock `key` the end `at`. Once no clock of the note runs, its
 * end of day becomes the end of its last clock, in the same write: the
 * notice's Undo restores both, its Change moves both.
 */
async function endClockAt(
	plugin: TaskTimeTracker,
	file: TFile,
	key: ClockKey,
	at: Date
): Promise<boolean> {
	const times = { start: key.start, end: at }
	const io = noteIo(plugin, file)
	const recorder = recordWrites(io)
	const outcome = await rewriteNote(recorder.io, (content) => {
		const next = retimeClock(content, key, times)
		if (next === null) return null
		return endDayWithLastClock(next)?.content ?? next
	})
	const write = recorder.written()
	if (!wrote(outcome) || !write) return outcome === 'unchanged'
	const message = [
		describeClockEdit(key.taskName, key, times),
		...describeMarkChanges(write.before, write.after, new Date()),
	].join('\n')
	const ended = { ...key, end: at }
	showUndoNotice(message, undoNoteWrite(io, write), [
		{ label: 'Change', run: () => void promptEnd(plugin, file, ended) },
	])
	return true
}

/** Ask when a clock left running ended, then end it there. */
export function promptOvernightStop(
	plugin: TaskTimeTracker,
	file: TFile,
	clock: OvernightClock
): Promise<void> {
	const { taskName, start } = clock
	return promptEnd(plugin, file, { taskName, start, end: null })
}

/** Ask when the clock ended (a running one: when it stopped), then end it there. */
async function promptEnd(
	plugin: TaskTimeTracker,
	file: TFile,
	key: ClockKey
): Promise<void> {
	const now = new Date()
	const running = key.end === null
	const confirmText = running ? 'Stop' : 'Change'
	const at = await promptTime(plugin.app, {
		title: running
			? `Stop ${key.taskName}`
			: `Change when ${key.taskName} stopped`,
		description: describeStart(key.start, now),
		reference: now,
		parse: (text) => parseEndTime(text, key.start, now),
		confirmText,
	})
	if (at) await endClockAt(plugin, file, key, at)
}
