import type { Clock, Task } from 'types/tasks'
import type { CompletionPlan } from './complete'
import { getLastEnd, isRunning, TaskNote } from './note'
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
 * What the bar's last pressed button set: tasks picked from the bar then
 * start with the primary action, start alongside, or are only added to the
 * plan, until another of its buttons is pressed.
 */
export type BarMode = 'primary' | 'alongside' | 'plan'

/** What picking a task from the bar does. */
export type BarAction = 'start' | 'switch' | 'alongside' | 'plan'

/** The bar's mode in effect: alongside only while something runs. */
export function barAction(mode: BarMode, actions: StartActions): BarAction {
	if (mode === 'plan') return 'plan'
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

/** What the ⋯ menu of a row offers, in menu order. */
export type RowAction =
	| 'stop-from-last-end'
	| 'change-start'
	| 'set-stop'
	| 'set-duration'
	| 'migrate-clock'
	| 'start-from-last-end'
	| 'migrate-last-clock'
	| 'move-up'
	| 'move-down'
	| 'move-to-bottom'
	| 'move-to-top'
	| 'show-task'
	| 'show-clock'
	| 'show-last-clock'
	| 'delete-clock'
	| 'delete-last-clock'
	| 'delete-task'

/**
 * The menu of a row of the note's `tasks`. Stopping at the last task end
 * is offered only when that end is after the running clock started; moves
 * only within the row's section (plan or Done), where they can be seen.
 */
export function rowActions(task: Task, tasks: Task[]): RowAction[] {
	const lastEnd = lastTaskEnd(tasks)
	const running = task.clocks.find((clock) => clock.end === null)
	if (running) {
		return [
			...when(
				lastEnd !== null && lastEnd > running.start,
				'stop-from-last-end'
			),
			'change-start',
			'set-stop',
			'set-duration',
			'migrate-clock',
			'show-task',
			'show-clock',
			'delete-clock',
			'delete-task',
		]
	}
	const section = sectionOf(trackerLayout(tasks), task.name)
	const index = section.findIndex((other) => other.name === task.name)
	const notFirst = index > 0
	const notLast = index >= 0 && index < section.length - 1
	const clocked = task.clocks.length > 0
	return [
		...when(lastEnd !== null, 'start-from-last-end'),
		...when(clocked, 'migrate-last-clock'),
		...when(notFirst, 'move-up'),
		...when(notLast, 'move-down'),
		...when(notLast, 'move-to-bottom'),
		...when(notFirst, 'move-to-top'),
		'show-task',
		...when(clocked, 'show-last-clock'),
		...when(clocked, 'delete-last-clock'),
		'delete-task',
	]
}

function when(condition: boolean, action: RowAction): RowAction[] {
	return condition ? [action] : []
}

/**
 * When the last stopped task ended, where "from last task end" starts or
 * stops a clock (the engine's `fromLastTask`); null when none ended yet.
 */
export function lastTaskEnd(tasks: Task[]): Date | null {
	const last = getLastEndedTasks(tasks)[0]
	return last ? getLastEnd(last) : null
}

/** The clock a row's menu acts on: the running one, else the last line. */
export function rowClock(task: Task): Clock | undefined {
	return (
		task.clocks.find((clock) => clock.end === null) ??
		task.clocks[task.clocks.length - 1]
	)
}

export type TaskMove =
	| 'up'
	| 'down'
	| 'top'
	| 'bottom'
	/** Next to another task of the same section, where a drag dropped it. */
	| { next: string; side: 'before' | 'after' }

/**
 * The note with the task's block moved among the tasks of its section in
 * the tracker (plan or Done), so a move is always visible there; null when
 * the task is gone, unchanged when it cannot move that way.
 */
export function moveTaskLine(
	content: string,
	name: string,
	move: TaskMove
): string | null {
	const note = new TaskNote(content)
	const task = note.findTask(name)
	if (!task) return null
	const section = sectionOf(trackerLayout(note.tasks), name)
	const index = section.findIndex((other) => other.name === name)
	if (index < 0) return content
	const { target, side } = moveTarget(section, index, move)
	if (!target) return content
	note.moveTask(task, target, side)
	return note.toString()
}

function moveTarget(
	section: Task[],
	index: number,
	move: TaskMove
): { target: Task | undefined; side: 'before' | 'after' } {
	switch (move) {
		case 'up':
			return { target: section[index - 1], side: 'before' }
		case 'down':
			return { target: section[index + 1], side: 'after' }
		case 'top':
			return { target: section[0], side: 'before' }
		case 'bottom':
			return { target: section[section.length - 1], side: 'after' }
		default:
			return {
				target: section.find((other) => other.name === move.next),
				side: move.side,
			}
	}
}

/**
 * Where a row dragged over a list lands: the number of rows whose middle is
 * above the pointer, from 0 (above the first row) to the row count.
 */
export function dropSlot(rowMiddles: number[], pointerY: number): number {
	return rowMiddles.filter((middle) => middle < pointerY).length
}

/**
 * The move that drops `dragged` into `slot` of the list of `names` (as given
 * by `dropSlot`); null when it would land where it already is.
 */
export function dropMove(
	names: string[],
	dragged: string,
	slot: number
): TaskMove | null {
	const index = names.indexOf(dragged)
	if (index < 0 || slot === index || slot === index + 1) return null
	const before = names[slot]
	if (before !== undefined) return { next: before, side: 'before' }
	const last = names[names.length - 1]
	return last === undefined ? null : { next: last, side: 'after' }
}

function sectionOf(layout: TrackerLayout, name: string): Task[] {
	return (
		[layout.open, layout.done].find((section) =>
			section.some((task) => task.name === name)
		) ?? []
	)
}

/** The note without the task line and its clock lines; null when gone. */
export function removeTaskLine(content: string, name: string): string | null {
	const note = new TaskNote(content)
	const task = note.findTask(name)
	if (!task) return null
	note.removeTask(task)
	return note.toString()
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
