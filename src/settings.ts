import { App, PluginSettingTab, Setting } from 'obsidian'
import { NOTICE_ICON } from './core/noticeText'
import { ZOOM_DEFAULT } from './core/timeline'
import { ISSUE_KINDS, ISSUE_TITLES, type IssueKind } from './core/issues'
import type TaskTimeTracker from './main'
import { showNotice } from './ui/notice'
import { openTaskManager } from './ui/TaskManagerModal'
import type { TagMapping } from './types/tags'
import {
	AGGREGATION_RULE_NAMES,
	AGGREGATION_RULES,
	DEFAULT_STAMP_TEXTS,
	DONE_BADGE_NAMES,
	DONE_BADGES,
	isAggregationRule,
	isDoneBadge,
	parseStampTexts,
	type DoneBadge,
	type MetricSetting,
	type MetricSettings,
} from './core/goalStyle'
import {
	METRIC_GOAL_EMOJI,
	TIME_GOAL_EMOJI,
	TIME_GOAL_LABEL,
	type GoalSuggestionDismissal,
} from './core/goalCards'
import type { GoalKey } from './core/goalEdits'
import type { GoalGrouping } from './core/goalCards'
import { openColorMenu } from './ui/colorMenu'

export interface TaskTimeTrackerSettings {
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
	/** Warning kinds switched off entirely. */
	ignoredIssueKinds: IssueKind[]
	/** Individual warnings dismissed (keys from issueKey). */
	dismissedIssues: string[]
	tagMappings: TagMapping[]
	/**
	 * The timeline opens each note zoomed to its day, as the Fit button does;
	 * off, it opens at `timelineZoom`.
	 */
	timelineFitOnOpen: boolean
	/** Color, emoji and aggregation rule per metric name (see goalStyle). */
	metricSettings: MetricSettings
	/** The badge a goal card gets once done. */
	doneBadge: DoneBadge
	/** The rubber stamp badge's texts, one picked per card and day. */
	stampTexts: string[]
	/** Goals whose streak skips the days without them (see goalStreak). */
	streakSkipsMissingDays: GoalKey[]
	/** Goal suggestions dismissed for a day (see pruneDismissals). */
	dismissedGoalSuggestions: GoalSuggestionDismissal[]
	/** How the Goals tab groups the tasks' goals, chosen in the tab. */
	goalGrouping: GoalGrouping
	/** UI state, not shown in the settings tab. */
	lastDailyViewTab: DailyViewTab
	/** Timeline tab zoom in pixels per hour (UI state). */
	timelineZoom: number
}

const DAILY_VIEW_TABS = ['tracker', 'goals', 'timeline'] as const
export type DailyViewTab = (typeof DAILY_VIEW_TABS)[number]

export function isDailyViewTab(value: unknown): value is DailyViewTab {
	return DAILY_VIEW_TABS.some((tab) => tab === value)
}

export const DEFAULT_SETTINGS: TaskTimeTrackerSettings = {
	taskColors: {},
	hiddenTasks: [],
	skipOverlapJoinNotice: false,
	ignoredIssueKinds: [],
	dismissedIssues: [],
	dismissedGoalSuggestions: [],
	metricSettings: {},
	streakSkipsMissingDays: [],
	doneBadge: 'tick',
	goalGrouping: 'task',
	stampTexts: DEFAULT_STAMP_TEXTS,
	timelineFitOnOpen: true,
	lastDailyViewTab: 'tracker',
	timelineZoom: ZOOM_DEFAULT,
	tagMappings: [
		{
			tag: '#project',
			emoji: '⭐️',
		},
		{
			tag: '#tracker',
			emoji: '👣',
		},
		{
			tag: '#routine',
			emoji: '🔂',
		},
		{
			tag: '#chores',
			emoji: '🧼',
		},
	],
}

export const UNUSED_METRIC_WARNING =
	'No goal line uses this metric any more. Its settings stay until you forget them.'

