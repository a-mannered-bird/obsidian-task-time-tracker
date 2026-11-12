import { Notice } from 'obsidian'
import { rewriteNote } from 'core/noteRewrite'
import type { ToggleOptions, TaskChoice } from 'core/toggle'
import { addTaskLine } from 'core/tracker'
import { BUSY_NOTICE } from 'core/trackingRun'
import type TaskTimeTracker from '../main'
import { currentTarget, NOTICE_DURATION, targetIo } from './target'
import { runTrackingSteps } from './tracking'

/**
 * How the user started a task in the tracker tab: Start while nothing ran,
 * Switch (stopping what runs) or alongside what runs.
 */
export type StartMode = 'start' | 'switch' | 'alongside'

/**
 * Start the chosen task, added to the note when it is new. Start and
 * alongside only ever start it: something may have started elsewhere since
 * the tab showed nothing running, and the user did not ask to stop it.
 */
export function startTask(
	plugin: TaskTimeTracker,
	choice: TaskChoice,
	mode: StartMode,
	timeTravel: boolean
): Promise<void> {
	const step: ToggleOptions =
		mode === 'switch'
			? { switch: true, timeTravel }
			: { targetState: 'on', timeTravel }
	return runTrackingSteps(plugin, [step], choice)
}

/** Stop running tasks; `done` also ticks them. */
export function stopTasks(
	plugin: TaskTimeTracker,
	names: string[],
	options: { done: boolean; timeTravel: boolean }
): Promise<void> {
	return runTrackingSteps(
		plugin,
		names.map((taskName) => ({
			taskName,
			targetState: 'off',
			tick: options.done,
			timeTravel: options.timeTravel,
		}))
	)
}

/** Add a task to the note's plan without starting it. */
export async function addToPlan(
	plugin: TaskTimeTracker,
	name: string,
	tags: string[]
): Promise<void> {
	const outcome = await rewriteNote(
		targetIo(plugin, currentTarget(plugin)),
		(content) => addTaskLine(content, name, tags)
	)
	if (outcome === 'busy') new Notice(BUSY_NOTICE, NOTICE_DURATION)
}
