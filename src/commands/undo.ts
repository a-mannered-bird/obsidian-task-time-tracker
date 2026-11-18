import { rewriteNote, undoWrite, type NoteWrite } from 'core/noteRewrite'
import { NOTICE_ICON } from 'core/noticeText'
import { BUSY_NOTICE, type NoteIo } from 'core/trackingRun'
import { showNotice } from 'ui/notice'

const CHANGED_SINCE = `${NOTICE_ICON.warning} The note changed since, nothing was undone.`

/** Undo for a recorded write: the note as it was, unless it changed since. */
export function undoNoteWrite(
	io: NoteIo,
	write: NoteWrite
): () => Promise<boolean> {
	return async () => {
		const outcome = await rewriteNote(io, undoWrite(write))
		if (outcome === 'gone') showNotice(CHANGED_SINCE)
		if (outcome === 'busy') showNotice(BUSY_NOTICE)
		return outcome === 'written'
	}
}
