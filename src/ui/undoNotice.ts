import { Notice } from 'obsidian'

const UNDO_DURATION = 8000

/** Notice telling what was written, with a button writing it back. */
export function showUndoNotice(message: string, onUndo: () => void): Notice {
	const fragment = new DocumentFragment()
	fragment.createDiv({ text: message })
	fragment
		.createDiv({ cls: 'task-time-tracker-notice-buttons' })
		.createEl('button', { text: 'Undo', cls: 'mod-cta' })
		.addEventListener('click', onUndo)
	return new Notice(fragment, UNDO_DURATION)
}
