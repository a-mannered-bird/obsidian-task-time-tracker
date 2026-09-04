/** The settings keyed by task name, generic over the quick action shape. */
export type NameKeyedSettings<Action extends { taskName: string }> = {
	taskColors: Record<string, string>
	hiddenTasks: string[]
	quickActions: Action[]
	unassignedTaskName: string
}

/**
 * Follow a rename or merge in the name-keyed settings, silently — these
 * migrations preserve intent (a button keeps working after a rename).
 *
 * Colors: the target's own wins, else the first source with one transfers.
 * Hidden: the target's own flag when it already existed as a task, else
 * hidden only when every source was. Quick actions and the unassigned task
 * pointing at a source follow to the target. Source entries are dropped.
 */
export function migrateTaskNames<Action extends { taskName: string }>(
	settings: NameKeyedSettings<Action>,
	sourceNames: string[],
	targetName: string,
	targetExists: boolean
): NameKeyedSettings<Action> {
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
		quickActions: settings.quickActions.map((action) =>
			isSource(action.taskName) ? { ...action, taskName: targetName } : action
		),
		unassignedTaskName: isSource(settings.unassignedTaskName)
			? targetName
			: settings.unassignedTaskName,
	}
}

/**
 * Drop the deleted task's own entries (color, hide flag). Quick actions and
 * the unassigned task are left alone: the deletion warned about them, and
 * what to do with them is the user's call.
 */
export function forgetTaskName<Action extends { taskName: string }>(
	settings: NameKeyedSettings<Action>,
	name: string
): NameKeyedSettings<Action> {
	const taskColors = { ...settings.taskColors }
	delete taskColors[name]
	return {
		...settings,
		taskColors,
		hiddenTasks: settings.hiddenTasks.filter((hidden) => hidden !== name),
	}
}
