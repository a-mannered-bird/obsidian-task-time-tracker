import { Notice } from 'obsidian'
import type { DailyTarget } from 'core/dailyNotes'
import {
	clockChanges,
	describeHandOff,
	moveHandOff,
	type HandOff,
} from 'core/handOff'
import { recordWrites, rewriteNote, type NoteWrite } from 'core/noteRewrite'
import { parseTasks } from 'core/parser'
import { isToggleNotice } from 'core/toggle'
import { BUSY_NOTICE } from 'core/trackingRun'
import { describeStart, parseEndTime, parseStartTime } from 'core/typedTime'
import { promptTime } from 'ui/timePrompt'
import { showUndoNotice } from 'ui/undoNotice'
import type TaskTimeTracker from '../main'
import { NOTICE_DURATION, targetIo } from './target'
import { undoNoteWrite } from './undo'

const GONE_NOTICE = 'The clocks changed elsewhere, nothing was written.'

/**
 * Tell what a tracking run did. A single run that started or stopped
 * clocks gets one notice naming the hand-off, with Change (when it
 * happened) and Undo, in place of the engine's per-clock "toggled" notices;
 * any other write gets the run's notices with Undo. A sequence of runs
 * (log interruption) is no single hand-off, so it only offers Undo.
 */
export function reportRun(
	plugin: TaskTimeTracker,
	target: DailyTarget,
	notices: string[],
	write: NoteWrite | null,
	singleRun: boolean
): void {
	if (!write) {
		for (const message of notices) new Notice(message, NOTICE_DURATION)
		return
	}
	const handOff = clockChanges(
		parseTasks(write.before.split('\n')),
		parseTasks(write.after.split('\n'))
	)
	const message = singleRun ? describeHandOff(handOff) : null
	if (message) {
		for (const notice of notices) {
			if (!isToggleNotice(notice)) new Notice(notice, NOTICE_DURATION)
		}
		offerHandOff(plugin, target, handOff, message, write)
		return
	}
	showUndoNotice(
		notices.join('\n') || 'Note updated.',
		undoNoteWrite(targetIo(plugin, target), write)
	)
}

function offerHandOff(
	plugin: TaskTimeTracker,
	target: DailyTarget,
	handOff: HandOff,
	message: string,
	write: NoteWrite
): void {
	showUndoNotice(message, undoNoteWrite(targetIo(plugin, target), write), [
		{
			label: 'Change',
			run: () => void changeHandOff(plugin, target, handOff, message),
		},
	])
}

/** Ask when the hand-off really happened and move it there. */
async function changeHandOff(
	plugin: TaskTimeTracker,
	target: DailyTarget,
	handOff: HandOff,
	message: string
): Promise<void> {
	const now = new Date()
	const at = await promptHandOffTime(plugin, handOff, message, now)
	if (!at) return
	const recorder = recordWrites(targetIo(plugin, target))
	const outcome = await rewriteNote(recorder.io, (content) =>
		moveHandOff(content, handOff, at)
	)
	if (outcome === 'gone') new Notice(GONE_NOTICE, NOTICE_DURATION)
	if (outcome === 'busy') new Notice(BUSY_NOTICE, NOTICE_DURATION)
	const write = recorder.written()
	if (!write) return
	const moved = moveTimes(handOff, at)
	offerHandOff(plugin, target, moved, describeHandOff(moved) ?? message, write)
}

/**
 * A stop (or switch) ends after its clocks' latest start; a mere start
 * moves on its own day, before or after its current time.
 */
function promptHandOffTime(
	plugin: TaskTimeTracker,
	handOff: HandOff,
	message: string,
	now: Date
): Promise<Date | null> {
	const request = {
		title: 'Change the time',
		reference: now,
		confirmText: 'Change',
	}
	if (handOff.stopped.length > 0) {
		const latestStart = new Date(
			Math.max(...handOff.stopped.map((clock) => clock.start.valueOf()))
		)
		return promptTime(plugin.app, {
			...request,
			description: `${message}. ${describeStart(latestStart, now)}`,
			parse: (text) => parseEndTime(text, latestStart, now),
		})
	}
	const [started] = handOff.started
	if (!started) return Promise.resolve(null)
	return promptTime(plugin.app, {
		...request,
		description: `${message}.`,
		parse: (text) => parseStartTime(text, started.start, now),
	})
}

function moveTimes(handOff: HandOff, at: Date): HandOff {
	return {
		stopped: handOff.stopped.map((clock) => ({ ...clock, end: at })),
		started: handOff.started.map((clock) => ({ ...clock, start: at })),
	}
}
