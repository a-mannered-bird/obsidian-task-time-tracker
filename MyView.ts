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
		// Attach the Svelte component to the ItemViews content element and provide the needed props.
		this.dailyView = mount(DailyView, {
			target: this.contentEl,
			props: {},
		})
	}

	async onClose() {
		if (this.dailyView) {
			// Remove the Counter from the ItemView.
			unmount(this.dailyView)
		}
	}
}
