import { Notice } from 'obsidian'
import { NOTICE_ICON } from 'core/noticeText'
import { appendNoticeText, NOTICE_DURATION, showNotice } from './notice'

export type NoticeAction = { label: string; run: () => void }

/** Notice telling what happened, with buttons acting on it. */
export function showActionNotice(
	message: string,
	actions: NoticeAction[]
): Notice {
	const fragment = new DocumentFragment()
	appendNoticeText(fragment.createDiv(), message)
	const buttons = fragment.createDiv({
		cls: 'task-time-tracker-notice-buttons',
	})
	for (const { label, run } of actions) {
		buttons.createEl('button', { text: label }).addEventListener('click', run)
	}
	return new Notice(fragment, NOTICE_DURATION)
}

/** Only the latest change can be undone; its notice goes when another lands. */
let latestUndo: Notice | null = null

/**
 * Notice telling what was written, with Undo (after `actions`). `undo`
 * resolves true once the note is back as it was, which a short notice
 * confirms; when it is not, `undo` tells why itself.
 */
export function showUndoNotice(
	message: string,
	undo: () => Promise<boolean>,
	actions: NoticeAction[] = []
): Notice {
	latestUndo?.hide()
	const notice = showActionNotice(message, [
		...actions,
		{
			label: 'Undo',
			run: () => {
				notice.hide()
				if (latestUndo === notice) latestUndo = null
				void undo().then((done) => {
					if (done)
						showNotice(
							`${NOTICE_ICON.undone} The last action has been reverted.`
						)
				})
			},
		},
	])
	latestUndo = notice
	return notice
}
