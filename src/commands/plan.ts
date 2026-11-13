import { Notice } from 'obsidian'
import { rewriteNote } from 'core/noteRewrite'
import { noteDayHeading } from 'core/overnight'
import { addTaskLine } from 'core/tracker'
import { BUSY_NOTICE } from 'core/trackingRun'
import { pickTask } from 'ui/TaskSuggestModal'
import type TaskTimeTracker from '../main'
import {
	currentTarget,
	NOTICE_DURATION,
	readTaskNote,
	targetIo,
} from './target'
import { loadVaultEntries } from './tracking'

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

/**
 * Pick a task and add it to the note's plan without starting it: the other
 * notes' tasks or a new one, as the note's own are already planned.
 */
async function planTask(plugin: TaskTimeTracker): Promise<void> {
	const target = currentTarget(plugin)
	const note = target.file ? await readTaskNote(plugin, target.file) : null
	const picked = await pickTask(plugin.app, {
		placeholder: 'Which task to plan?',
		tagMappings: plugin.settings.tagMappings,
		note: { tasks: [], names: note?.tasks.map((task) => task.name) ?? [] },
		vaultEntries: loadVaultEntries(plugin),
		noteHeading: noteDayHeading(target.date, new Date()),
	})
	if (picked) await addToPlan(plugin, picked.name, picked.tags)
}

export function registerPlanCommand(plugin: TaskTimeTracker) {
	plugin.addCommand({
		id: 'plan-task',
		name: 'Plan a task',
		icon: 'list-plus',
		callback: () => void planTask(plugin),
	})
}
