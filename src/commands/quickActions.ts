import type { ToggleOptions } from 'core/toggle'
import type TaskTimeTracker from '../main'
import { completeJournal } from './completeJournal'
import { TIME_COMMANDS, runTimeCommand } from './frontmatterTime'
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
	/** Ask how many minutes ago the action happened. */
	timeTravel: boolean
	/** Show as a button in the tracker tab. */
	showInTracker: boolean
	/** Also prompt for the wake time, like the old "Getting up" macro. */
	setWakeTime: boolean
	/** Also prompt for the bed time. */
	setBedTime: boolean
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
		setWakeTime: false,
		setBedTime: false,
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
	if (action.setWakeTime) await runTimeCommand(plugin, TIME_COMMANDS[0]!)
	// Bed time first: the journal completion closes clocks at the bed time.
	if (action.setBedTime) await runTimeCommand(plugin, TIME_COMMANDS[1]!)
	if (action.completeJournal) await completeJournal(plugin)
}

/**
 * One command per configured quick action. Registered at load; renaming an
 * action changes its command id, so its hotkey must be reassigned.
 */
export function registerQuickActionCommands(plugin: TaskTimeTracker) {
	const seen = new Set<string>()
	for (const action of plugin.settings.quickActions) {
		if (!action.name || !action.taskName) continue
		const id = `quick-action-${slugify(action.name)}`
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

function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, '-')
		.replace(/^-+|-+$/g, '')
}

export function isQuickActionVerb(value: string): value is QuickActionVerb {
	return (QUICK_ACTION_VERBS as readonly string[]).includes(value)
}
