import { MarkdownView, Notice, type TFile } from 'obsidian'
import { resolveTargetFile } from 'core/dailyNotes'
import { TaskNote } from 'core/note'
import type { NoteIo } from 'core/trackingRun'
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

/**
 * Compare-and-swap access to the note for writers that must not overwrite
 * a change made since their read. A successful write is acknowledged, so
 * the clocks it removes are not reported as lost.
 */
export function noteIo(plugin: TaskTimeTracker, file: TFile): NoteIo {
	return {
		read: () => readNoteContent(plugin, file),
		replace: async (expected, next) => {
			await saveOpenEditors(plugin, file)
			let replaced = false
			await plugin.app.vault.process(file, (current) => {
				replaced = current === expected
				return replaced ? next : current
			})
			if (replaced) plugin.lostClocks.acknowledge(file.path, next)
			return replaced
		},
	}
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
