import { App, PluginSettingTab, Setting } from 'obsidian'
import { ZOOM_DEFAULT } from './core/timeline'
import { ISSUE_KINDS, ISSUE_TITLES, type IssueKind } from './core/issues'
import type TaskTimeTracker from './main'
import { openTagManager, openTaskManager } from './ui/TaskManagerModal'
import type { TagMapping } from './types/tags'
import {
	AGGREGATION_RULE_NAMES,
	AGGREGATION_RULES,
	DEFAULT_STAMP_TEXTS,
	DONE_BADGE_CHOICE_NAMES,
	DONE_BADGE_CHOICES,
	isAggregationRule,
	isDoneBadgeChoice,
	parseStampTexts,
	usesStamps,
	withMetricSetting,
	type DoneBadgeChoice,
	type GoalBadge,
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
import { DEFAULT_GOAL_GROUPINGS, type GoalGroupings } from './core/goalCards'
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
	/** The badge a goal card gets once done, unless it has its own. */
	doneBadge: DoneBadgeChoice
	/** Goals with a badge of their own, set from their card's menu. */
	goalBadges: GoalBadge[]
	/** The rubber stamp badge's texts, one picked per card and day. */
	stampTexts: string[]
	/** Goals whose streak skips the days without them (see goalStreak). */
	streakSkipsMissingDays: GoalKey[]
	/** Goals whose bar is hidden under their tracker row. */
	hiddenGoalBars: GoalKey[]
	/** Goal suggestions dismissed for a day (see pruneDismissals). */
	dismissedGoalSuggestions: GoalSuggestionDismissal[]
	/** A sound when a goal is reached, another when an "at most" one goes over. */
	playSounds: boolean
	/** End day asks for the goals its ticked tasks have not reached. */
	askGoalResultsOnEndDay: boolean
	/** End day's "Has goals" boxes start ticked, deleting those tasks. */
	deleteGoalTasksOnEndDay: boolean
	/** How the Goals tab groups the tasks' goals, chosen in the tab per device. */
	goalGrouping: GoalGroupings
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
	hiddenGoalBars: [],
	doneBadge: 'tick',
	goalBadges: [],
	goalGrouping: DEFAULT_GOAL_GROUPINGS,
	askGoalResultsOnEndDay: true,
	playSounds: true,
	deleteGoalTasksOnEndDay: false,
	stampTexts: DEFAULT_STAMP_TEXTS,
	timelineFitOnOpen: true,
	lastDailyViewTab: 'tracker',
	timelineZoom: ZOOM_DEFAULT,
	tagMappings: [],
}

export const UNUSED_METRIC_WARNING =
	'No goal line uses this metric any more. Its settings stay until you delete them.'

/**
 * A round color swatch at the end of the setting's controls, opening the
 * color menu. Not a <button>: Obsidian's mobile styles stretch those full
 * width. Dashed while no color is set.
 */
function addColorSwatch(
	setting: Setting,
	label: string,
	color: {
		get: () => string | undefined
		set: (color: string | undefined) => Promise<void>
	}
) {
	const swatch = setting.controlEl.createSpan({
		cls: 'task-time-tracker-swatch-button',
		attr: { role: 'button', tabindex: '0', 'aria-label': label },
	})
	const paint = () => {
		swatch.style.setProperty('--swatch-color', color.get() ?? 'transparent')
		swatch.toggleClass('has-color', Boolean(color.get()))
	}
	const pick = (event: MouseEvent) =>
		openColorMenu(event, color.get(), (picked) => {
			void color.set(picked ?? undefined).then(paint)
		})
	swatch.addEventListener('click', pick)
	swatch.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter' && event.key !== ' ') return
		event.preventDefault()
		const rect = swatch.getBoundingClientRect()
		pick(new MouseEvent('click', { clientX: rect.left, clientY: rect.bottom }))
	})
	paint()
}

export class TaskTimeTrackerSettingTab extends PluginSettingTab {
	plugin: TaskTimeTracker

	constructor(app: App, plugin: TaskTimeTracker) {
		super(app, plugin)
		this.plugin = plugin
	}

	/*
	 * The views read the settings when they mount, so they pick up the changes
	 * once the tab closes: remounting on every change would make them flicker
	 * and show half-typed values. display() also runs on each re-render of
	 * the open tab, hence the snapshot is only taken when none is held.
	 */
	private settingsOnOpen: string | null = null

	override display(): void {
		this.settingsOnOpen ??= JSON.stringify(this.plugin.settings)
		const { containerEl } = this
		containerEl.empty()

		this.displayTimelineSection(containerEl)
		this.displayGoalsSection(containerEl)
		this.displayTaskManagementSection(containerEl)
		this.displayWarningsSection(containerEl)
	}

	override hide(): void {
		super.hide()
		const changed = this.settingsOnOpen !== JSON.stringify(this.plugin.settings)
		this.settingsOnOpen = null
		if (changed) void this.plugin.refreshViews()
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
				"What a goal card shows on its corner once the goal is reached. The streak flame counts the days in a row it was, a random badge changes per goal and day. A goal can have its own in its card's menu."
			)
			.addDropdown((dropdown) => {
				for (const badge of DONE_BADGE_CHOICES) {
					dropdown.addOption(badge, DONE_BADGE_CHOICE_NAMES[badge])
				}
				dropdown.setValue(settings.doneBadge).onChange(async (value) => {
					if (!isDoneBadgeChoice(value)) return
					settings.doneBadge = value
					await this.plugin.saveSettings()
					this.display()
				})
			})

		new Setting(containerEl)
			.setName('Play sounds')
			.setDesc(
				'A chime when a goal is reached, a warning when an "at most" goal goes over its limit, while the daily view is open.'
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.playSounds).onChange(async (value) => {
					settings.playSounds = value
					await this.plugin.saveSettings()
				})
			)

		new Setting(containerEl)
			.setName('Ask for goal results when ending a day')
			.setDesc(
				'End day asks for the result of each goal its ticked tasks have not reached. Time goals are never asked: their result comes from the clocks.'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(settings.askGoalResultsOnEndDay)
					.onChange(async (value) => {
						settings.askGoalResultsOnEndDay = value
						await this.plugin.saveSettings()
					})
			)

		new Setting(containerEl)
			.setName('Always delete unclocked tasks with goals')
			.setDesc(
				"End day's confirmation ticks them for deletion; untick one to keep it."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(settings.deleteGoalTasksOnEndDay)
					.onChange(async (value) => {
						settings.deleteGoalTasksOnEndDay = value
						await this.plugin.saveSettings()
					})
			)

		if (
			usesStamps([
				settings.doneBadge,
				...settings.goalBadges.map((entry) => entry.badge),
			])
		) {
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
			settings.metricSettings = withMetricSetting(
				settings.metricSettings,
				metric,
				change
			)
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

		addColorSwatch(setting, `Color of ${metric}`, {
			get: () => current().color,
			set: (color) => update({ color }),
		})
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
					.setTooltip(`Delete the settings of ${metric}`)
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

		new Setting(containerEl)
			.setName('Manage tags')
			.setDesc(
				'Each tag can have an emoji, shown in the task pickers, on the tracker and on its tag goals, and a color for its tag goals; a task without a color of its own takes the color of its first tag that has one. Rename, merge and delete tags there too; also available as a command.'
			)
			.addButton((button) =>
				button.setButtonText('Open').onClick(() => openTagManager(this.plugin))
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
}
