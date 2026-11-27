import { Modal } from 'obsidian'
import { mount, unmount } from 'svelte'
import { exactNameQuery } from 'core/taskManager'
import Manager from '../components/Manager.svelte'
import type { ManagerTab } from '../components/managerTable.svelte'
import type TaskTimeTracker from '../main'

/**
 * Task management panel on its Tasks tab: a table over every task of the
 * vault's daily notes, filtered down to `task` when given.
 */
export function openTaskManager(plugin: TaskTimeTracker, task?: string): void {
	new ManagerModal(plugin, 'tasks', {
		task: task === undefined ? '' : exactNameQuery(task),
	}).open()
}

/** The same panel on its Tags tab. */
export function openTagManager(plugin: TaskTimeTracker): void {
	new ManagerModal(plugin, 'tags').open()
}

/** The same panel on its Metrics tab, filtered to `metric` when given. */
export function openMetricManager(
	plugin: TaskTimeTracker,
	metric?: string
): void {
	new ManagerModal(plugin, 'metrics', { metric: metric ?? '' }).open()
}

/** The filters the tabs open with. */
type Queries = { task?: string; metric?: string }

class ManagerModal extends Modal {
	private view: ReturnType<typeof mount> | undefined

	constructor(
		private plugin: TaskTimeTracker,
		private tab: ManagerTab,
		private queries: Queries = {}
	) {
		super(plugin.app)
	}

	onOpen(): void {
		this.setTitle('Manage tracking data')
		this.modalEl.addClass('task-time-tracker-manager-modal')
		this.view = mount(Manager, {
			target: this.contentEl,
			props: {
				plugin: this.plugin,
				close: () => this.close(),
				tab: this.tab,
				taskQuery: this.queries.task ?? '',
				tagQuery: '',
				metricQuery: this.queries.metric ?? '',
			},
		})
	}

	onClose(): void {
		if (this.view) void unmount(this.view)
		this.contentEl.empty()
	}
}
