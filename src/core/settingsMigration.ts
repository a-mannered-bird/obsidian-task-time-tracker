import type { GoalSuggestionDismissal } from './goalCards'
import { goalKeyId, type GoalKey } from './goalEdits'
import type { GoalBadge, MetricSetting, MetricSettings } from './goalStyle'
import { issueKeyNames } from './issues'
import type { TagMapping } from 'types/tags'

/**
 * The settings keyed by a goal's owner: a task name, or a tag for tag
 * goals (see tagGoalKey), plus the dismissed warnings naming one.
 */
type GoalKeyedSettings = {
	/** Dismissed warning keys (see issueKey); those naming a source are dropped. */
	dismissedIssues: string[]
	/** Goal suggestions dismissed for a day; they follow their task. */
	dismissedGoalSuggestions: GoalSuggestionDismissal[]
	/** Goals whose streak skips missing days; they follow their task. */
	streakSkipsMissingDays: GoalKey[]
	/** Goals whose tracker bar is hidden; they follow their task. */
	hiddenGoalBars: GoalKey[]
	/** Goals with a badge of their own; they follow their task. */
	goalBadges: GoalBadge[]
}

/** The settings keyed by task name. */
export type NameKeyedSettings = GoalKeyedSettings & {
	taskColors: Record<string, string>
	hiddenTasks: string[]
}

/** The settings keyed by tag. */
export type TagKeyedSettings = GoalKeyedSettings & {
	tagMappings: TagMapping[]
}

/**
 * Follow a rename or merge in the name-keyed settings, silently — these
 * migrations preserve intent (a color stays with its task after a rename).
 *
 * Colors: the target's own wins, else the first source with one transfers.
 * Hidden: the target's own flag when it already existed as a task, else
 * hidden only when every source was. Source entries are dropped. Goal
 * settings follow as moveGoalKeyed says.
 */
export function migrateTaskNames(
	settings: NameKeyedSettings,
	sourceNames: string[],
	targetName: string,
	targetExists: boolean
): NameKeyedSettings {
	const sources = sourceNames.filter((name) => name !== targetName)
	const isSource = (name: string) => sources.includes(name)

	const taskColors = Object.fromEntries(
		Object.entries(settings.taskColors).filter(([name]) => !isSource(name))
	)
	const color =
		settings.taskColors[targetName] ??
		sourceNames.map((name) => settings.taskColors[name]).find(Boolean)
	if (color !== undefined) taskColors[targetName] = color

	const hidden = new Set(settings.hiddenTasks)
	const targetHidden = targetExists
		? hidden.has(targetName)
		: sources.every((name) => hidden.has(name))
	const hiddenTasks = settings.hiddenTasks.filter(
		(name) => !isSource(name) && name !== targetName
	)
	if (targetHidden) hiddenTasks.push(targetName)

	return {
		taskColors,
		hiddenTasks,
		...moveGoalKeyed(settings, isSource, targetName),
	}
}

/**
 * Follow a tag rename or merge in the tag-keyed settings. The target's
 * mapping keeps its emoji and color and takes the first source's for those
 * it lacks; the tag goals' settings move as a task's do.
 */
export function migrateTags(
	settings: TagKeyedSettings,
	sourceTags: string[],
	targetTag: string
): TagKeyedSettings {
	const sources = sourceTags.filter((tag) => tag !== targetTag)
	const isSource = (tag: string) => sources.includes(tag)
	return {
		tagMappings: mergeTagMappings(settings.tagMappings, sources, targetTag),
		...moveGoalKeyed(settings, isSource, targetTag),
	}
}

function mergeTagMappings(
	mappings: TagMapping[],
	sources: string[],
	target: string
): TagMapping[] {
	const own = mappings.find((mapping) => mapping.tag === target)
	const absorbed = sources.flatMap((tag) =>
		mappings.filter((mapping) => mapping.tag === tag)
	)
	const emoji =
		own?.emoji || absorbed.map((mapping) => mapping.emoji).find(Boolean) || ''
	const color =
		own?.color ?? absorbed.map((mapping) => mapping.color).find(Boolean)
	const merged: TagMapping[] = emoji || color ? [{ tag: target, emoji }] : []
	if (merged[0] && color) merged[0].color = color
	const involved = (mapping: TagMapping) =>
		mapping.tag === target || sources.includes(mapping.tag)
	const at = mappings.findIndex(involved)
	return mappings.flatMap((mapping, index) => {
		if (index === at) return merged
		return involved(mapping) ? [] : [mapping]
	})
}

/** Drop the deleted tag's mapping and its tag goals' settings. */
export function forgetTag(
	settings: TagKeyedSettings,
	tag: string
): TagKeyedSettings {
	return {
		tagMappings: settings.tagMappings.filter((mapping) => mapping.tag !== tag),
		...forgetGoalKeyed(settings, tag),
	}
}

/**
 * Dismissed goal suggestions and per-goal streak, bar and badge settings
 * move to the target; for a goal both had, the target's own badge wins,
 * else the first source's.
 */
function moveGoalKeyed(
	settings: GoalKeyedSettings,
	isSource: (name: string) => boolean,
	targetName: string
): GoalKeyedSettings {
	return {
		// A warning about a name that no longer exists is moot; the
		// detectors will raise a fresh one if it still applies.
		dismissedIssues: settings.dismissedIssues.filter(
			(key) => !issueKeyNames(key).some(isSource)
		),
		...remapGoalKeys(settings, (key) =>
			isSource(key.taskName) ? { ...key, taskName: targetName } : key
		),
	}
}

