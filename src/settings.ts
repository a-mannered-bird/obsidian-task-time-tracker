import { App, Notice, PluginSettingTab, Setting } from 'obsidian'
import {
	emptyQuickAction,
	isQuickActionVerb,
	QUICK_ACTION_VERBS,
	type QuickAction,
} from './commands/quickActions'
import type TaskTimeTracker from './main'
import { openTaskManager } from './ui/TaskManagerModal'
import type { TagMapping } from './types/tags'

export interface TaskTimeTrackerSettings {
	unassignedTaskName: string
	/** Task pickers also offer the tasks of every daily note in the vault. */
	includeVaultTasks: boolean
	/**
	 * Custom chart color per task name, edited in the task management panel.
	 * A CSS color: a theme variable for the presets, or a hex string.
	 */
	taskColors: Record<string, string>
	/**
	 * Task names hidden from the pickers' vault suggestions, edited in the
	 * task management panel. Typing a hidden name resurfaces the task.
	 */
	hiddenTasks: string[]
	/** The explanation before joining overlapping clocks was dismissed for good. */
	skipOverlapJoinNotice: boolean
	tagMappings: TagMapping[]
	quickActions: QuickAction[]
	/** UI state, not shown in the settings tab. */
	lastDailyViewTab: DailyViewTab
}

export type DailyViewTab = 'tracker' | 'stats'

export const DEFAULT_SETTINGS: TaskTimeTrackerSettings = {
	unassignedTaskName: 'Unassigned',
	includeVaultTasks: true,
	taskColors: {},
	hiddenTasks: [],
	skipOverlapJoinNotice: false,
	lastDailyViewTab: 'tracker',
	quickActions: [],
	tagMappings: [
		{
			tag: '#project',
			emoji: '⭐️',
			bold: true,
			italic: false,
			underline: true,
		},
		{
			tag: '#tracker',
			emoji: '👣',
			bold: true,
			italic: false,
			underline: false,
		},
		{
			tag: '#routine',
			emoji: '🔂',
			bold: false,
			italic: true,
			underline: false,
		},
		{
			tag: '#chores',
			emoji: '🧼',
			bold: false,
			italic: true,
			underline: false,
		},
	],
}

/** Fields holding free text; union-typed fields like the tab are excluded. */
type StringSettingKey = {
	[K in keyof TaskTimeTrackerSettings]: string extends TaskTimeTrackerSettings[K]
		? K
		: never
}[keyof TaskTimeTrackerSettings]

function emptyMapping(): TagMapping {
	return { tag: '', emoji: '', bold: false, italic: false, underline: false }
}

export class TaskTimeTrackerSettingTab extends PluginSettingTab {
	plugin: TaskTimeTracker

	constructor(app: App, plugin: TaskTimeTracker) {
		super(app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this
		containerEl.empty()

		this.displayTrackingSection(containerEl)
		this.displayTaskManagementSection(containerEl)
		this.displayQuickActionsSection(containerEl)
		this.displayTagMappingsSection(containerEl)

		new Setting(containerEl)
			.setName('Apply changes')
			.setDesc('Reload the open daily views so they use the settings above.')
			.addButton((button) =>
				button
					.setButtonText('Apply')
					.setCta()
					.onClick(async () => {
						await this.plugin.refreshViews()
						new Notice('Task time tracker: views reloaded.')
					})
			)
	}

	/**
	 * Text setting bound to a string field. Empty input falls back to the
	 * default value, unless `allowEmpty` is set (e.g. folder = vault root).
	 */
	private addTextSetting(
		containerEl: HTMLElement,
		key: StringSettingKey,
		options: {
			name: string
			desc: string
			placeholder?: string
			allowEmpty?: boolean
		}
	) {
		new Setting(containerEl)
			.setName(options.name)
			.setDesc(options.desc)
			.addText((text) =>
				text
					.setPlaceholder(options.placeholder ?? DEFAULT_SETTINGS[key])
					.setValue(this.plugin.settings[key])
					.onChange(async (value) => {
						const trimmed = value.trim()
						this.plugin.settings[key] =
							trimmed || options.allowEmpty ? trimmed : DEFAULT_SETTINGS[key]
						await this.plugin.saveSettings()
					})
			)
	}

	private displayTrackingSection(containerEl: HTMLElement) {
		new Setting(containerEl).setName('Tracking').setHeading()

		this.addTextSetting(containerEl, 'unassignedTaskName', {
			name: 'Unassigned task name',
			desc: 'Task used by quick interruptions until the time gets assigned to a real task.',
		})
	}

	private displayTaskManagementSection(containerEl: HTMLElement) {
		new Setting(containerEl).setName('Task management').setHeading()

		new Setting(containerEl)
			.setName('Suggest tasks from all daily notes')
			.setDesc(
				'Task pickers list the tasks of every daily note below the ones of the current note; picking one adds it to the note.'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeVaultTasks)
					.onChange(async (value) => {
						this.plugin.settings.includeVaultTasks = value
						await this.plugin.saveSettings()
					})
			)

		new Setting(containerEl)
			.setName('Preview before joining overlapping clocks')
			.setDesc(
				'Show the task lines before and after the "overlapping clocks" fix before running it. Turned off by the "do not show this preview again" toggle of that preview.'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(!this.plugin.settings.skipOverlapJoinNotice)
					.onChange(async (value) => {
						this.plugin.settings.skipOverlapJoinNotice = !value
						await this.plugin.saveSettings()
					})
			)

		new Setting(containerEl)
			.setName('Manage tasks')
			.setDesc(
				'Browse every task of the daily notes; also available as a command and from the tracker tab.'
			)
			.addButton((button) =>
				button.setButtonText('Open').onClick(() => openTaskManager(this.plugin))
			)
	}

