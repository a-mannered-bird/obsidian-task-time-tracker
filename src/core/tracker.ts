import type { Task } from 'types/tasks'
import type { CompletionPlan } from './complete'
import { isRunning, TaskNote } from './note'
import { getLastEndedTasks, INTERRUPTION_TASK } from './toggle'

/** The tracker tab's sections, each in the note's order. */
export type TrackerLayout = {
	running: Task[]
	open: Task[]
	done: Task[]
	/** Folded, Done would leave a note holding only done tasks looking empty. */
	doneUnfolded: boolean
}

/**
 * The interruption task is listed only while it runs: it is not something
 * the user plans or finishes, and the Interruption button stands for it.
 */
export function trackerLayout(tasks: Task[]): TrackerLayout {
	const running = tasks.filter(isRunning)
	const idle = tasks.filter(
		(task) => !isRunning(task) && task.name !== INTERRUPTION_TASK
	)
	const open = idle.filter((task) => !task.ticked)
	return {
		running,
		open,
		done: idle.filter((task) => task.ticked),
		doneUnfolded: running.length === 0 && open.length === 0,
	}
}

/**
 * How a task is started from the bar or a row: starting stops what runs, so
 * the button reads Switch then; running alongside is only offered when
 * there is something to be alongside of.
 */
export type StartActions = {
	primary: 'start' | 'switch'
	alongside: boolean
}

export function startActions(running: Task[]): StartActions {
	const busy = running.length > 0
	return { primary: busy ? 'switch' : 'start', alongside: busy }
}

/**
 * What the bar's start button set: tasks picked from the bar then start
 * with the primary action or alongside, until the other button is pressed.
 */
export type BarMode = 'primary' | 'alongside'

/** The bar's mode in effect: alongside only while something runs. */
export function barStartMode(
	mode: BarMode,
	actions: StartActions
): 'start' | 'switch' | 'alongside' {
	return mode === 'alongside' && actions.alongside
		? 'alongside'
		: actions.primary
}

/** Lucide icon of the primary start button, in the bar and on the rows. */
export function primaryStartIcon(primary: StartActions['primary']): string {
	return primary === 'switch' ? 'fast-forward' : 'play'
}

/**
 * The tasks a running interruption paused, which ending it restarts: the
 * ones stopped last, as the engine resumes them. Empty when no interruption
 * runs.
 */
export function pausedByInterruption(tasks: Task[]): Task[] {
	const interruption = tasks.find(
		(task) => task.name === INTERRUPTION_TASK && isRunning(task)
	)
	return interruption ? getLastEndedTasks(tasks) : []
}

/** The note with a new unticked task line, or unchanged when it has one. */
export function addTaskLine(
	content: string,
	name: string,
	tags: string[]
): string {
	const note = new TaskNote(content)
	if (note.findTask(name)) return content
	note.insertTask(name, tags)
	return note.toString()
}

/** What End day is about to do, for its confirmation. */
export function describeCompletion(plan: CompletionPlan): string[] {
	const lines: string[] = []
	if (plan.toClose.length > 0) {
		lines.push(`${count(plan.toClose.length, 'running clock')} will be closed.`)
	}
	if (plan.toTick.length > 0) {
		lines.push(`${count(plan.toTick.length, 'task')} will be ticked.`)
	}
	if (plan.toRemove.length > 0) {
		lines.push('These tasks were never clocked and will be deleted:')
	}
	return lines
}

function count(n: number, noun: string): string {
	return `${n} ${noun}${n === 1 ? '' : 's'}`
}
