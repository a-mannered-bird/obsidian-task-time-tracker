import { Notice } from 'obsidian'
import { rewriteNote } from 'core/noteRewrite'
import { addTaskLine } from 'core/tracker'
import { BUSY_NOTICE } from 'core/trackingRun'
import type TaskTimeTracker from '../main'
import { currentTarget, NOTICE_DURATION, targetIo } from './target'

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
