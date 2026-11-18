import { type TFile } from 'obsidian'
import { describeRetime } from 'core/handOff'
import {
	recordWrites,
	rewriteNote,
	type RewriteOutcome,
} from 'core/noteRewrite'
import {
	addClock,
	describeClockAdded,
	describeClockDeleted,
	describeClockDuplicated,
	duplicateTargets,
	formatTimeOfDay,
	removeClock,
	retimeClock,
	type ClockTarget,
} from 'core/timeline'
import { TaskNote } from 'core/note'
import { NOTICE_ICON } from 'core/noticeText'
import { BUSY_NOTICE } from 'core/trackingRun'
import type { ClockKey, ClockTimes, FinishedClockTimes } from 'types/tasks'
import { showNotice } from 'ui/notice'
import { showUndoNotice } from 'ui/undoNotice'
import type TaskTimeTracker from '../main'
import { noteIo, readTaskNote, stopContext } from './target'
import { pickNoteTask } from './tracking'

const GONE_NOTICE = `${NOTICE_ICON.warning} The clock changed elsewhere, nothing was written.`

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
	const recorder = recordWrites(noteIo(plugin, file))
	const outcome = await rewriteNote(recorder.io, (content) =>
		retimeClock(content, key, times)
	)
	const write = recorder.written()
	if (!wrote(outcome) || !write) return outcome === 'unchanged'
	if (undoable) {
		const message = describeRetime(
			key,
			times,
			stopContext(plugin, file.path, write.after)
		)
		showUndoNotice(message, () =>
			retimeClockLine(
				plugin,
				file,
				{ taskName: key.taskName, ...times },
				{ start: key.start, end: key.end },
				false
			)
		)
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
	const picked = await pickNoteTask(plugin, file.path, note, {
		choices: (version) => version.tasks,
		placeholder: `Task for ${formatTimeOfDay(times.start)}–${formatTimeOfDay(times.end)}`,
		includeVault: true,
	})
	if (!picked) return false
	const target: ClockTarget = { name: picked.name, tags: picked.tags }
	return writeNewClock(
		plugin,
		file,
		target,
		times,
		describeClockAdded(target.name, times)
	)
}

/**
 * Ask for another task, then give it a clock with the times of `key`'s
 * (adding the task to the note when it is new); the original stays. True
 * when the copy was written.
 */
export async function duplicateClockLine(
	plugin: TaskTimeTracker,
	file: TFile,
	key: ClockKey & FinishedClockTimes
): Promise<boolean> {
	const note = await readTaskNote(plugin, file)
	const picked = await pickNoteTask(plugin, file.path, note, {
		choices: (version) => duplicateTargets(version.tasks, key.taskName),
		placeholder: `Duplicate ${formatTimeOfDay(key.start)}–${formatTimeOfDay(key.end)} as…`,
		includeVault: true,
	})
	if (!picked) return false
	const target: ClockTarget = { name: picked.name, tags: picked.tags }
	const times = { start: key.start, end: key.end }
	return writeNewClock(
		plugin,
		file,
		target,
		times,
		describeClockDuplicated(key.taskName, target.name, times)
	)
}

/** Add a clock, then offer to take it (and the task line it added) back. */
async function writeNewClock(
	plugin: TaskTimeTracker,
	file: TFile,
	target: ClockTarget,
	times: FinishedClockTimes,
	message: string
): Promise<boolean> {
	// Decided on the content written, not the one picked from: the task may
	// have been added in the background while the picker was open.
	let addsTask = false
	const outcome = await rewriteNote(noteIo(plugin, file), (content) => {
		addsTask = !new TaskNote(content).findTask(target.name)
		return addClock(content, target, times)
	})
	if (!wrote(outcome)) return false
	showUndoNotice(message, async () =>
		wrote(
			await rewriteNote(noteIo(plugin, file), (content) =>
				removeClock(content, { taskName: target.name, ...times }, addsTask)
			)
		)
	)
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
	showUndoNotice(describeClockDeleted(key.taskName, key), async () =>
		wrote(
			await rewriteNote(noteIo(plugin, file), (content) =>
				addClock(content, { name: key.taskName, tags }, key)
			)
		)
	)
	return true
}

/** Tell about a write that did not happen; true when it did. */
export function wrote(outcome: RewriteOutcome): boolean {
	if (outcome === 'gone') showNotice(GONE_NOTICE)
	if (outcome === 'busy') showNotice(BUSY_NOTICE)
	return outcome === 'written'
}
