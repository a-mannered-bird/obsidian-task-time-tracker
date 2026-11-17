import { Notice } from 'obsidian'

/**
 * How long every notice about the clocks stays, buttons or not: long
 * enough to reach Change or Undo, and the same for all so none of them
 * reads as more or less important.
 */
export const NOTICE_DURATION = 8000

export type NoticeAction = { label: string; run: () => void }

/** Notice telling what happened, with buttons acting on it. */
export function showActionNotice(
	message: string,
	actions: NoticeAction[]
): Notice {
	const fragment = new DocumentFragment()
	fragment.createDiv({ text: message })
	const buttons = fragment.createDiv({
		cls: 'task-time-tracker-notice-buttons',
	})
	actions.forEach(({ label, run }, index) => {
		buttons
			.createEl('button', {
				text: label,
				cls: index === actions.length - 1 ? 'mod-cta' : undefined,
			})
			.addEventListener('click', run)
	})
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
						new Notice('The last action has been reverted.', NOTICE_DURATION)
				})
			},
		},
	])
	latestUndo = notice
	return notice
}
