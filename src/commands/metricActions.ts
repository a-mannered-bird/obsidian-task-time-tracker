import {
	describeMetricConsolidation,
	describeMetricDeletion,
	describeUnitChange,
	IRREVERSIBLE_NOTE,
	plural,
} from 'core/confirmations'
import {
	TIME_GOAL_EMOJI,
	TIME_GOAL_LABEL,
	METRIC_GOAL_EMOJI,
} from 'core/goalCards'
import {
	metricRuleOf,
	withMetricSetting,
	type MetricSetting,
} from 'core/goalStyle'
import { metricInfos, type NamedMetricInfo } from 'core/metricManager'
import {
	editMetricsInVault,
	metricNameProblem,
	previewMetricEdit,
	unitProblem,
	type MetricOperation,
} from 'core/metricOperations'
import {
	forgetMetrics,
	migrateMetrics,
	migrateMetricUnit,
	type MetricKeyedSettings,
} from 'core/settingsMigration'
import { confirmAction } from 'ui/ConfirmActionModal'
import { pickOption } from 'ui/OptionSuggestModal'
import { withProgressNotice } from 'ui/progressNotice'
import { promptText } from 'ui/TextPromptModal'
import type TaskTimeTracker from '../main'
import { reportOutcome } from './taskActions'

/** Every metric the Metrics tab lists but the time goals, most used first. */
function namedMetrics(plugin: TaskTimeTracker): NamedMetricInfo[] {
	const { metricSettings } = plugin.settings
	return metricInfos(
		plugin.vaultTasks.notes(),
		Object.keys(metricSettings).filter((name) => name !== TIME_GOAL_LABEL),
		metricRuleOf(metricSettings),
		new Date()
	).filter((info): info is NamedMetricInfo => info.kind === 'metric')
}

/**
 * Rename a metric across every daily note: ask for the new name, show what
 * the rename does (onto an existing metric it is a merge, with the merge's
 * ritual), run it. Resolves true when it ran.
 */
export async function renameMetric(
	plugin: TaskTimeTracker,
	metric: string
): Promise<boolean> {
	const typed = await promptText(plugin.app, {
		title: `Rename ${metric}`,
		description:
			'Every line of it is updated, in every daily note. Renaming to another goal merges the two.',
		label: 'New name',
		initialValue: metric,
		confirmText: 'Rename',
		validate: (value) =>
			value.trim() === metric
				? 'That is the current name.'
				: metricNameProblem(value),
	})
	if (typed === null) return false
	const target = typed.trim()

	const merging = namedMetrics(plugin).some((info) => info.metric === target)
	const operation = consolidation(plugin, [metric], target)
	const confirmed = await confirmAction(plugin.app, {
		title: `Rename ${metric}`,
		message: [
			...describeMetricConsolidation(
				[metric],
				target,
				previewMetricEdit(plugin.vaultTasks, operation),
				merging
			),
			...(merging ? [IRREVERSIBLE_NOTE] : []),
		],
		typeToConfirm: merging ? target : undefined,
		confirmText: merging ? 'Merge' : 'Rename',
	})
	if (!confirmed) return false

	await run(plugin, operation, target, (settings) =>
		migrateMetrics(settings, [metric], target)
	)
	return true
}

/**
 * Merge several metrics into one across every daily note. The surviving
 * metric is chosen in the confirmation (default: the most used) and typed
 * to confirm. Resolves true when it ran.
 */
export async function mergeMetrics(
	plugin: TaskTimeTracker,
	metrics: string[]
): Promise<boolean> {
	if (metrics.length < 2) return false
	const survivorDefault =
		namedMetrics(plugin).find((info) => metrics.includes(info.metric))
			?.metric ?? metrics[0]!
	const confirmed = await confirmAction(plugin.app, {
		title: `Merge ${plural(metrics.length, 'goal')}`,
		message: [
			// The counts do not depend on which metric survives.
			...describeMetricConsolidation(
				metrics,
				null,
				previewMetricEdit(
					plugin.vaultTasks,
					consolidation(plugin, metrics, survivorDefault)
				),
				true
			),
			IRREVERSIBLE_NOTE,
		],
		choice: {
			label: 'Surviving goal',
			options: metrics,
			initial: survivorDefault,
		},
		typeToConfirm: (choice) => choice,
		confirmText: 'Merge',
	})
	if (!confirmed) return false

	const target = confirmed.choice
	await run(
		plugin,
		consolidation(plugin, metrics, target),
		target,
		(settings) => migrateMetrics(settings, metrics, target)
	)
	return true
}

/**
 * The merge of `sources` into `target`, combining with the rule the target
 * will have once its settings took in the sources' (see migrateMetrics).
 */
function consolidation(
	plugin: TaskTimeTracker,
	sources: string[],
	target: string
): MetricOperation {
	const migrated = migrateMetrics(plugin.settings, sources, target)
	return {
		kind: 'consolidate',
		sources: sources.filter((metric) => metric !== target),
		target,
		ruleOf: metricRuleOf(migrated.metricSettings),
	}
}

/**
 * Delete every goal line of the metrics, after the ritual (type the metric
 * for one, the count for several), with their settings. Metrics no goal
 * line uses only lose their settings, behind a light confirmation.
 */
