import { Notice, type TFile } from 'obsidian'
import { applyCompletion, isEmptyPlan, planCompletion } from 'core/complete'
import { DAY_END_PROPERTY, readFrontmatterTime } from 'core/time'
import { describeCompletion } from 'core/tracker'
import { confirm } from 'ui/ConfirmModal'
import type TaskTimeTracker from '../main'
import { DAY_END_COMMAND, runTimeCommand } from './frontmatterTime'
import { currentTarget, NOTICE_DURATION, readTaskNote } from './target'

const NOTHING_TO_COMPLETE = 'Nothing to complete.'

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
 * End-of-day cleanup: ask for the end of day when the note has none, then
 * close running clocks at it, tick every clocked task and delete the tasks
 * that were never clocked. `dayEnd` is one just written by the caller,
 * which the metadata cache may not show yet.
 */
export async function endDay(plugin: TaskTimeTracker, dayEnd?: Date) {
	const { app } = plugin
	const { file } = currentTarget(plugin)
	if (!file || isEmptyPlan(planCompletion(await readTaskNote(plugin, file)))) {
		new Notice(NOTHING_TO_COMPLETE, NOTICE_DURATION)
		return
	}

	const at =
		dayEnd ??
		savedDayEnd(plugin, file) ??
		(await runTimeCommand(plugin, DAY_END_COMMAND))
	if (!at) return

	// Read after the end of day was written, or writing the note would undo it.
	const note = await readTaskNote(plugin, file)
	const plan = planCompletion(note)
	if (plan.toRemove.length > 0) {
		const confirmed = await confirm(app, {
			title: 'End day',
			message: describeCompletion(plan),
			items: plan.toRemove.map((task) => task.name),
			confirmText: 'End day',
		})
		if (!confirmed) return
	}

	applyCompletion(note, plan, at)
	const content = note.toString()
	await app.vault.modify(file, content)
	plugin.lostClocks.acknowledge(file.path, content)
	new Notice(
		`Day ended: ${plan.toClose.length} closed, ${plan.toTick.length} ticked, ${plan.toRemove.length} removed.`,
		NOTICE_DURATION
	)
}

function savedDayEnd(plugin: TaskTimeTracker, file: TFile): Date | null {
	const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter
	return readFrontmatterTime(frontmatter?.[DAY_END_PROPERTY])
}
