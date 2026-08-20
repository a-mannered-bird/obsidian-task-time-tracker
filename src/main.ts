import { Plugin, type WorkspaceLeaf } from 'obsidian'
import { registerTrackingCommands } from './commands/tracking'
import { DailyLogStore, type DailyLogStoreConfig } from './core/dailyLogs'
import {
	DEFAULT_SETTINGS,
	TaskTimeTrackerSettingTab,
	type TaskTimeTrackerSettings,
} from './settings'
import { DailyItemView, DAILY_VIEW } from './views/DailyItemView'

export default class TaskTimeTracker extends Plugin {
	settings: TaskTimeTrackerSettings = DEFAULT_SETTINGS
	dailyLogs: DailyLogStore = new DailyLogStore(this.app, () =>
		this.getDailyLogStoreConfig()
	)

	async onload() {
		await this.loadSettings()
		this.dailyLogs.register(this)

		this.registerView(DAILY_VIEW, (leaf) => new DailyItemView(leaf, this))

		this.addRibbonIcon('timer', 'Open daily view', () => {
			void this.activateDailyView()
		})

		this.addCommand({
			id: 'open-daily-view',
			name: 'Open daily view',
			callback: () => {
				void this.activateDailyView()
			},
		})

		registerTrackingCommands(this)

		this.addSettingTab(new TaskTimeTrackerSettingTab(this.app, this))
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<TaskTimeTrackerSettings>
		)
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}

	getDailyLogStoreConfig(): DailyLogStoreConfig {
		const { dailyNotesFolder, dateFormat, wakeTimeProperty, bedTimeProperty } =
			this.settings
		return {
			dailyNotes: { folder: dailyNotesFolder, format: dateFormat },
			wakeTimeProperty,
			bedTimeProperty,
		}
	}

	/** Drop cached data and re-mount every open daily view. */
	async refreshViews() {
		this.dailyLogs.clear()
		const views = this.app.workspace
			.getLeavesOfType(DAILY_VIEW)
			.map((leaf) => leaf.view)
			.filter((view): view is DailyItemView => view instanceof DailyItemView)
		await Promise.all(views.map((view) => view.remount()))
	}

	async activateDailyView() {
		const { workspace } = this.app

		let leaf: WorkspaceLeaf | null = null
		const leaves = workspace.getLeavesOfType(DAILY_VIEW)

		if (leaves.length > 0) {
			leaf = leaves[0]!
		} else {
			leaf = workspace.getRightLeaf(false)
			await leaf?.setViewState({ type: DAILY_VIEW, active: true })
		}

		if (leaf) await workspace.revealLeaf(leaf)
	}
}
