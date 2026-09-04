import { Modal } from 'obsidian'
import { mount, unmount } from 'svelte'
import TaskManager from '../components/TaskManager.svelte'
import type TaskTimeTracker from '../main'

/** Task management panel: table over every task of the vault's daily notes. */
export function openTaskManager(plugin: TaskTimeTracker): void {
	new TaskManagerModal(plugin).open()
}

class TaskManagerModal extends Modal {
	private view: ReturnType<typeof mount> | undefined

	constructor(private plugin: TaskTimeTracker) {
		super(plugin.app)
	}

	onOpen(): void {
		this.setTitle('Manage tasks')
		this.modalEl.addClass('task-time-tracker-manager-modal')
		this.view = mount(TaskManager, {
			target: this.contentEl,
			props: { plugin: this.plugin, close: () => this.close() },
		})
	}

	onClose(): void {
		if (this.view) void unmount(this.view)
		this.contentEl.empty()
	}
}
