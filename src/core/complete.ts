import type { Task } from 'types/tasks'
import { missingResults } from './goalCards'
import { describeTaskGoals } from './goals'
import { isRunning, type TaskNote } from './note'

/** End-of-day cleanup, computed before asking the user to confirm it. */
export type CompletionPlan = {
	/** Running tasks whose clock gets closed. */
	toClose: Task[]
	/** Clocked tasks not ticked yet. */
	toTick: Task[]
	/** Tasks without any clock nor goal; they get deleted. */
	toRemove: Task[]
	/**
	 * Tasks without any clock but with goal lines: often done without a
	 * clock, so they are kept unless the user picks them (see withRemovals).
	 */
	withGoals: Task[]
}

export function planCompletion(note: TaskNote): CompletionPlan {
	const tasks = note.tasks
	const unclocked = tasks.filter((task) => task.clocks.length === 0)
	return {
		toClose: tasks.filter(isRunning),
		toTick: tasks.filter((task) => task.clocks.length > 0 && !task.ticked),
		toRemove: unclocked.filter((task) => !hasGoalLines(task)),
		withGoals: unclocked.filter(hasGoalLines),
	}
}

function hasGoalLines(task: Task): boolean {
	return task.goals.length > 0 || task.malformedGoals.length > 0
}

export function isEmptyPlan(plan: CompletionPlan): boolean {
	return (
		plan.toClose.length === 0 &&
		plan.toTick.length === 0 &&
		plan.toRemove.length === 0 &&
		plan.withGoals.length === 0
	)
}

/** The "Has goals" group of End day's confirmation, every box off. */
export const HAS_GOALS_HEADING = 'Has goals'
export const HAS_GOALS_NOTE =
	'Never clocked, but they have goals. They are kept unless ticked. You might want to keep them around for your statistics.'

/** One choice per task with goals: its name, and the line showing its goals. */
export function goalTaskChoices(
	plan: CompletionPlan
): { value: string; label: string }[] {
	return plan.withGoals.map((task) => ({
		value: task.name,
		label: describeTaskGoals(task),
	}))
}

/**
 * The targets without a result End day warns of, leaving out the tasks of
 * the "Has goals" group, which already shows their goals.
 */
export function endDayMissingResults(
	note: TaskNote,
	plan: CompletionPlan
): string[] {
	const listed = new Set(plan.withGoals.map((task) => task.name))
	return missingResults(note.tasks.filter((task) => !listed.has(task.name)))
}

/** The plan once the user picked which tasks with goals to delete as well. */
export function withRemovals(
	plan: CompletionPlan,
	names: string[]
): CompletionPlan {
	const picked = new Set(names)
	return {
		...plan,
		toRemove: [
			...plan.toRemove,
			...plan.withGoals.filter((task) => picked.has(task.name)),
		],
		withGoals: plan.withGoals.filter((task) => !picked.has(task.name)),
	}
}

/** Apply the plan; running clocks are closed at `at` (typically the end of day). */
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
