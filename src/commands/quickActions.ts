import type { ToggleOptions } from 'core/toggle'
import type TaskTimeTracker from '../main'
import { endDay } from './completeJournal'
import {
	DAY_END_COMMAND,
	runTimeCommand,
	DAY_START_COMMAND,
} from './frontmatterTime'
import { runTrackingSteps } from './tracking'

export const QUICK_ACTION_VERBS = [
	'toggle',
	'switch',
	'ensure-on',
	'ensure-off',
] as const

export type QuickActionVerb = (typeof QUICK_ACTION_VERBS)[number]

/** A user-defined one-click action on a fixed task (settings list). */
export type QuickAction = {
	name: string
	taskName: string
	verb: QuickActionVerb
	/** Ask when the action happened (a time of day or minutes ago). */
	timeTravel: boolean
	/** Show as a button in the tracker tab. */
	showInTracker: boolean
	/** Also prompt for the start of day, like the old "Getting up" macro. */
	setDayStart: boolean
	/** Also prompt for the end of day. */
	setDayEnd: boolean
	/** Then run the end-of-day cleanup, like the old "Getting to bed" macro. */
	completeJournal: boolean
}

export function emptyQuickAction(): QuickAction {
	return {
		name: '',
		taskName: '',
		verb: 'switch',
		timeTravel: false,
		showInTracker: true,
		setDayStart: false,
		setDayEnd: false,
		completeJournal: false,
	}
}

/** Fill fields added after the action was saved with their defaults. */
export function normalizeQuickAction(saved: Partial<QuickAction>): QuickAction {
	return { ...emptyQuickAction(), ...saved }
}

const VERB_STEPS: Record<QuickActionVerb, (taskName: string) => ToggleOptions> =
	{
		toggle: (taskName) => ({ taskName }),
		switch: (taskName) => ({ taskName, switch: true }),
		'ensure-on': (taskName) => ({ taskName, targetState: 'on' }),
		'ensure-off': (taskName) => ({ taskName, targetState: 'off' }),
	}

export async function runQuickAction(
	plugin: TaskTimeTracker,
	action: QuickAction
) {
	const step = VERB_STEPS[action.verb](action.taskName)
	if (action.timeTravel) step.timeTravel = true
	await runTrackingSteps(plugin, [step])
	if (action.setDayStart) await runTimeCommand(plugin, DAY_START_COMMAND)
	// End of day first: ending the day closes clocks at the end of day.
	const dayEnd = action.setDayEnd
		? await runTimeCommand(plugin, DAY_END_COMMAND)
		: null
	if (action.completeJournal) await endDay(plugin, dayEnd ?? undefined)
}

/**
 * One command per configured quick action. Registered at load; renaming an
 * action changes its command id, so its hotkey must be reassigned.
 */
export function registerQuickActionCommands(plugin: TaskTimeTracker) {
	const seen = new Set<string>()
	for (const action of plugin.settings.quickActions) {
		if (!action.name || !action.taskName) continue
		const id = quickActionCommandId(action)
		if (seen.has(id)) continue
		seen.add(id)
		plugin.addCommand({
			id,
			name: action.name,
			icon: 'zap',
			callback: () => void runQuickAction(plugin, action),
		})
	}
}

/** Renaming an action changes it: see registerQuickActionCommands. */
export function quickActionCommandId(action: QuickAction): string {
	return `quick-action-${slugify(action.name)}`
}

function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, '-')
		.replace(/^-+|-+$/g, '')
}

export function isQuickActionVerb(value: string): value is QuickActionVerb {
	return (QUICK_ACTION_VERBS as readonly string[]).includes(value)
}
