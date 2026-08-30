import { Plugin, type WorkspaceLeaf } from 'obsidian'
import { registerCompleteJournalCommand } from './commands/completeJournal'
import { registerFrontmatterTimeCommands } from './commands/frontmatterTime'
import {
	normalizeQuickAction,
	registerQuickActionCommands,
} from './commands/quickActions'
import { registerTrackingCommands } from './commands/tracking'
import { getCoreDailyNotesConfig } from './core/coreDailyNotes'
import { DailyLogStore } from './core/dailyLogs'
import type { DailyNotesConfig } from './core/dailyNotes'
import {
	DEFAULT_SETTINGS,
	TaskTimeTrackerSettingTab,
	type TaskTimeTrackerSettings,
} from './settings'
import { DailyItemView, DAILY_VIEW } from './views/DailyItemView'
import { registerStatsCodeBlock } from './views/statsCodeBlock'

export default class TaskTimeTracker extends Plugin {
	settings: TaskTimeTrackerSettings = DEFAULT_SETTINGS
	dailyLogs: DailyLogStore = new DailyLogStore(this.app, () =>
		this.getDailyNotesConfig()
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
			icon: 'timer',
			callback: () => {
				void this.activateDailyView()
			},
		})

		registerTrackingCommands(this)
		registerFrontmatterTimeCommands(this)
		registerCompleteJournalCommand(this)
		registerQuickActionCommands(this)
		registerStatsCodeBlock(this)

		this.addSettingTab(new TaskTimeTrackerSettingTab(this.app, this))
	}

	async loadSettings() {
		const data = ((await this.loadData()) ?? {}) as Record<string, unknown>
		// Dropped settings, now inherited from the core Daily notes plugin.
		delete data.dailyNotesFolder
		delete data.dateFormat
		// Dropped setting; the tracking commands no longer ship default hotkeys.
		delete data.defaultToggleHotkey
		// Dropped settings; the wake/bed properties are fixed now.
		delete data.wakeTimeProperty
		delete data.bedTimeProperty
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			data as Partial<TaskTimeTrackerSettings>
		)
		this.settings.quickActions =
			this.settings.quickActions.map(normalizeQuickAction)
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}

	getDailyNotesConfig(): DailyNotesConfig {
		return getCoreDailyNotesConfig(this.app)
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
