import { Notice } from 'obsidian'

/**
 * Notice that stays until answered. Any click closes it (Obsidian's own
 * behavior), so `onClose` also runs after `onRestore`.
 */
export function showLostClocksNotice(
	message: string,
	onRestore: () => void,
	onClose: () => void
): Notice {
	const fragment = new DocumentFragment()
	fragment.createDiv({ text: message })
	const buttons = fragment.createDiv({
		cls: 'task-time-tracker-notice-buttons',
	})
	buttons
		.createEl('button', { text: 'Restore', cls: 'mod-cta' })
		.addEventListener('click', onRestore)
	buttons.createEl('button', { text: 'Dismiss' })
	const notice = new Notice(fragment, 0)
	notice.messageEl.addEventListener('click', onClose)
	return notice
}