	private displayQuickActionsSection(containerEl: HTMLElement) {
		new Setting(containerEl)
			.setName('Quick actions')
			.setDesc(
				'One-click actions on a fixed task, shown in the tracker tab and registered as commands (restart the plugin to update the commands). The ensure verbs only act when the task is not already in that state.'
			)
			.setHeading()
			.addButton((button) =>
				button
					.setButtonText('Add action')
					.setCta()
					.onClick(async () => {
						this.plugin.settings.quickActions.push(emptyQuickAction())
						await this.plugin.saveSettings()
						this.display()
					})
			)

		this.plugin.settings.quickActions.forEach((action, index) => {
			const setting = new Setting(containerEl)
			setting.settingEl.addClass('task-time-tracker-tag-mapping')

			setting
				.addText((text) =>
					text
						.setPlaceholder('Action name')
						.setValue(action.name)
						.onChange(async (value) => {
							action.name = value.trim()
							await this.plugin.saveSettings()
						})
				)
				.addText((text) =>
					text
						.setPlaceholder('Task name')
						.setValue(action.taskName)
						.onChange(async (value) => {
							action.taskName = value.trim()
							await this.plugin.saveSettings()
						})
				)
				.addDropdown((dropdown) => {
					for (const verb of QUICK_ACTION_VERBS) dropdown.addOption(verb, verb)
					dropdown.setValue(action.verb).onChange(async (value) => {
						if (!isQuickActionVerb(value)) return
						action.verb = value
						await this.plugin.saveSettings()
					})
				})

			const toggles: {
				label: string
				tooltip: string
				key:
					| 'timeTravel'
					| 'showInTracker'
					| 'setWakeTime'
					| 'setBedTime'
					| 'completeJournal'
			}[] = [
				{
					label: 'custom time',
					tooltip: 'Ask at what time the action happened',
					key: 'timeTravel',
				},
				{
					label: 'tracker',
					tooltip: 'Show as a button in the tracker tab',
					key: 'showInTracker',
				},
				{
					label: 'wake',
					tooltip: 'Also set the wake time',
					key: 'setWakeTime',
				},
				{
					label: 'bed',
					tooltip: 'Also set the bed time',
					key: 'setBedTime',
				},
				{
					label: 'complete',
					tooltip: 'Then complete the journal entry',
					key: 'completeJournal',
				},
			]
			for (const { label, tooltip, key } of toggles) {
				setting.controlEl.createSpan({
					text: label,
					cls: 'task-time-tracker-style-label',
				})
				setting.addToggle((toggle) =>
					toggle
						.setTooltip(tooltip)
						.setValue(action[key])
						.onChange(async (value) => {
							action[key] = value
							await this.plugin.saveSettings()
						})
				)
			}

			setting.addExtraButton((button) =>
				button
					.setIcon('trash')
					.setTooltip('Remove')
					.onClick(async () => {
						this.plugin.settings.quickActions.splice(index, 1)
						await this.plugin.saveSettings()
						this.display()
					})
			)
		})
	}

	private displayTagMappingsSection(containerEl: HTMLElement) {
		new Setting(containerEl)
			.setName('Tag mappings')
			.setDesc(
				'For each tag: an emoji shown in task pickers and the text style used in statistics tables.'
			)
			.setHeading()
			.addButton((button) =>
				button
					.setButtonText('Add tag')
					.setCta()
					.onClick(async () => {
						this.plugin.settings.tagMappings.push(emptyMapping())
						await this.plugin.saveSettings()
						this.display()
					})
			)

		this.plugin.settings.tagMappings.forEach((mapping, index) => {
			const setting = new Setting(containerEl)
			setting.settingEl.addClass('task-time-tracker-tag-mapping')

			setting
				.addText((text) =>
					text
						.setPlaceholder('#tag')
						.setValue(mapping.tag)
						.onChange(async (value) => {
							mapping.tag = value.trim()
							await this.plugin.saveSettings()
						})
				)
				.addText((text) => {
					text.inputEl.addClass('task-time-tracker-emoji-input')
					text
						.setPlaceholder('Emoji')
						.setValue(mapping.emoji)
						.onChange(async (value) => {
							mapping.emoji = value.trim()
							await this.plugin.saveSettings()
						})
				})

			for (const style of ['bold', 'italic', 'underline'] as const) {
				setting.controlEl.createSpan({
					text: style,
					cls: `task-time-tracker-style-label task-time-tracker-${style}`,
				})
				setting.addToggle((toggle) =>
					toggle
						.setTooltip(style)
						.setValue(mapping[style])
						.onChange(async (value) => {
							mapping[style] = value
							await this.plugin.saveSettings()
						})
				)
			}

			setting.addExtraButton((button) =>
				button
					.setIcon('trash')
					.setTooltip('Remove')
					.onClick(async () => {
						this.plugin.settings.tagMappings.splice(index, 1)
						await this.plugin.saveSettings()
						this.display()
					})
			)
		})
	}
}
