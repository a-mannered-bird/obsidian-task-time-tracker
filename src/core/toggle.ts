import type { Task } from 'types/tasks'
import { taskMinutes } from './aggregate'
import { getLastEnd, isRunning, type TaskNote } from './note'
import { addMinutes, formatLocalDateTime, getMinutesBetween } from './time'

/**
 * What a tracking command does. Every command of the plugin is one fixed
 * combination of these options; see README "Tracking commands".
 */
export type ToggleOptions = {
	/** Toggle this task instead of asking. */
	taskName?: string
	/** Toggle the task(s) that ended last, instead of asking. */
	previous?: boolean
	/** Placeholder of the task picker. */
	placeholder?: string
	/** Close every running clock before toggling the selected task. */
	switch?: boolean
	/** Mark the toggled tasks as done (when switching: only the closed ones). */
	tick?: boolean
	/** Ask how many minutes ago the toggle happened. */
	timeTravel?: boolean
	/** Toggle at the moment the last finished task ended. */
	fromLastTask?: boolean
	/** Desired end state; tasks already in it are left untouched. */
	targetState?: 'on' | 'off'
	/** Start the unassigned task, or stop it and move its time to a real task. */
	interruption?: boolean
	/** Move the running clock to another task instead of toggling. */
	migrate?: boolean
	/** Close the running clock of a task so that it lasted N minutes. */
	setDuration?: boolean
}

/** User interaction the engine needs; the commands wire it to modals. */
export type Prompts = {
	pickTask(tasks: Task[], placeholder: string): Promise<Task | null>
	promptMinutes(options: {
		title: string
		description?: string
		defaultValue?: number
	}): Promise<number | null>
	notify(message: string): void
}

export type ToggleContext = {
	prompts: Prompts
	unassignedTaskName: string
	now: Date
}

/**
 * Apply a tracking command to the note. Returns true when the note changed.
 * The note is mutated in place; the caller writes it back.
 */
export async function toggleTasks(
	note: TaskNote,
	options: ToggleOptions,
	context: ToggleContext
): Promise<boolean> {
	const { prompts, now } = context

	if (options.migrate) return migrateRunningClock(note, options, context)

	const candidates = options.setDuration ? note.getRunningTasks() : note.tasks
	if (candidates.length === 0) {
		prompts.notify(
			options.setDuration ? 'No running task found.' : 'No tasks found.'
		)
		return false
	}

	// A quick interruption starts the unassigned task when it is off, and
	// otherwise ends it by going back to the tasks that were running before.
	const unassigned = options.interruption
		? note.findTask(context.unassignedTaskName)
		: undefined
	const endingInterruption = Boolean(unassigned && isRunning(unassigned))
	const effective: ToggleOptions = endingInterruption
		? { ...options, taskName: undefined, previous: true }
		: options.interruption
			? { ...options, taskName: context.unassignedTaskName }
			: options

	let selected = await selectTasks(note, candidates, effective, prompts)
	if (!selected) return false

	if (effective.targetState) {
		selected = keepTasksNeedingChange(selected, effective.targetState, prompts)
		if (selected.length === 0) return false
	}

	const at = await resolveTime(note, selected, effective, context)
	if (!at) return false

	let changed = false
	if (effective.switch) {
		const toStop = note
			.getRunningTasks()
			.filter((task) => !selected.some(sameTask(task)))
		for (const task of toStop) {
			toggleOne(note, task, at, Boolean(effective.tick), prompts, now)
			changed = true
		}
	}

	for (const task of selected) {
		const fresh = note.findTask(task.name)
		if (!fresh) continue
		if (effective.switch && isRunning(fresh)) {
			prompts.notify(`"${fresh.name}" is already running.`)
			continue
		}
		// When switching, ticking applies to the tasks being closed, not the new one.
		const shouldTick = Boolean(effective.tick && !effective.switch)
		toggleOne(note, fresh, at, shouldTick, prompts, now)
		changed = true
	}

	if (endingInterruption && unassigned) {
		await moveLastClockTo(
			note,
			unassigned,
			'What was the interruption?',
			prompts
		)
	}

	return changed
}

// ----- selection -----

async function selectTasks(
	note: TaskNote,
	candidates: Task[],
	options: ToggleOptions,
	prompts: Prompts
): Promise<Task[] | null> {
	if (options.previous) {
		const last = getLastEndedTasks(note.tasks)
		if (last.length === 0) {
			prompts.notify('No tasks have been worked on today yet.')
			return null
		}
		return last
	}

	if (options.taskName !== undefined) {
		const task = note.findTask(options.taskName)
		if (!task) {
			prompts.notify(`Couldn't find "${options.taskName}".`)
			return null
		}
		return [task]
	}

	const choices = options.switch
		? candidates.filter((task) => !isRunning(task))
		: candidates
	const picked = await prompts.pickTask(
		choices,
		options.placeholder ?? 'Which task?'
	)
	return picked ? [picked] : null
}