function forgetGoalKeyed(
	settings: GoalKeyedSettings,
	name: string
): GoalKeyedSettings {
	return {
		dismissedIssues: settings.dismissedIssues.filter(
			(key) => !issueKeyNames(key).includes(name)
		),
		...remapGoalKeys(settings, (key) => (key.taskName === name ? null : key)),
	}
}

/** The settings keyed by a goal (task or tag, metric and unit). */
type GoalKeySettings = Omit<GoalKeyedSettings, 'dismissedIssues'>

/**
 * Each entry's key through `remap`: the same key keeps the entry, a new one
 * moves it, null drops it. An entry moved onto a key an untouched entry
 * holds gives way to it, and among moved ones the first wins, so a
 * target's own settings always survive a migration.
 */
function remapGoalKeys(
	settings: GoalKeySettings,
	remap: (key: GoalKey) => GoalKey | null
): GoalKeySettings {
	const byKey = <T extends GoalKey>(entry: T, key: GoalKey): T => ({
		...entry,
		...key,
	})
	return {
		dismissedGoalSuggestions: remapEntries(
			settings.dismissedGoalSuggestions,
			(entry) => entry,
			byKey,
			(entry) => `${entry.day}\n${goalKeyId(entry)}`,
			remap
		),
		streakSkipsMissingDays: remapEntries(
			settings.streakSkipsMissingDays,
			(key) => key,
			byKey,
			goalKeyId,
			remap
		),
		hiddenGoalBars: remapEntries(
			settings.hiddenGoalBars,
			(key) => key,
			byKey,
			goalKeyId,
			remap
		),
		goalBadges: remapEntries(
			settings.goalBadges,
			(entry) => entry.key,
			(entry, key) => ({ ...entry, key }),
			(entry) => goalKeyId(entry.key),
			remap
		),
	}
}

function remapEntries<T>(
	entries: T[],
	keyOf: (entry: T) => GoalKey,
	withKey: (entry: T, key: GoalKey) => T,
	idOf: (entry: T) => string,
	remap: (key: GoalKey) => GoalKey | null
): T[] {
	const remapped = entries.flatMap((entry) => {
		const key = keyOf(entry)
		const next = remap(key)
		if (next === null) return []
		const moved = goalKeyId(next) !== goalKeyId(key)
		return [{ entry: moved ? withKey(entry, next) : entry, moved }]
	})
	const held = new Set(
		remapped.filter(({ moved }) => !moved).map(({ entry }) => idOf(entry))
	)
	const placed = new Set<string>()
	return remapped.flatMap(({ entry, moved }) => {
		const id = idOf(entry)
		if (moved ? held.has(id) || placed.has(id) : placed.has(id)) return []
		placed.add(id)
		return [entry]
	})
}

/** The settings keyed by metric name. */
export type MetricKeyedSettings = GoalKeySettings & {
	metricSettings: MetricSettings
}

/**
 * Follow a metric rename or merge: the target's settings keep their fields
 * and fill their blanks from the sources' (the first source with one wins);
 * the goals' own settings move to the target metric, the target's winning.
 */
export function migrateMetrics(
	settings: MetricKeyedSettings,
	sourceMetrics: string[],
	targetMetric: string
): MetricKeyedSettings {
	const sources = sourceMetrics.filter((metric) => metric !== targetMetric)
	const metricSettings = { ...settings.metricSettings }
	const merged = [targetMetric, ...sources].reduce<MetricSetting>(
		(sum, metric) => ({ ...settings.metricSettings[metric], ...sum }),
		{}
	)
	for (const metric of sources) delete metricSettings[metric]
	if (Object.keys(merged).length) metricSettings[targetMetric] = merged
	return {
		metricSettings,
		...remapGoalKeys(settings, (key) =>
			key.metric !== null && sources.includes(key.metric)
				? { ...key, metric: targetMetric }
				: key
		),
	}
}

/** Drop the deleted metrics' settings and their goals' own settings. */
export function forgetMetrics(
	settings: MetricKeyedSettings,
	metrics: string[]
): MetricKeyedSettings {
	const metricSettings = { ...settings.metricSettings }
	for (const metric of metrics) delete metricSettings[metric]
	return {
		metricSettings,
		...remapGoalKeys(settings, (key) =>
			key.metric !== null && metrics.includes(key.metric) ? null : key
		),
	}
}

/** Follow a unit change: the goals' own settings move to the new unit. */
export function migrateMetricUnit(
	settings: MetricKeyedSettings,
	metric: string,
	fromUnits: string[],
	toUnit: string
): MetricKeyedSettings {
	return {
		metricSettings: settings.metricSettings,
		...remapGoalKeys(settings, (key) =>
			key.metric === metric && fromUnits.includes(key.unit)
				? { ...key, unit: toUnit }
				: key
		),
	}
}

/**
 * Drop the deleted task's own entries (color, hide flag, dismissed warnings
 * and goal suggestions, per-goal settings).
 */
export function forgetTaskName(
	settings: NameKeyedSettings,
	name: string
): NameKeyedSettings {
	const taskColors = { ...settings.taskColors }
	delete taskColors[name]
	return {
		taskColors,
		hiddenTasks: settings.hiddenTasks.filter((hidden) => hidden !== name),
		...forgetGoalKeyed(settings, name),
	}
}
