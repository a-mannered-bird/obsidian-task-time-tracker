import { Notice, type TFile } from 'obsidian'
import { rewriteNote, type RewriteOutcome } from 'core/noteRewrite'
import {
	addClock,
	describeClockAdded,
	describeClockDeleted,
	describeClockEdit,
	formatTimeOfDay,
	removeClock,
	retimeClock,
	type ClockTarget,
} from 'core/timeline'
import { BUSY_NOTICE } from 'core/trackingRun'
import type { ClockKey, ClockTimes, FinishedClockTimes } from 'types/tasks'
import { showUndoNotice } from 'ui/undoNotice'
import type TaskTimeTracker from '../main'
import { NOTICE_DURATION, noteIo, readTaskNote } from './target'
import { pickNoteTask } from './tracking'

const GONE_NOTICE = 'The clock changed elsewhere, nothing was written.'

/** Only the latest edit can be undone; its notice goes when another lands. */
let undoNotice: Notice | null = null

/**
 * Write new times to one clock line, found by what it held when the
 * timeline read it. True when the note now holds the new times.
 */
export async function retimeClockLine(
	plugin: TaskTimeTracker,
	file: TFile,
	key: ClockKey,
	times: ClockTimes,
	undoable = true
): Promise<boolean> {
	const outcome = await rewriteNote(noteIo(plugin, file), (content) =>
		retimeClock(content, key, times)
	)
	if (!wrote(outcome)) return outcome === 'unchanged'
	if (undoable) {
		offerUndo(describeClockEdit(key.taskName, key, times), () => {
			void retimeClockLine(
				plugin,
				file,
				{ taskName: key.taskName, ...times },
				{ start: key.start, end: key.end },
				false
			)
		})
	}
	return true
}

/**
 * Ask which task the drawn times belong to, then add the clock to it (and
 * the task to the note when it is new). True when the clock was written.
 */
export async function addClockLine(
	plugin: TaskTimeTracker,
	file: TFile,
	times: FinishedClockTimes
): Promise<boolean> {
	const note = await readTaskNote(plugin, file)
	const picked = await pickNoteTask(plugin, note, note.tasks, {
		placeholder: `Task for ${formatTimeOfDay(times.start)}–${formatTimeOfDay(times.end)}`,
		includeVault: true,
	})
	if (!picked) return false
	const target: ClockTarget =
		picked.kind === 'note'
			? { name: picked.task.name, tags: picked.task.tags }
			: { name: picked.name, tags: picked.tags }
	const addsTask = !note.findTask(target.name)

	const outcome = await rewriteNote(noteIo(plugin, file), (content) =>
		addClock(content, target, times)
	)
	if (!wrote(outcome)) return false
	offerUndo(describeClockAdded(target.name, times), () => {
		void rewriteNote(noteIo(plugin, file), (content) =>
			removeClock(content, { taskName: target.name, ...times }, addsTask)
		).then(wrote)
	})
	return true
}

/**
 * Remove one clock line, keeping its task line. Undo puts the clock back
 * among the task's clocks in time order (and the task line, with `tags`,
 * should it be gone by then). True when the line was removed.
 */
export async function deleteClockLine(
	plugin: TaskTimeTracker,
	file: TFile,
	key: ClockKey,
	tags: string[]
): Promise<boolean> {
	const outcome = await rewriteNote(noteIo(plugin, file), (content) =>
		removeClock(content, key, false)
	)
	if (!wrote(outcome)) return false
	offerUndo(describeClockDeleted(key.taskName, key), () => {
		void rewriteNote(noteIo(plugin, file), (content) =>
			addClock(content, { name: key.taskName, tags }, key)
		).then(wrote)
	})
	return true
}

/** Tell about a write that did not happen; true when it did. */
function wrote(outcome: RewriteOutcome): boolean {
	if (outcome === 'gone') new Notice(GONE_NOTICE, NOTICE_DURATION)
	if (outcome === 'busy') new Notice(BUSY_NOTICE, NOTICE_DURATION)
	return outcome === 'written'
}

function offerUndo(message: string, undo: () => void) {
	undoNotice?.hide()
	undoNotice = showUndoNotice(message, () => {
		undoNotice?.hide()
		undoNotice = null
		undo()
	})
}
