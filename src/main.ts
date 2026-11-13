import { Plugin, type WorkspaceLeaf } from 'obsidian'
import './styles.css'
import { registerCompleteJournalCommand } from './commands/completeJournal'
import { registerFrontmatterTimeCommands } from './commands/frontmatterTime'
import { registerLostClockWatch } from './commands/lostClocks'
import {
	normalizeQuickAction,
	registerQuickActionCommands,
} from './commands/quickActions'
import { registerTrackingCommands } from './commands/tracking'
import { registerUserEditLog, type UserEdit } from './commands/userEdits'
import { getCoreDailyNotesConfig } from './core/coreDailyNotes'
import { DailyLogStore } from './core/dailyLogs'
import { isDailyNote, type DailyNotesConfig } from './core/dailyNotes'
import { LostClockTracker } from './core/lostClocks'
import { VaultTaskIndex } from './core/vaultTaskIndex'
import {
	DEFAULT_SETTINGS,
	TaskTimeTrackerSettingTab,
	type TaskTimeTrackerSettings,
} from './settings'
import { openTaskManager } from './ui/TaskManagerModal'
import { DailyItemView, DAILY_VIEW } from './views/DailyItemView'
import { registerStatsCodeBlock } from './views/statsCodeBlock'

export default class TaskTimeTracker extends Plugin {
	settings: TaskTimeTrackerSettings = DEFAULT_SETTINGS
	dailyLogs: DailyLogStore = new DailyLogStore(this.app, () =>
		this.getDailyNotesConfig()
	)
	// Field order matters: the index subscribes to dailyLogs on construction.
	vaultTasks: VaultTaskIndex = new VaultTaskIndex({
		listFiles: () =>
			this.app.vault
				.getMarkdownFiles()
				.filter((file) => isDailyNote(this.getDailyNotesConfig(), file)),
		loadFile: (file) => this.dailyLogs.loadFile(file),
		onChange: (listener) => this.dailyLogs.onChange(listener),
	})

	lostClocks = new LostClockTracker()
	/** The user's last change of each note in an editor, by path. */
	userEdits = new Map<string, UserEdit>()

	async onload() {
		await this.loadSettings()
		this.dailyLogs.register(this)
		registerUserEditLog(this)
		registerLostClockWatch(this)

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

		this.addCommand({
			id: 'manage-tasks',
			name: 'Manage tasks',
			icon: 'list-todo',
			callback: () => openTaskManager(this),
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
		// Dropped setting; the pickers always offer every daily note's tasks.
		delete data.includeVaultTasks
		// Dropped setting; interruptions always record into "Interruption".
		delete data.unassignedTaskName
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			data as Partial<TaskTimeTrackerSettings>
		)
		this.settings.quickActions =
			this.settings.quickActions.map(normalizeQuickAction)
		// Drops the bold / italic / underline flags of older mappings.
		this.settings.tagMappings = this.settings.tagMappings.map(
			({ tag, emoji }) => ({ tag, emoji })
		)
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
