import { Modal } from 'obsidian'
import { mount, unmount } from 'svelte'
import { exactNameQuery } from 'core/taskManager'
import TaskManager from '../components/TaskManager.svelte'
import type TaskTimeTracker from '../main'

/**
 * Task management panel: table over every task of the vault's daily notes,
 * filtered down to `task` when given.
 */
export function openTaskManager(plugin: TaskTimeTracker, task?: string): void {
	new TaskManagerModal(plugin, task).open()
}

class TaskManagerModal extends Modal {
	private view: ReturnType<typeof mount> | undefined

	constructor(
		private plugin: TaskTimeTracker,
		private task?: string
	) {
		super(plugin.app)
	}

	onOpen(): void {
		this.setTitle('Manage tasks')
		this.modalEl.addClass('task-time-tracker-manager-modal')
		this.view = mount(TaskManager, {
			target: this.contentEl,
			props: {
				plugin: this.plugin,
				close: () => this.close(),
				initialQuery: this.task === undefined ? '' : exactNameQuery(this.task),
			},
		})
	}

	onClose(): void {
		if (this.view) void unmount(this.view)
		this.contentEl.empty()
	}
}
