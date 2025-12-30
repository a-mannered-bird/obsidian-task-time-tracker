import { ItemView, WorkspaceLeaf } from 'obsidian'

// Import the Counter Svelte component and the `mount` and `unmount` methods.
import DailyView from './src/components/DailyView.svelte'
import { mount, unmount } from 'svelte'

export const DAILY_VIEW = 'daily-view'

export class ExampleView extends ItemView {
	// A variable to hold on to the Counter instance mounted in this ItemView.
	dailyView: ReturnType<typeof DailyView> | undefined

	constructor(leaf: WorkspaceLeaf) {
		super(leaf)
	}

	getViewType() {
		return DAILY_VIEW
	}

	getDisplayText() {
		return 'Daily view'
	}

	async onOpen() {
		this.dailyView = mount(DailyView, {
			target: this.contentEl,
			props: {
				app: this.app,
			},
		})
	}

	async onClose() {
		if (this.dailyView) {
			// Remove the Counter from the ItemView.
			unmount(this.dailyView)
		}
	}
}
