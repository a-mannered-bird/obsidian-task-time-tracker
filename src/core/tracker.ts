import type { Goal } from 'types/goals'
import type { Clock, Task } from 'types/tasks'
import type { CompletionPlan } from './complete'
import { getLastEnd, isRunning, TaskNote } from './note'
import { NOTICE_ICON, noticeTask } from './noticeText'
import { getLastEndedTasks, INTERRUPTION_TASK } from './toggle'

/** The tracker tab's sections, each in the note's order. */
export type TrackerLayout = {
	running: Task[]
	open: Task[]
	done: Task[]
}

/**
 * The interruption task is listed only while it runs: it is not something
 * the user plans or finishes, and the Interruption button stands for it.
 * On a past day nothing runs any more: a clock left running there keeps
 * its task in the plan or Done, with the others.
 */
export function trackerLayout(tasks: Task[], past = false): TrackerLayout {
	const running = past ? [] : tasks.filter(isRunning)
	const idle = tasks.filter(
		(task) => !running.includes(task) && task.name !== INTERRUPTION_TASK
	)
	return {
		running,
		open: idle.filter((task) => !task.ticked),
		done: idle.filter((task) => task.ticked),
	}
}

/**
 * The first task line repeating the name of a line above it, or null.
 * Names identify tasks, so the tracker cannot list a note holding one
 * twice: every action on that name would hit the first line only.
 */
export function findDuplicateTask(tasks: Task[]): Task | null {
	const seen = new Set<string>()
	for (const task of tasks) {
		if (seen.has(task.name)) return task
		seen.add(task.name)
	}
	return null
}

