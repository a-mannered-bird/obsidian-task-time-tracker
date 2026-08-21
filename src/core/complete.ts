import type { Task } from 'types/tasks'
import { isRunning, type TaskNote } from './note'

/** End-of-day cleanup, computed before asking the user to confirm it. */
export type CompletionPlan = {
	/** Running tasks whose clock gets closed. */
	toClose: Task[]
	/** Clocked tasks not ticked yet. */
	toTick: Task[]
	/** Tasks without any clock; they get deleted. */
	toRemove: Task[]
}

export function planCompletion(note: TaskNote): CompletionPlan {
	const tasks = note.tasks
	return {
		toClose: tasks.filter(isRunning),
		toTick: tasks.filter((task) => task.clocks.length > 0 && !task.ticked),
		toRemove: tasks.filter((task) => task.clocks.length === 0),
	}
}

export function isEmptyPlan(plan: CompletionPlan): boolean {
	return (
		plan.toClose.length === 0 &&
		plan.toTick.length === 0 &&
		plan.toRemove.length === 0
	)
}

/** Apply the plan; running clocks are closed at `at` (typically the bed time). */
export function applyCompletion(
	note: TaskNote,
	plan: CompletionPlan,
	at: Date
): void {
	for (const task of plan.toClose) {
		const fresh = note.getRunningTasks().find((t) => t.name === task.name)
		if (fresh) note.stopClock(fresh, at)
	}
	for (const task of plan.toTick) {
		const fresh = note.tasks.find((t) => t.name === task.name && !t.ticked)
		if (fresh) note.setTicked(fresh, true)
	}
	for (const task of plan.toRemove) {
		const fresh = note.tasks.find(
			(t) => t.name === task.name && t.clocks.length === 0
		)
		if (fresh) note.removeTask(fresh)
	}
}