function emptyMapping(): TagMapping {
	return { tag: '', emoji: '' }
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

		this.displayTimelineSection(containerEl)
		this.displayGoalsSection(containerEl)
		this.displayTaskManagementSection(containerEl)
		this.displayWarningsSection(containerEl)
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
						showNotice(
							`${NOTICE_ICON.reload} Task time tracker: views reloaded.`
						)
					})
			)
	}

	private displayTimelineSection(containerEl: HTMLElement) {
		new Setting(containerEl).setName('Timeline').setHeading()

		new Setting(containerEl)
			.setName('Open fitted to the day')
			.setDesc(
				"Each note opens zoomed to show its day, as the fit button does. Turned off, it opens at the last zoom used, scrolled to now on today's note."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.timelineFitOnOpen)
					.onChange(async (value) => {
						this.plugin.settings.timelineFitOnOpen = value
						await this.plugin.saveSettings()
					})
			)
	}

	private displayGoalsSection(containerEl: HTMLElement) {
		const { settings } = this.plugin
		new Setting(containerEl).setName('Goals').setHeading()

		new Setting(containerEl)
			.setName('Done badge')
			.setDesc(
				'What a goal card shows on its corner once the goal is reached. Streak flame counts the days in a row it was.'
			)
			.addDropdown((dropdown) => {
				for (const badge of DONE_BADGES) {
					dropdown.addOption(badge, DONE_BADGE_NAMES[badge])
				}
				dropdown.setValue(settings.doneBadge).onChange(async (value) => {
					if (!isDoneBadge(value)) return
					settings.doneBadge = value
					await this.plugin.saveSettings()
					this.display()
				})
			})

		if (settings.doneBadge === 'stamp') {
			new Setting(containerEl)
				.setName('Stamp texts')
				.setDesc('One per line; each card gets one of them for the day.')
				.addTextArea((text) =>
					text
						.setValue(settings.stampTexts.join('\n'))
						.onChange(async (value) => {
							settings.stampTexts = parseStampTexts(value)
							await this.plugin.saveSettings()
						})
				)
		}

		const index = this.plugin.vaultTasks
		if (!index.isReady) {
			void index.ensureBuilt().then(() => this.display())
		}
		const used = new Set(index.metrics().map(({ metric }) => metric))
		const metrics = [
			TIME_GOAL_LABEL,
			...new Set([
				...used,
				...Object.keys(settings.metricSettings).filter(
					(name) => name !== TIME_GOAL_LABEL
				),
			]),
		]
		new Setting(containerEl)
			.setName('Metrics')
			.setDesc(
				'Color and emoji of each metric in the goal cards and the tracker bars, and how its values add up when tasks merge or a range is summed. Rates (a unit with /) average by default, the others add up.'
			)
		for (const metric of metrics) {
			const unused =
				index.isReady && metric !== TIME_GOAL_LABEL && !used.has(metric)
			this.displayMetricSetting(containerEl, metric, unused)
		}
	}

	/** `unused`: set here, but in no goal line of any note any more. */
	private displayMetricSetting(
		containerEl: HTMLElement,
		metric: string,
		unused: boolean
	) {
		const { settings } = this.plugin
		const current = (): MetricSetting => settings.metricSettings[metric] ?? {}
		const update = async (change: MetricSetting) => {
			const next = Object.fromEntries(
				Object.entries({ ...current(), ...change }).filter(
					([, value]) => value !== undefined && value !== ''
				)
			)
			const all = { ...settings.metricSettings }
			if (Object.keys(next).length) all[metric] = next
			else delete all[metric]
			settings.metricSettings = all
			await this.plugin.saveSettings()
		}
		const isTime = metric === TIME_GOAL_LABEL
		const setting = new Setting(containerEl)
			.setName(isTime ? 'Time goals' : metric)
			.setClass('task-time-tracker-metric-setting')
		if (unused) {
			setting.setDesc(UNUSED_METRIC_WARNING)
			setting.descEl.addClass('mod-warning')
		}

		// Not a <button>: Obsidian's mobile styles stretch those full width.
		const swatch = setting.controlEl.createSpan({
			cls: 'task-time-tracker-swatch-button',
			attr: {
				role: 'button',
				tabindex: '0',
				'aria-label': `Color of ${metric}`,
			},
		})
		const paint = () => {
			swatch.style.setProperty(
				'--swatch-color',
				current().color ?? 'transparent'
			)
			swatch.toggleClass('has-color', Boolean(current().color))
		}
		const pick = (event: MouseEvent) =>
			openColorMenu(event, current().color, (color) => {
				void update({ color: color ?? undefined }).then(paint)
			})
		swatch.addEventListener('click', pick)
		swatch.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter' && event.key !== ' ') return
			event.preventDefault()
			const rect = swatch.getBoundingClientRect()
			pick(
				new MouseEvent('click', { clientX: rect.left, clientY: rect.bottom })
			)
		})
		paint()
		setting.addText((text) => {
			text.inputEl.addClass('task-time-tracker-emoji-input')
			text.inputEl.setAttribute('aria-label', `Emoji of ${metric}`)
			text
				.setPlaceholder(isTime ? TIME_GOAL_EMOJI : METRIC_GOAL_EMOJI)
				.setValue(current().emoji ?? '')
				.onChange((value) => void update({ emoji: value.trim() || undefined }))
		})
		if (!isTime) {
			setting.addDropdown((dropdown) => {
				dropdown.selectEl.setAttribute('aria-label', `How ${metric} adds up`)
				dropdown.addOption('', 'Default')
				for (const rule of AGGREGATION_RULES) {
					dropdown.addOption(rule, AGGREGATION_RULE_NAMES[rule])
				}
				dropdown.setValue(current().rule ?? '').onChange((value) => {
					void update({ rule: isAggregationRule(value) ? value : undefined })
				})
			})
		}
		if (unused) {
			setting.addExtraButton((button) =>
				button
					.setIcon('trash')
					.setTooltip(`Forget the settings of ${metric}`)
					.onClick(async () => {
						const all = { ...settings.metricSettings }
						delete all[metric]
						settings.metricSettings = all
						await this.plugin.saveSettings()
						this.display()
					})
			)
		}
	}

	private displayTaskManagementSection(containerEl: HTMLElement) {
		new Setting(containerEl).setName('Task management').setHeading()

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

	private displayWarningsSection(containerEl: HTMLElement) {
		const { settings } = this.plugin
		new Setting(containerEl)
			.setName('Warnings')
			.setDesc(
				'Which problems the task manager flags. Individual warnings can be dismissed from their menu; forget them here to see them again.'
			)
			.setHeading()

		for (const kind of ISSUE_KINDS) {
			new Setting(containerEl).setName(ISSUE_TITLES[kind]).addToggle((toggle) =>
				toggle
					.setValue(!settings.ignoredIssueKinds.includes(kind))
					.onChange(async (shown) => {
						settings.ignoredIssueKinds = shown
							? settings.ignoredIssueKinds.filter((k) => k !== kind)
							: [...settings.ignoredIssueKinds, kind]
						await this.plugin.saveSettings()
					})
			)
		}

		new Setting(containerEl)
			.setName('Dismissed warnings')
			.setDesc(`${settings.dismissedIssues.length} dismissed so far.`)
			.addButton((button) =>
				button
					.setButtonText('Forget them')
					.setDisabled(settings.dismissedIssues.length === 0)
					.onClick(async () => {
						settings.dismissedIssues = []
						await this.plugin.saveSettings()
						this.display()
					})
			)
	}

	private displayTagMappingsSection(containerEl: HTMLElement) {
		new Setting(containerEl)
			.setName('Tag mappings')
			.setDesc('For each tag: an emoji shown in task pickers.')
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
