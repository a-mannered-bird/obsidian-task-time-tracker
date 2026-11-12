import { MarkdownView, type TFile } from 'obsidian'
import {
	createDailyNote,
	resolveTarget,
	type DailyTarget,
} from 'core/dailyNotes'
import { TaskNote } from 'core/note'
import type { NoteIo } from 'core/trackingRun'
import type TaskTimeTracker from '../main'

export const NOTICE_DURATION = 5000

/** The daily note commands act on: see resolveTarget. */
export function currentTarget(plugin: TaskTimeTracker): DailyTarget {
	return resolveTarget(plugin.app, plugin.getDailyNotesConfig())
}

/** The target's file, created when this is its first write. */
export async function ensureTargetFile(
	plugin: TaskTimeTracker,
	target: DailyTarget
): Promise<TFile> {
	return (
		plugin.app.vault.getFileByPath(target.path) ??
		createDailyNote(plugin.app, plugin.getDailyNotesConfig(), target.date)
	)
}

/**
 * noteIo for a target that may not exist yet: it reads as empty, and a
 * write over that empty content creates it.
 */
export function targetIo(plugin: TaskTimeTracker, target: DailyTarget): NoteIo {
	const file = () => plugin.app.vault.getFileByPath(target.path)
	return {
		read: async () => {
			const existing = file()
			return existing ? readNoteContent(plugin, existing) : ''
		},
		replace: async (expected, next) => {
			const existing = file()
			if (!existing && expected !== '') return false
			const written = existing ?? (await ensureTargetFile(plugin, target))
			return noteIo(plugin, written).replace(expected, next)
		},
	}
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
