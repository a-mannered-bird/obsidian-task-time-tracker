import { Notice } from 'obsidian'
import type { BulkEditVault } from 'core/bulkEdit'
import {
	describeLostClocks,
	restoreLostClocks,
	type LostClock,
} from 'core/lostClocks'
import { showLostClocksNotice } from 'ui/lostClocksNotice'
import type TaskTimeTracker from '../main'
import { NOTICE_DURATION, saveOpenEditors } from './target'

/**
 * Watch the daily notes for clocks that vanish in a change made outside the
 * plugin and the editor (a sync merging two versions badly) and offer to
 * put them back.
 */
export function registerLostClockWatch(plugin: TaskTimeTracker) {
	const notices = new Map<string, Notice>()

	plugin.register(
		plugin.dailyLogs.onChange((change) => {
			if (!change) return
			const { path, log, previous } = change
			notices.get(path)?.hide()
			notices.delete(path)
			if (!log) {
				plugin.lostClocks.forget(path)
				return
			}
			const lost = plugin.lostClocks.noteChanged(
				path,
				previous && { tasks: previous.log.tasks, mtime: previous.mtime },
				log.tasks,
				plugin.userEdits.get(path)
			)
			if (lost.length === 0) return
			notices.set(
				path,
				showLostClocksNotice(
					describeLostClocks(log.file.basename, lost),
					() => void restore(plugin, path, lost),
					() => {
						plugin.lostClocks.forget(path)
						notices.delete(path)
					}
				)
			)
		})
	)
	plugin.register(() => notices.forEach((notice) => notice.hide()))
}

async function restore(
	plugin: TaskTimeTracker,
	path: string,
	lost: LostClock[]
) {
	const { app } = plugin
	const file = app.vault.getFileByPath(path)
	if (!file) {
		new Notice(`${path} no longer exists.`, NOTICE_DURATION)
		return
	}
	await saveOpenEditors(plugin, file)
	await app.vault.process(file, (content) => restoreLostClocks(content, lost))
	new Notice(
		lost.length === 1 ? 'Clock restored.' : `${lost.length} clocks restored.`,
		NOTICE_DURATION
	)
}

/**
 * The vault as the bulk runner needs it, telling the watch about every
 * write: clocks a rename, merge or delete removes are not lost.
 */
export function ownWritesVault(plugin: TaskTimeTracker): BulkEditVault {
	const { vault } = plugin.app
	return {
		getFileByPath: (path) => vault.getFileByPath(path),
		process: async (file, fn, options) => {
			const written = await vault.process(file, fn, options)
			plugin.lostClocks.acknowledge(file.path, written)
			return written
		},
	}
}
