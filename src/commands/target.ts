import { MarkdownView, Notice, type TFile } from 'obsidian'
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
export async function readNoteContent(
	plugin: TaskTimeTracker,
	file: TFile
): Promise<string> {
	await saveOpenEditors(plugin, file)
	return plugin.app.vault.read(file)
}

export async function readTaskNote(
	plugin: TaskTimeTracker,
	file: TFile
): Promise<TaskNote> {
	return new TaskNote(await readNoteContent(plugin, file))
}

/** Save the editors of the note holding changes of the user not on disk yet. */
export async function saveOpenEditors(plugin: TaskTimeTracker, file: TFile) {
	// Only after an edit of the user newer than the file: an editor can also
	// differ from the file because Obsidian has not refreshed it yet after an
	// outside write (sync), and saving that one would overwrite the write.
	const lastEdit = plugin.userEdits.get(file.path)
	if (lastEdit === undefined || lastEdit <= file.stat.mtime) return
	for (const leaf of plugin.app.workspace.getLeavesOfType('markdown')) {
		const { view } = leaf
		if (view instanceof MarkdownView && view.file === file) await view.save()
	}
}