/** Non-running tasks sharing the most recent clock end, in note order. */
export function getLastEndedTasks(tasks: Task[]): Task[] {
	const stopped = tasks.filter((task) => !isRunning(task))
	const ends = stopped.map((task) => getLastEnd(task)?.valueOf() ?? null)
	const latest = Math.max(...ends.map((end) => end ?? -Infinity))
	if (!isFinite(latest)) return []
	return stopped.filter((_, index) => ends[index] === latest)
}

function keepTasksNeedingChange(
	tasks: Task[],
	targetState: 'on' | 'off',
	prompts: Prompts
): Task[] {
	const kept = tasks.filter((task) => {
		const isOn = isRunning(task)
		const needsChange = (targetState === 'on') !== isOn
		if (!needsChange) {
			prompts.notify(`"${task.name}" is already ${isOn ? 'on' : 'off'}.`)
		}
		return needsChange
	})
	if (kept.length === 0 && tasks.length > 1) {
		prompts.notify('All selected tasks are already in the desired state.')
	}
	return kept
}

// ----- time -----

async function resolveTime(
	note: TaskNote,
	selected: Task[],
	options: ToggleOptions,
	context: ToggleContext
): Promise<Date | null> {
	const { prompts, now } = context

	if (options.setDuration) {
		const running = selected[0]?.clocks.find((clock) => clock.end === null)
		if (!running) {
			prompts.notify('The selected task is not running.')
			return null
		}
		const minutes = await prompts.promptMinutes({
			title: 'How long did the task last?',
			defaultValue: 5,
		})
		return minutes === null ? null : addMinutes(running.start, minutes)
	}

	let at = now
	if (options.fromLastTask) {
		const last = getLastEndedTasks(note.tasks)[0]
		const end = last ? getLastEnd(last) : null
		if (!end) {
			prompts.notify('No tasks have been worked on today yet.')
			return null
		}
		at = end
	}
	if (options.timeTravel) {
		const minutes = await prompts.promptMinutes({
			title: 'How many minutes ago?',
			description: 'Use a negative value to toggle in the future.',
		})
		if (minutes === null) return null
		at = addMinutes(at, -minutes)
	}
	return at
}

// ----- mutations -----

function toggleOne(
	note: TaskNote,
	task: Task,
	at: Date,
	tick: boolean,
	prompts: Prompts,
	now: Date
) {
	const closing = isRunning(task)
	if (closing) note.stopClock(task, at)
	else note.startClock(task, at)
	if (tick) note.setTicked(note.findTask(task.name) ?? task, true)

	const time = formatLocalDateTime(at).split('T')[1]
	const emoji = tick ? '✅' : closing ? '☕️' : '⏰'
	let message = `${emoji} "${task.name}" toggled ${closing ? 'off' : 'on'}${tick ? ' and ticked' : ''} at ${time}`
	if (closing) {
		const running = task.clocks.find((clock) => clock.end === null)
		const session = running ? getMinutesBetween(running.start, at) : 0
		const total = taskMinutes(note.findTask(task.name) ?? task, now)
		message += ` (${session} / ${total}m)`
	}
	prompts.notify(`${message}.`)
}

async function migrateRunningClock(
	note: TaskNote,
	options: ToggleOptions,
	context: ToggleContext
): Promise<boolean> {
	const running = note.getRunningTasks()[0]
	if (!running) {
		context.prompts.notify('No running task to migrate.')
		return false
	}
	return moveLastClockTo(
		note,
		running,
		options.placeholder ?? 'Which task to migrate to?',
		context.prompts
	)
}

async function moveLastClockTo(
	note: TaskNote,
	from: Task,
	placeholder: string,
	prompts: Prompts
): Promise<boolean> {
	const choices = note.tasks.filter(
		(task) => !isRunning(task) && task.name !== from.name
	)
	const target = await prompts.pickTask(choices, placeholder)
	if (!target) return false
	const freshFrom = note.findTask(from.name)
	const freshTarget = note.findTask(target.name)
	if (!freshFrom || !freshTarget) return false
	note.moveLastClock(freshFrom, freshTarget)
	prompts.notify(`⤴️ Clock moved from "${from.name}" to "${target.name}".`)
	return true
}

function sameTask(task: Task) {
	return (other: Task) => other.name === task.name
}
