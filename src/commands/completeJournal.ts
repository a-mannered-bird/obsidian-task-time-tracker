import { Notice, type TFile } from 'obsidian'
import { applyCompletion, isEmptyPlan, planCompletion } from 'core/complete'
import { TaskNote } from 'core/note'
import { readFrontmatterTime } from 'core/time'
import { confirm } from 'ui/ConfirmModal'
import type TaskTimeTracker from '../main'
import { NOTICE_DURATION, resolveTargetFileOrNotify } from './target'

export function registerCompleteJournalCommand(plugin: TaskTimeTracker) {
	plugin.addCommand({
		id: 'complete-journal-entry',
		name: 'Complete journal entry',
		icon: 'book-check',
		callback: () => void completeJournal(plugin),
	})
}

/**
 * End-of-day cleanup: close running clocks (at the bed time when set), tick
 * every clocked task, delete tasks that were never clocked.
 */
async function completeJournal(plugin: TaskTimeTracker) {
	const { app } = plugin
	const file = resolveTargetFileOrNotify(plugin)
	if (!file) return

	const note = new TaskNote(await app.vault.read(file))
	const plan = planCompletion(note)
	if (isEmptyPlan(plan)) {
		new Notice('Nothing to complete.', NOTICE_DURATION)
		return
	}

	if (plan.toRemove.length > 0) {
		const message: string[] = []
		if (plan.toClose.length > 0) {
			message.push(
				`${count(plan.toClose.length, 'running clock')} will be closed.`
			)
		}
		if (plan.toTick.length > 0) {
			message.push(`${count(plan.toTick.length, 'task')} will be ticked.`)
		}
		message.push('These tasks were never clocked and will be deleted:')

		const confirmed = await confirm(app, {
			title: 'Complete journal entry',
			message,
			items: plan.toRemove.map((task) => task.name),
			confirmText: 'Complete',
		})
		if (!confirmed) return
	}

	const at = bedTime(plugin, file) ?? new Date()
	applyCompletion(note, plan, at)
	await app.vault.modify(file, note.toString())
	new Notice(
		`Journal completed: ${plan.toClose.length} closed, ${plan.toTick.length} ticked, ${plan.toRemove.length} removed.`,
		NOTICE_DURATION
	)
}

function count(n: number, noun: string): string {
	return `${n} ${noun}${n === 1 ? '' : 's'}`
}

/** Bed time from the frontmatter, when set and valid; clocks close at it. */
function bedTime(plugin: TaskTimeTracker, file: TFile): Date | null {
	const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter
	return readFrontmatterTime(frontmatter?.[plugin.settings.bedTimeProperty])
}