export async function deleteMetrics(
	plugin: TaskTimeTracker,
	metrics: string[]
): Promise<boolean> {
	if (metrics.length === 0) return false
	const operation: MetricOperation = { kind: 'delete', metrics }
	const preview = previewMetricEdit(plugin.vaultTasks, operation)
	const destructive = preview.goalLines > 0
	const confirmed = await confirmAction(plugin.app, {
		title:
			metrics.length === 1
				? `Delete ${metrics[0]}`
				: `Delete ${plural(metrics.length, 'goal')}`,
		message: [
			describeMetricDeletion(metrics, preview),
			...(destructive ? [IRREVERSIBLE_NOTE] : []),
		],
		typeToConfirm: destructive
			? metrics.length === 1
				? metrics[0]
				: String(metrics.length)
			: undefined,
		confirmText: 'Delete',
	})
	if (!confirmed) return false

	await run(
		plugin,
		operation,
		metrics.length === 1 ? metrics[0]! : 'Deletion',
		(settings) => forgetMetrics(settings, metrics)
	)
	return true
}

/**
 * Change the unit text of a metric's goal lines: ask for the new unit, and,
 * when the metric has several others, which of them to replace; values are
 * never converted. Light confirmation. Resolves true when it ran.
 */
export async function changeMetricUnit(
	plugin: TaskTimeTracker,
	metric: string
): Promise<boolean> {
	const info = namedMetrics(plugin).find((entry) => entry.metric === metric)
	if (!info) return false
	const typed = await promptText(plugin.app, {
		title: `Change unit of ${metric}`,
		description: `Written now: ${info.units.map(({ unit, count }) => `${unit || 'no unit'} (${count})`).join(', ')}. The values stay as written: nothing is converted.`,
		label: 'New unit',
		initialValue: info.unit,
		confirmText: 'Next',
		validate: (value) =>
			info.units.every(({ unit }) => unit === value.trim())
				? 'That is the current unit.'
				: unitProblem(value),
	})
	if (typed === null) return false
	const toUnit = typed.trim()

	const others = info.units
		.map(({ unit }) => unit)
		.filter((unit) => unit !== toUnit)
	if (others.length === 0) return false
	const fromUnits =
		others.length === 1
			? others
			: await pickOption(plugin.app, {
					placeholder: `Replace which unit with ${toUnit || 'no unit'}?`,
					options: [
						{ label: 'All of them', note: others.join(', '), value: others },
						...others.map((unit) => ({
							label: unit || 'No unit',
							value: [unit],
						})),
					],
				})
	if (fromUnits === null) return false

	const operation: MetricOperation = {
		kind: 'changeUnit',
		metric,
		fromUnits,
		toUnit,
		ruleOf: metricRuleOf(plugin.settings.metricSettings),
	}
	const confirmed = await confirmAction(plugin.app, {
		title: `Change unit of ${metric}`,
		message: describeUnitChange(
			metric,
			fromUnits,
			toUnit,
			previewMetricEdit(plugin.vaultTasks, operation)
		),
		confirmText: 'Change unit',
	})
	if (!confirmed) return false

	await run(plugin, operation, metric, (settings) =>
		migrateMetricUnit(settings, metric, fromUnits, toUnit)
	)
	return true
}

async function run(
	plugin: TaskTimeTracker,
	operation: MetricOperation,
	subject: string,
	migrate: (settings: MetricKeyedSettings) => MetricKeyedSettings
): Promise<void> {
	const report = await withProgressNotice(
		operation.kind === 'delete' ? 'Deleting' : 'Updating notes',
		(onProgress) =>
			editMetricsInVault(
				plugin.app.vault,
				plugin.vaultTasks,
				operation,
				onProgress
			)
	)
	Object.assign(plugin.settings, migrate(plugin.settings))
	await plugin.saveSettings()
	reportOutcome(report, subject)
}

/**
 * Ask for the emoji of every goal of the metric (`time` for time goals) on
 * the goal cards and tracker bars; empty goes back to the default.
 * Resolves true when it changed.
 */
export async function chooseMetricEmoji(
	plugin: TaskTimeTracker,
	metric: string
): Promise<boolean> {
	const isTime = metric === TIME_GOAL_LABEL
	const typed = await promptText(plugin.app, {
		title: `Emoji of ${metric}`,
		description: isTime
			? 'Shown on every time goal. Empty for the default.'
			: `Shown on every ${metric} goal and its tracker bars. Empty for the default.`,
		label: 'Emoji',
		initialValue: plugin.settings.metricSettings[metric]?.emoji ?? '',
		placeholder: isTime ? TIME_GOAL_EMOJI : METRIC_GOAL_EMOJI,
	})
	if (typed === null) return false
	await updateMetricSettings(plugin, [metric], {
		emoji: typed.trim() || undefined,
	})
	return true
}

/** Change the metrics' settings (color, emoji, rule); undefined clears a field. */
export async function updateMetricSettings(
	plugin: TaskTimeTracker,
	metrics: string[],
	change: MetricSetting
): Promise<void> {
	const { settings } = plugin
	for (const metric of metrics) {
		settings.metricSettings = withMetricSetting(
			settings.metricSettings,
			metric,
			change
		)
	}
	await plugin.saveSettings()
}
