import { App, Notice, PluginSettingTab, Setting } from 'obsidian'
import type TaskTimeTracker from './main'
import type { TagMapping } from './types/tags'

export interface TaskTimeTrackerSettings {
	dailyNotesFolder: string
	dateFormat: string
	wakeTimeProperty: string
	bedTimeProperty: string
	unassignedTaskName: string
	defaultToggleHotkey: string
	tagMappings: TagMapping[]
	/** UI state, not shown in the settings tab. */
	lastDailyViewTab: DailyViewTab
}

export type DailyViewTab = 'tracker' | 'stats'

export const DEFAULT_SETTINGS: TaskTimeTrackerSettings = {
	dailyNotesFolder: '',
	dateFormat: 'YYYY-MM-DD',
	wakeTimeProperty: 'wake_time',
	bedTimeProperty: 'bed_time',
	unassignedTaskName: 'Unassigned',
	defaultToggleHotkey: '@',
	lastDailyViewTab: 'tracker',
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

		this.displayDailyNotesSection(containerEl)
		this.displayTrackingSection(containerEl)
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

	private displayDailyNotesSection(containerEl: HTMLElement) {
		new Setting(containerEl).setName('Daily notes').setHeading()

		this.addTextSetting(containerEl, 'dailyNotesFolder', {
			name: 'Daily notes folder',
			desc: 'Folder containing your daily notes. Leave empty for the vault root.',
			placeholder: 'Journal',
			allowEmpty: true,
		})
		this.addTextSetting(containerEl, 'dateFormat', {
			name: 'Date format',
			desc: 'Moment.js format of your daily note file names.',
		})
		this.addTextSetting(containerEl, 'wakeTimeProperty', {
			name: 'Wake time property',
			desc: 'Frontmatter property holding the time you got up.',
		})
		this.addTextSetting(containerEl, 'bedTimeProperty', {
			name: 'Bed time property',
			desc: 'Frontmatter property holding the time you went to bed.',
		})
	}

	private displayTrackingSection(containerEl: HTMLElement) {
		new Setting(containerEl).setName('Tracking').setHeading()

		this.addTextSetting(containerEl, 'unassignedTaskName', {
			name: 'Unassigned task name',
			desc: 'Task used by quick interruptions until the time gets assigned to a real task.',
		})
		this.addTextSetting(containerEl, 'defaultToggleHotkey', {
			name: 'Tracking hotkey characters',
			desc: 'Characters combined with modifiers in the default hotkeys of the tracking commands; each character becomes an alternative hotkey. Useful when Alt or Shift changes the character your key produces: add each produced character (restart the plugin to apply). Individual hotkeys can still be changed in the Hotkeys settings.',
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
