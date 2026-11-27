import { ItemView, WorkspaceLeaf } from 'obsidian'
import { mount, unmount } from 'svelte'
import DailyView from '../components/DailyView.svelte'
import type { DailyViewTab } from '../core/dailyViewTabs'
import type TaskTimeTracker from '../main'

export const DAILY_VIEW = 'task-time-tracker-daily-view'

type TabSelector = { select(tab: DailyViewTab): void }

/** The component's exports are untyped outside Svelte files. */
function canSelectTab(
	exports: Record<string, unknown>
): exports is TabSelector {
	return typeof exports.select === 'function'
}

export class DailyItemView extends ItemView {
	private plugin: TaskTimeTracker
	private dailyView: ReturnType<typeof mount> | undefined

	constructor(leaf: WorkspaceLeaf, plugin: TaskTimeTracker) {
		super(leaf)
		this.plugin = plugin
	}

	getViewType() {
		return DAILY_VIEW
	}

	getDisplayText() {
		return 'Daily view'
	}

	getIcon() {
		return 'timer'
	}

	async onOpen() {
		this.mountView()
	}

	async onClose() {
		await this.unmountView()
	}

	/** Re-create the Svelte component so it picks up new settings. */
	async remount() {
		await this.unmountView()
		this.mountView()
	}

	selectTab(tab: DailyViewTab) {
		if (this.dailyView && canSelectTab(this.dailyView))
			this.dailyView.select(tab)
	}

	private mountView() {
		this.dailyView = mount(DailyView, {
			target: this.contentEl,
			props: {
				app: this.app,
				plugin: this.plugin,
			},
		})
	}

	private async unmountView() {
		if (this.dailyView) {
			await unmount(this.dailyView)
			this.dailyView = undefined
		}
	}
}
