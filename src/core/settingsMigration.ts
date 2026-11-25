import type { GoalSuggestionDismissal } from './goalCards'
import { goalKeyId, type GoalKey } from './goalEdits'
import type { GoalBadge } from './goalStyle'
import { issueKeyNames } from './issues'

/** The settings keyed by task name. */
export type NameKeyedSettings = {
	taskColors: Record<string, string>
	hiddenTasks: string[]
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

/**
 * Follow a rename or merge in the name-keyed settings, silently — these
 * migrations preserve intent (a color stays with its task after a rename).
 *
 * Colors: the target's own wins, else the first source with one transfers.
 * Hidden: the target's own flag when it already existed as a task, else
 * hidden only when every source was. Source entries are dropped.
 * Dismissed goal suggestions and per-goal streak, bar and badge settings move to
 * the target; for a goal both had, the target's own badge wins, else the
 * first source's.
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
		// A warning about a task that no longer exists under that name is
		// moot; the detectors will raise a fresh one if it still applies.
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
		...settings,
		taskColors,
		hiddenTasks: settings.hiddenTasks.filter((hidden) => hidden !== name),
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
