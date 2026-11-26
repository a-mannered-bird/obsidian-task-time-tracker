import type { GoalSuggestionDismissal } from './goalCards'
import { goalKeyId, type GoalKey } from './goalEdits'
import type { GoalBadge } from './goalStyle'
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
		dismissedGoalSuggestions: settings.dismissedGoalSuggestions.map((entry) =>
			isSource(entry.taskName) ? { ...entry, taskName: targetName } : entry
		),
		streakSkipsMissingDays: moveKeys(
			settings.streakSkipsMissingDays,
			isSource,
			targetName
		),
		hiddenGoalBars: moveKeys(settings.hiddenGoalBars, isSource, targetName),
		goalBadges: migrateGoalBadges(settings.goalBadges, isSource, targetName),
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
		dismissedGoalSuggestions: settings.dismissedGoalSuggestions.filter(
			(entry) => entry.taskName !== name
		),
		streakSkipsMissingDays: settings.streakSkipsMissingDays.filter(
			(key) => key.taskName !== name
		),
		hiddenGoalBars: settings.hiddenGoalBars.filter(
			(key) => key.taskName !== name
		),
		goalBadges: settings.goalBadges.filter(
			(entry) => entry.key.taskName !== name
		),
	}
}

function migrateGoalBadges(
	goalBadges: GoalBadge[],
	isSource: (name: string) => boolean,
	targetName: string
): GoalBadge[] {
	const targets = new Set(
		goalBadges
			.filter((entry) => entry.key.taskName === targetName)
			.map((entry) => goalKeyId(entry.key))
	)
	const kept = new Map<string, GoalBadge>()
	for (const entry of goalBadges) {
		if (!isSource(entry.key.taskName)) {
			kept.set(goalKeyId(entry.key), entry)
			continue
		}
		const key = { ...entry.key, taskName: targetName }
		const id = goalKeyId(key)
		if (!targets.has(id) && !kept.has(id)) kept.set(id, { ...entry, key })
	}
	return [...kept.values()]
}

function moveKeys(
	keys: GoalKey[],
	isSource: (name: string) => boolean,
	targetName: string
): GoalKey[] {
	const moved = keys.map((key) =>
		isSource(key.taskName) ? { ...key, taskName: targetName } : key
	)
	return [...new Map(moved.map((key) => [goalKeyId(key), key])).values()]
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
