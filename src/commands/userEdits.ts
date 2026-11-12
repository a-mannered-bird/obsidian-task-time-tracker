import { Transaction } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { editorInfoField } from 'obsidian'
import type TaskTimeTracker from '../main'

/** User event Obsidian gives the transaction reloading a note from disk. */
const RELOAD_EVENT = 'set'

/** The user's last change of a note in an editor. */
export type UserEdit = {
	/** When it happened, epoch ms. */
	at: number
	/** The note as the editor held it right after; read only when needed. */
	content: () => string
}

/**
 * Record the user's last change of each note in an editor (by path, in
 * `plugin.userEdits`). Typing, deleting, undo and redo carry a user event;
 * so does Obsidian's own reload of a note after an outside write, under the
 * name "set" (observed on Obsidian 1.15, not documented), which is exactly
 * the change that must not count as the user's.
 */
export function registerUserEditLog(plugin: TaskTimeTracker) {
	plugin.registerEditorExtension(
		EditorView.updateListener.of((update) => {
			if (!update.docChanged) return
			const byUser = update.transactions.some((transaction) => {
				const event = transaction.annotation(Transaction.userEvent)
				return event !== undefined && event !== RELOAD_EVENT
			})
			const file = update.state.field(editorInfoField, false)?.file
			if (!byUser || !file) return
			const { doc } = update.state
			plugin.userEdits.set(file.path, {
				at: Date.now(),
				content: () => doc.toString(),
			})
		})
	)
}
