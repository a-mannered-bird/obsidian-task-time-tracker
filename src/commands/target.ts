import { MarkdownView, Notice, type App, type TFile } from 'obsidian'
import { resolveTargetFile } from 'core/dailyNotes'
import { TaskNote } from 'core/note'
import type TaskTimeTracker from '../main'

export const NOTICE_DURATION = 5000

/** Daily note a command should edit, or null after telling the user why not. */
export function resolveTargetFileOrNotify(
	plugin: TaskTimeTracker
): TFile | null {
	const file = resolveTargetFile(plugin.app, plugin.getDailyNotesConfig())
	if (!file) {
		new Notice(
			'No daily note to act on: the active file is not a daily note, and the vault has no daily note.',
			NOTICE_DURATION
		)
	}
	return file
}

/**
 * The note as the user sees it right now. An open editor only writes to disk
 * two seconds after the last change, so a command run right after an edit or
 * an undo would otherwise act on the previous content, and its write would
 * then discard that edit.
 */
export async function readTaskNote(app: App, file: TFile): Promise<TaskNote> {
	await saveOpenEditors(app, file)
	return new TaskNote(await app.vault.read(file))
}

async function saveOpenEditors(app: App, file: TFile) {
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		const { view } = leaf
		if (!(view instanceof MarkdownView) || view.file !== file) continue
		// Saving an unchanged editor would still touch the file and re-fire
		// every change listener.
		if (view.getViewData() !== (await app.vault.read(file))) await view.save()
	}
}
