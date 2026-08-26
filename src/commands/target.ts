import { Notice, type TFile } from 'obsidian'
import { resolveTargetFile } from 'core/dailyNotes'
import type TaskTimeTracker from '../main'

export const NOTICE_DURATION = 5000

/** Daily note a command should edit, or null after telling the user why not. */
export function resolveTargetFileOrNotify(
	plugin: TaskTimeTracker
): TFile | null {
	const file = resolveTargetFile(
		plugin.app,
		plugin.getDailyLogStoreConfig().dailyNotes
	)
	if (!file) {
		new Notice(
			'No daily note to act on: the active file is not a daily note, and the vault has no daily note.',
			NOTICE_DURATION
		)
	}
	return file
}
