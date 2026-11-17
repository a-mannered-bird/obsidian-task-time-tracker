import { Notice } from 'obsidian'
import { rewriteNote, undoWrite, type NoteWrite } from 'core/noteRewrite'
import { BUSY_NOTICE, type NoteIo } from 'core/trackingRun'
import { NOTICE_DURATION } from './target'

const CHANGED_SINCE = 'The note changed since, nothing was undone.'

/** Undo for a recorded write: the note as it was, unless it changed since. */
export function undoNoteWrite(
	io: NoteIo,
	write: NoteWrite
): () => Promise<boolean> {
	return async () => {
		const outcome = await rewriteNote(io, undoWrite(write))
		if (outcome === 'gone') new Notice(CHANGED_SINCE, NOTICE_DURATION)
		if (outcome === 'busy') new Notice(BUSY_NOTICE, NOTICE_DURATION)
		return outcome === 'written'
	}
}
