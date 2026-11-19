import type { DailyTarget } from 'core/dailyNotes'
import {
	describeMarkChanges,
	keepDayStartOnFirstClock,
} from 'core/dayBoundaries'
import {
	clockChanges,
	describeHandOff,
	moveHandOff,
	type HandOff,
} from 'core/handOff'
import { recordWrites, rewriteNote, type NoteWrite } from 'core/noteRewrite'
import { NOTICE_ICON, plainNoticeText } from 'core/noticeText'
import { parseTasks } from 'core/parser'
import { isToggleNotice } from 'core/toggle'
import { BUSY_NOTICE, CLOCKS_CHANGED_NOTICE } from 'core/trackingRun'
import { describeStart, parseEndTime, parseStartTime } from 'core/typedTime'
import { showNotice } from 'ui/notice'
import { promptTime } from 'ui/timePrompt'
import { showUndoNotice } from 'ui/undoNotice'
import type TaskTimeTracker from '../main'
import { stopContext, targetIo } from './target'
import { undoNoteWrite } from './undo'

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
		for (const message of notices) showNotice(message)
		return
	}
	const handOff = clockChanges(
		parseTasks(write.before.split('\n')),
		parseTasks(write.after.split('\n'))
	)
	const message = singleRun
		? describeHandOff(handOff, stopContext(plugin, target.path, write.after))
		: null
	if (message) {
		for (const notice of notices) {
			if (!isToggleNotice(notice)) showNotice(notice)
		}
		offerHandOff(plugin, target, handOff, message, write)
		return
	}
	const lines = [
		...notices,
		...describeMarkChanges(write.before, write.after, new Date()),
	]
	showUndoNotice(
		lines.join('\n') || `${NOTICE_ICON.updated} Note updated.`,
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
	// The start of day the run set with its first clock, said in the same
	// notice: its Change moves both, its Undo removes both.
	const text = [
		message,
		...describeMarkChanges(write.before, write.after, new Date()),
	].join('\n')
	showUndoNotice(text, undoNoteWrite(targetIo(plugin, target), write), [
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
	const at = await promptHandOffTime(plugin, handOff, message)
	if (!at) return
	const recorder = recordWrites(targetIo(plugin, target))
	const outcome = await rewriteNote(recorder.io, (content) => {
		const moved = moveHandOff(content, handOff, at)
		return moved === null ? null : keepDayStartOnFirstClock(content, moved)
	})
	if (outcome === 'gone') showNotice(CLOCKS_CHANGED_NOTICE)
	if (outcome === 'busy') showNotice(BUSY_NOTICE)
	const write = recorder.written()
	if (!write) return
	const moved = moveTimes(handOff, at)
	const described = describeHandOff(
		moved,
		stopContext(plugin, target.path, write.after)
	)
	offerHandOff(plugin, target, moved, described ?? message, write)
}

/**
 * A stop (or switch) ends after its clocks' latest start; a mere start
 * moves on its own day, before or after its current time.
 */
function promptHandOffTime(
	plugin: TaskTimeTracker,
	handOff: HandOff,
	message: string
): Promise<Date | null> {
	const request = {
		title: 'Change the time',
		confirmText: 'Change',
	}
	if (handOff.stopped.length > 0) {
		const latestStart = new Date(
			Math.max(...handOff.stopped.map((clock) => clock.start.valueOf()))
		)
		return promptTime(plugin.app, {
			...request,
			description: `${plainNoticeText(message)}. ${describeStart(latestStart, new Date())}`,
			parse: (text, now) => parseEndTime(text, latestStart, now),
		})
	}
	const [started] = handOff.started
	if (!started) return Promise.resolve(null)
	return promptTime(plugin.app, {
		...request,
		description: `${plainNoticeText(message)}.`,
		parse: (text, now) => parseStartTime(text, started.start, now),
	})
}

function moveTimes(handOff: HandOff, at: Date): HandOff {
	return {
		stopped: handOff.stopped.map((clock) => ({ ...clock, end: at })),
		started: handOff.started.map((clock) => ({ ...clock, start: at })),
	}
}