export function describeDuplicateTask(name: string): string {
	return `${NOTICE_ICON.warning} ${noticeTask(name)} is listed twice in this note, so the tracker cannot show it. Merge the two lines or rename one.`
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
 * Why the day buttons cannot be used yet, or null when they can: an
 * interruption needs something running to interrupt, and ending the day
 * needs a day that started (its start set, a task in the note). A past
 * day needs only a task: its end defaults without a start.
 */
export type DayButtons = { interruption: string | null; endDay: string | null }

export function dayButtons(
	tasks: Task[],
	dayStart: Date | null,
	past = false
): DayButtons {
	const missing = [
		dayStart || past ? null : 'set its start',
		tasks.length > 0 ? null : 'add a task',
	].filter((step) => step !== null)
	return {
		interruption: tasks.some(isRunning)
			? null
			: 'Nothing to interrupt: start a task first',
		endDay: missing.length
			? `The day has not started: ${missing.join(' and ')} first`
			: null,
	}
}

/**
 * What the bar's pressed buttons set: tasks picked from the bar then start
 * with the primary action or alongside, or are only added to the plan.
 * The way of starting outlives planning and the moments nothing runs (the
 * bar then shows Start), so it comes back once something runs again.
 *
 * Holding Alt swaps switching and toggling (`held`); clicking the field
 * meanwhile keeps the swap until the field loses the focus (`kept`).
 */
export type BarFlip = 'off' | 'held' | 'kept'

export type BarMode = {
	start: 'primary' | 'alongside'
	planning: boolean
	flip: BarFlip
}

export const INITIAL_BAR_MODE: BarMode = {
	start: 'primary',
	planning: false,
	flip: 'off',
}

export type BarButton = 'primary' | 'alongside' | 'plan'

/**
 * The mode after pressing a bar button. Start, pressed while nothing runs,
 * is the only way of starting there: it keeps the one chosen before. A
 * pressed button says the way of starting outright, so it ends any swap.
 */
export function pressBarButton(
	mode: BarMode,
	button: BarButton,
	actions: StartActions
): BarMode {
	switch (button) {
		case 'plan':
			return { ...mode, planning: true, flip: 'off' }
		case 'alongside':
			return { start: 'alongside', planning: false, flip: 'off' }
		default:
			return {
				start: actions.alongside ? 'primary' : mode.start,
				planning: false,
				flip: 'off',
			}
	}
}

/**
 * The mode once Alt goes down or up. The swap only exists between
 * switching and toggling, so it needs something running and no planning;
 * a kept swap outlives the key.
 */
export function holdAlt(
	mode: BarMode,
	down: boolean,
	actions: StartActions
): BarMode {
	if (down && mode.flip === 'off' && !mode.planning && actions.alongside) {
		return { ...mode, flip: 'held' }
	}
	if (!down && mode.flip === 'held') return { ...mode, flip: 'off' }
	return mode
}

/** The mode once the field is clicked: a held swap is kept. */
export function keepFlip(mode: BarMode): BarMode {
	return mode.flip === 'held' ? { ...mode, flip: 'kept' } : mode
}

/** The mode once the field loses the focus: a kept swap ends. */
export function releaseFlip(mode: BarMode): BarMode {
	return mode.flip === 'kept' ? { ...mode, flip: 'off' } : mode
}

function effectiveStart(mode: BarMode): BarMode['start'] {
	if (mode.flip === 'off') return mode.start
	return mode.start === 'alongside' ? 'primary' : 'alongside'
}

/** What picking a task from the bar does. */
export type BarAction = 'start' | 'switch' | 'alongside' | 'plan'

/**
 * How a planned or done row's buttons start it: as the bar's way of
 * starting says, so one pressed button there sets both, planning included
 * (the rows' tasks are planned already).
 */
export type RowStart = Exclude<BarAction, 'plan'>

export function rowStart(mode: BarMode, actions: StartActions): RowStart {
	return effectiveStart(mode) === 'alongside' && actions.alongside
		? 'alongside'
		: actions.primary
}

/** The bar's mode in effect: alongside only while something runs. */
export function barAction(mode: BarMode, actions: StartActions): BarAction {
	return mode.planning ? 'plan' : rowStart(mode, actions)
}

/** Lucide icon of a start button, in the bar and on the rows. */
export function startIcon(start: RowStart): string {
	switch (start) {
		case 'switch':
			return 'fast-forward'
		case 'alongside':
			return 'plus'
		default:
			return 'play'
	}
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
	| 'switch-to'
	| 'start-alongside'
	| 'stop-from-last-end'
	| 'change-start'
	| 'set-stop'
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
	| 'show-in-manager'
	| 'delete-clock'
	| 'delete-last-clock'
	| 'delete-task'

/**
 * The menu of a row of the note's `tasks`, whose buttons start it with
 * `start`, or null on a past day, where clocks are only set afterwards:
 * nothing starts, stops or migrates there. The menu offers the other way
 * of starting while something runs. Stopping at the last task end is
 * offered only when that end is after the running clock started; moves
 * only within the row's section (plan or Done), where they can be seen.
 */
export function rowActions(
	task: Task,
	tasks: Task[],
	start: RowStart | null
): RowAction[] {
	const lastEnd = lastTaskEnd(tasks)
	const running = task.clocks.find((clock) => clock.end === null)
	if (running && start !== null) {
		return [
			...when(
				lastEnd !== null && lastEnd > running.start,
				'stop-from-last-end'
			),
			'change-start',
			'set-stop',
			'migrate-clock',
			'show-task',
			'show-clock',
			'show-in-manager',
			'delete-clock',
			'delete-task',
		]
	}
	const section = sectionOf(trackerLayout(tasks), task.name)
	const index = section.findIndex((other) => other.name === task.name)
	const notFirst = index > 0
	const notLast = index >= 0 && index < section.length - 1
	const clocked = task.clocks.length > 0
	const live = start !== null
	return [
		...when(start === 'alongside', 'switch-to'),
		...when(start === 'switch', 'start-alongside'),
		...when(live && lastEnd !== null, 'start-from-last-end'),
		...when(live && clocked, 'migrate-last-clock'),
		...when(notFirst, 'move-up'),
		...when(notLast, 'move-down'),
		...when(notLast, 'move-to-bottom'),
		...when(notFirst, 'move-to-top'),
		'show-task',
		...when(clocked, 'show-last-clock'),
		'show-in-manager',
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

/**
 * The note with a new unticked task line, with the targets of `goals`, or
 * unchanged when it has one.
 */
export function addTaskLine(
	content: string,
	name: string,
	tags: string[],
	goals: Goal[] = []
): string {
	const note = new TaskNote(content)
	if (note.findTask(name)) return content
	note.insertTask(name, tags, goals)
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
