import { Notice } from 'obsidian'

const ACTION_DURATION = 8000

/** Notice telling what happened, with one button acting on it. */
export function showActionNotice(
	message: string,
	action: string,
	onAction: () => void
): Notice {
	const fragment = new DocumentFragment()
	fragment.createDiv({ text: message })
	fragment
		.createDiv({ cls: 'task-time-tracker-notice-buttons' })
		.createEl('button', { text: action, cls: 'mod-cta' })
		.addEventListener('click', onAction)
	return new Notice(fragment, ACTION_DURATION)
}

/** Notice telling what was written, with a button writing it back. */
export function showUndoNotice(message: string, onUndo: () => void): Notice {
	return showActionNotice(message, 'Undo', onUndo)
}
