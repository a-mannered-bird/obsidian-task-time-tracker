import {
	applyCompletion,
	goalTaskChoices,
	HAS_GOALS_HEADING,
	HAS_GOALS_NOTE,
	isEmptyPlan,
	planCompletion,
	withRemovals,
} from 'core/complete'
import { clockChanges, describeStops } from 'core/handOff'
import { TaskNote } from 'core/note'
import { recordWrites, rewriteNote } from 'core/noteRewrite'
import { NOTICE_ICON } from 'core/noticeText'
import { BUSY_NOTICE } from 'core/trackingRun'
import { describeCompletion } from 'core/tracker'
import { confirmChoosing } from 'ui/ConfirmModal'
import { showNotice } from 'ui/notice'
import { showUndoNotice } from 'ui/undoNotice'
import type TaskTimeTracker from '../main'
import { DAY_END_COMMAND, runTimeCommand } from './frontmatterTime'
import {
	currentTarget,
	noteIo,
	stopContext,
	readNoteContent,
	readTaskNote,
} from './target'
import { undoNoteWrite } from './undo'

const NOTHING_TO_COMPLETE = `${NOTICE_ICON.info} Nothing to complete.`
const CHANGED_MEANWHILE = `${NOTICE_ICON.warning} The note changed meanwhile, the day was not ended.`

export function registerCompleteJournalCommand(plugin: TaskTimeTracker) {
	plugin.addCommand({
		// Kept from when the command was named "Complete journal entry".
		id: 'complete-journal-entry',
		name: 'End day',
		icon: 'book-check',
		callback: () => void endDay(plugin),
	})
}

/**
 * End-of-day cleanup: ask for the end of day, even when the note has one,
 * then close running clocks at it, tick every clocked task and delete the
 * tasks that were never clocked, except those with goals unless picked.
 */
export async function endDay(plugin: TaskTimeTracker) {
	const { app } = plugin
	const { file } = currentTarget(plugin)
	if (!file || isEmptyPlan(planCompletion(await readTaskNote(plugin, file)))) {
		showNotice(NOTHING_TO_COMPLETE)
		return
	}

	const at = await runTimeCommand(plugin, DAY_END_COMMAND)
	if (!at) return

	// Read after the end of day was written, or writing the note would undo it.
	const content = await readNoteContent(plugin, file)
	const note = new TaskNote(content)
	let plan = planCompletion(note)
	if (plan.toRemove.length > 0 || plan.withGoals.length > 0) {
		const picked = await confirmChoosing(app, {
			title: 'End day',
			message: describeCompletion(plan),
			items: plan.toRemove.map((task) => task.name),
			confirmText: 'End day',
			choices: {
				heading: HAS_GOALS_HEADING,
				note: HAS_GOALS_NOTE,
				options: goalTaskChoices(plan),
			},
		})
		if (!picked) return
		plan = withRemovals(plan, picked)
	}

	applyCompletion(note, plan, at)
	const completed = note.toString()
	const io = noteIo(plugin, file)
	const recorder = recordWrites(io)
	// Applies what was confirmed, so only to the note it was planned from.
	const outcome = await rewriteNote(recorder.io, (current) =>
		current === content ? completed : null
	)
	if (outcome === 'gone') showNotice(CHANGED_MEANWHILE)
	if (outcome === 'busy') showNotice(BUSY_NOTICE)
	const write = recorder.written()
	if (!write) return
	const summary = `${NOTICE_ICON.dayEnded} Day ended: ${plan.toClose.length} closed, ${plan.toTick.length} ticked, ${plan.toRemove.length} removed.`
	const stops = describeStops(
		clockChanges(
			new TaskNote(write.before).tasks,
			new TaskNote(write.after).tasks
		).stopped,
		stopContext(plugin, file.path, write.after)
	)
	showUndoNotice(
		stops ? `${summary}\n${stops}.` : summary,
		undoNoteWrite(io, write)
	)
}
