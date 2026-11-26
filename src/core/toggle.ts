import type { Goal } from 'types/goals'
import type { Clock, Task } from 'types/tasks'
import { getLastEnd, isRunning, type TaskNote } from './note'
import { addMinutes } from './time'
import { describeStoppedClock } from './handOff'
import { NOTICE_ICON, noticeTask } from './noticeText'
import { formatTimeOfDay } from './timeline'
import {
	atTime,
	describeStart,
	parseToggleTime,
	type TypedTime,
} from './typedTime'

/**
 * What a tracking command does. Every command of the plugin is one fixed
 * combination of these options; see README "Tracking commands".
 */
export type ToggleOptions = {
	/** Toggle this task instead of asking. */
	taskName?: string
	/** Toggle these tasks instead of asking, at one time. */
	taskNames?: string[]
	/** Toggle the task(s) that ended last, instead of asking. */
	previous?: boolean
	/** Placeholder of the task picker. */
	placeholder?: string
	/** Close every running clock before toggling the selected task. */
	switch?: boolean
	/** Mark the toggled tasks as done (when switching: only the closed ones). */
	tick?: boolean
	/** Ask when the toggle happened: a time of day or minutes ago. */
	timeTravel?: boolean
	/** Toggle at the moment the last finished task ended. */
	fromLastTask?: boolean
	/** Desired end state; tasks already in it are left untouched. */
	targetState?: 'on' | 'off'
	/** Start the interruption task, or stop it and move its time to a real task. */
	interruption?: boolean
	/**
	 * Move a clock to another task instead of toggling: the last clock of
	 * `taskName` (running or not), else the running clock, asking which one
	 * when several run.
	 */
	migrate?: boolean
	/**
	 * Close the running clock of a task so that it lasted N minutes; with
	 * `interruption`, the interruption's, ending it at that time.
	 */
	setDuration?: boolean
}

export type PickTaskRequest = {
	/**
	 * The tasks to offer from a version of the note. The picker calls it
	 * again when the note changes while it is open, so it stays current.
	 */
	choices: (note: TaskNote) => Task[]
	placeholder: string
	/**
	 * Offer vault-wide tasks besides the choices; picking one adds it to
	 * the note first. Off for pickers over running tasks (set duration).
	 */
	includeVault: boolean
}

/**
 * A picked task, by name: one of the note or one to add to it. `running` is
 * the state the user saw when picking, so a run redone on newer content can
 * tell whether the pick still means the same. `tags` and `goals` are what a
 * line added for it gets, from its most recent occurrence.
 */
export type TaskChoice = {
	name: string
	tags: string[]
	goals: Goal[]
	running: boolean
}

export function taskChoice(task: Task): TaskChoice {
	return {
		name: task.name,
		tags: task.tags,
		goals: task.goals,
		running: isRunning(task),
	}
}

/**
 * A time to ask for, as minutes before a reference or as a time of day;
 * `parse` reads either form against that reference.
 */
export type TimeRequest = {
	title: string
	description?: string
	/** What happens at the time, opening the full date shown under the fields: `Stops`. */
	verb: string
	/**
	 * What the minutes count back from. Absent, it is now: the prompt keeps
	 * its fields current while it stays open and parses at the moment of the
	 * answer.
	 */
	reference?: Date
	parse: (text: string, reference: Date) => TypedTime
}

/** User interaction the engine needs; the commands wire it to modals. */
export type Prompts = {
	pickTask(note: TaskNote, request: PickTaskRequest): Promise<TaskChoice | null>
	promptMinutes(options: {
		title: string
		description?: string
		defaultValue?: number
	}): Promise<number | null>
	promptTime(request: TimeRequest): Promise<Date | null>
	notify(message: string): void
}

/** The task a quick interruption records its time in until it is assigned. */
export const INTERRUPTION_TASK = 'Interruption'

export type ToggleContext = {
	prompts: Prompts
	now: Date
	/** The note's day, where a typed time of day lands; now's by default. */
	day?: Date
}

/**
 * The step asking when it happens, for a note where now is not the time to
 * track at; steps that already set their time keep it.
 */
export function askingTime(step: ToggleOptions): ToggleOptions {
	return step.fromLastTask || step.setDuration || step.migrate
		? step
		: { ...step, timeTravel: true }
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
	const { prompts } = context

	if (options.migrate) return migrateClock(note, options, context)

	if (options.setDuration && note.getRunningTasks().length === 0) {
		prompts.notify(`${NOTICE_ICON.info} No running task found.`)
		return false
	}

	// A quick interruption starts the interruption task when it is off, and
	// otherwise ends it by going back to the tasks that were running before.
	const interruption = options.interruption
		? note.findTask(INTERRUPTION_TASK)
		: undefined
	const endingInterruption = Boolean(interruption && isRunning(interruption))
	// Interruptions must work on any note, not only on those planned with
	// the interruption task in them.
	if (options.interruption && !interruption) {
		note.insertTask(INTERRUPTION_TASK, [])
	}
	const effective: ToggleOptions = endingInterruption
		? { ...options, taskName: undefined, previous: true }
		: options.interruption
			? { ...options, taskName: INTERRUPTION_TASK }
			: options

	let selected = await selectTasks(note, effective, context)
	if (!selected) return false

	if (effective.targetState) {
		selected = keepTasksNeedingChange(selected, effective.targetState, prompts)
		if (selected.length === 0) return false
	}

	// Ending an interruption selects the paused tasks, which do not run:
	// its duration is the interruption's own clock.
	const timed = endingInterruption && interruption ? interruption : selected[0]
	const at = await resolveTime(note, selected, effective, context, timed)
	if (!at) return false

	let changed = false
	if (effective.switch) {
		const toStop = note
			.getRunningTasks()
			.filter((task) => !selected.some(sameTask(task)))
		for (const task of toStop) {
			toggleOne(note, task, at, Boolean(effective.tick), context)
			changed = true
		}
	}

	for (const task of selected) {
		const fresh = note.findTask(task.name)
		if (!fresh) continue
		if (effective.switch && isRunning(fresh)) {
			prompts.notify(
				`${NOTICE_ICON.info} ${noticeTask(fresh.name)} is already running.`
			)
			continue
		}
		// When switching, ticking applies to the tasks being closed, not the new one.
		const shouldTick = Boolean(effective.tick && !effective.switch)
		toggleOne(note, fresh, at, shouldTick, context)
		changed = true
	}

	if (endingInterruption && interruption) {
		await moveLastClockTo(
			note,
			interruption,
			'What was the interruption?',
			prompts
		)
	}

	return changed
}

// ----- selection -----

async function selectTasks(
	note: TaskNote,
	options: ToggleOptions,
	context: ToggleContext
): Promise<Task[] | null> {
	const { prompts } = context
	if (options.previous) {
		const last = getLastEndedTasks(note.tasks)
		if (last.length === 0) {
			prompts.notify(
				`${NOTICE_ICON.info} No tasks have been worked on today yet.`
			)
			return null
		}
		return last
	}

	const names =
		options.taskNames ??
		(options.taskName === undefined ? null : [options.taskName])
	if (names) {
		const found = names.flatMap((name) => {
			const task = note.findTask(name)
			if (!task) {
				prompts.notify(
					`${NOTICE_ICON.warning} Couldn't find ${noticeTask(name)}.`
				)
			}
			return task ? [task] : []
		})
		return found.length > 0 ? found : null
	}

	const choices = (version: TaskNote) => {
		const candidates = options.setDuration
			? version.getRunningTasks()
			: version.tasks
		return options.switch
			? candidates.filter((task) => !isRunning(task))
			: candidates
	}
	const picked = await prompts.pickTask(note, {
		choices,
		placeholder: options.placeholder ?? 'Which task?',
		includeVault: !options.setDuration,
	})
	return picked ? [resolveChoice(note, picked)] : null
}

/** The note's task of that name, added to the note when it has none. */
function resolveChoice(note: TaskNote, choice: TaskChoice): Task {
	return (
		note.findTask(choice.name) ??
		note.insertTask(choice.name, choice.tags, choice.goals)
	)
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
			prompts.notify(
				`${NOTICE_ICON.info} ${noticeTask(task.name)} is already ${isOn ? 'on' : 'off'}.`
			)
		}
		return needsChange
	})
	if (kept.length === 0 && tasks.length > 1) {
		prompts.notify(
			`${NOTICE_ICON.info} All selected tasks are already in the desired state.`
		)
	}
	return kept
}

// ----- time -----

async function resolveTime(
	note: TaskNote,
	selected: Task[],
	options: ToggleOptions,
	context: ToggleContext,
	timed: Task | undefined
): Promise<Date | null> {
	const { prompts, now } = context

	if (options.setDuration) {
		const running = timed?.clocks.find((clock) => clock.end === null)
		if (!timed || !running) {
			prompts.notify(`${NOTICE_ICON.info} The selected task is not running.`)
			return null
		}
		const minutes = await prompts.promptMinutes({
			...durationQuestion(timed.name, running.start, now),
			defaultValue: 5,
		})
		return minutes === null ? null : addMinutes(running.start, minutes)
	}

	let at = now
	if (options.fromLastTask) {
		const last = getLastEndedTasks(note.tasks)[0]
		const end = last ? getLastEnd(last) : null
		if (!end) {
			prompts.notify(
				`${NOTICE_ICON.info} No tasks have been worked on today yet.`
			)
			return null
		}
		at = end
	}
	if (options.timeTravel) {
		const reference = options.fromLastTask ? at : undefined
		const day = reference ?? context.day ?? now
		const after = latestClosedStart(note, selected, options)
		const started = after ? describeStart(after, now) : undefined
		const picked = await prompts.promptTime({
			...timeQuestion(selected, options, started),
			reference,
			parse: (text, reference) =>
				parseToggleTime(text, reference, { day, after }),
		})
		if (!picked) return null
		at = picked
	}
	return at
}

/**
 * The duration is not a correction of the time shown: it stops the clock at
 * its start plus the minutes typed, so the description says so.
 */
function durationQuestion(
	name: string,
	start: Date,
	now: Date
): { title: string; description: string } {
	const started = atTime(start, now)
	return name === INTERRUPTION_TASK
		? {
				title: 'How long did the interruption last?',
				description: `Ends the interruption this many minutes after it started ${started}, and resumes the paused tasks.`,
			}
		: {
				title: 'How long did the task last?',
				description: `Stops "${name}" this many minutes after its clock started ${started}.`,
			}
}

/**
 * How a toggle asks its time: by what it does to the selected tasks when
 * that is fixed, else as a toggle naming them. `started` says when the
 * clock it closes started.
 */
function timeQuestion(
	selected: Task[],
	options: ToggleOptions,
	started: string | undefined
): { title: string; description?: string; verb: string } {
	const names = selected.map((task) => `"${task.name}"`).join(', ')
	if (options.interruption) {
		// Ending an interruption selects the paused tasks: naming them would
		// say they toggle, while they resume.
		return options.previous
			? {
					title: 'When did the interruption end?',
					description: started,
					verb: 'Ends',
				}
			: {
					title: 'When did the interruption start?',
					description: started,
					verb: 'Starts',
				}
	}
	if (options.switch) {
		return { title: `When to switch to ${names}?`, verb: 'Switches' }
	}
	if (options.targetState === 'on') {
		return selected.length > 1
			? {
					title: `When do ${names} start?`,
					description: started,
					verb: 'Start',
				}
			: {
					title: `When does ${names} start?`,
					description: started,
					verb: 'Starts',
				}
	}
	if (options.targetState === 'off') {
		return selected.length > 1
			? { title: `When do ${names} stop?`, description: started, verb: 'Stop' }
			: {
					title: `When does ${names} stop?`,
					description: started,
					verb: 'Stops',
				}
	}
	return {
		title: 'When did it happen?',
		description: [`Toggles ${names}.`, started].filter(Boolean).join(' '),
		verb: 'Toggles',
	}
}

/**
 * The latest start of the clocks the toggle closes: those of the selected
 * running tasks, or when switching, of every other running task.
 */
function latestClosedStart(
	note: TaskNote,
	selected: Task[],
	options: ToggleOptions
): Date | null {
	const closing = options.switch
		? note.getRunningTasks().filter((task) => !selected.some(sameTask(task)))
		: selected.filter(isRunning)
	const starts = closing.flatMap((task) =>
		task.clocks.flatMap((clock) => (clock.end === null ? [clock.start] : []))
	)
	if (starts.length === 0) return null
	return new Date(Math.max(...starts.map((start) => start.valueOf())))
}

// ----- mutations -----

const TOGGLE_NOTICE = new RegExp(
	`^(${NOTICE_ICON.start} Started|${NOTICE_ICON.stop} Stopped|${NOTICE_ICON.done} (Finished|Started and ticked)) `
)

/**
 * Whether a notice only reports a clock started or stopped, which a caller
 * telling about the change itself (the tracker tab) leaves out.
 */
export function isToggleNotice(message: string): boolean {
	return TOGGLE_NOTICE.test(message)
}

function toggleOne(
	note: TaskNote,
	task: Task,
	at: Date,
	tick: boolean,
	context: ToggleContext
) {
	const running = task.clocks.find((clock) => clock.end === null)
	if (running && running.start > at) {
		cancelClock(note, task, running, tick, context)
		return
	}
	if (running) note.stopClock(task, at)
	else note.startClock(task, at)
	if (tick) note.setTicked(note.findTask(task.name) ?? task, true)

	const time = formatTimeOfDay(at)
	if (!running) {
		const started = tick
			? `${NOTICE_ICON.done} Started and ticked`
			: `${NOTICE_ICON.start} Started`
		context.prompts.notify(`${started} ${noticeTask(task.name)} at ${time}.`)
		return
	}
	const stopped = describeStoppedClock(
		{ taskName: task.name, start: running.start, end: at },
		{ tasks: note.tasks, day: context.day ?? context.now, now: context.now }
	)
	const verb = tick
		? `${NOTICE_ICON.done} Finished`
		: `${NOTICE_ICON.stop} Stopped`
	context.prompts.notify(`${verb} ${stopped} at ${time}.`)
}

/** A clock stopped before its start never ran: it goes instead of closing backwards. */
function cancelClock(
	note: TaskNote,
	task: Task,
	clock: Clock,
	tick: boolean,
	context: ToggleContext
) {
	note.removeClock(clock)
	if (tick) note.setTicked(note.findTask(task.name) ?? task, true)
	const start = formatTimeOfDay(clock.start)
	context.prompts.notify(
		tick
			? `${NOTICE_ICON.done} Ticked ${noticeTask(task.name)} and removed its clock, which would have started at ${start}.`
			: `${NOTICE_ICON.remove} Removed the clock of ${noticeTask(task.name)}, which would have started at ${start}.`
	)
}

async function migrateClock(
	note: TaskNote,
	options: ToggleOptions,
	context: ToggleContext
): Promise<boolean> {
	const { prompts } = context
	const { taskName } = options
	const from =
		taskName === undefined
			? await pickRunningTask(note, prompts)
			: note.findTask(taskName)
	if (!from) {
		if (taskName !== undefined) {
			prompts.notify(
				`${NOTICE_ICON.warning} Couldn't find ${noticeTask(taskName)}.`
			)
		}
		return false
	}
	if (from.clocks.length === 0) {
		prompts.notify(
			`${NOTICE_ICON.info} ${noticeTask(from.name)} has no clock to migrate.`
		)
		return false
	}
	return moveLastClockTo(
		note,
		from,
		options.placeholder ?? 'Which task to migrate to?',
		prompts
	)
}

/** The running task, asking which one when several run. */
async function pickRunningTask(
	note: TaskNote,
	prompts: Prompts
): Promise<Task | null> {
	const running = note.getRunningTasks()
	if (running.length === 0) {
		prompts.notify(`${NOTICE_ICON.info} No running task to migrate.`)
		return null
	}
	if (running.length === 1) return running[0] ?? null
	const picked = await prompts.pickTask(note, {
		choices: (version) => version.getRunningTasks(),
		placeholder: 'Which running clock to migrate?',
		includeVault: false,
	})
	return picked ? (note.findTask(picked.name) ?? null) : null
}

async function moveLastClockTo(
	note: TaskNote,
	from: Task,
	placeholder: string,
	prompts: Prompts
): Promise<boolean> {
	const picked = await prompts.pickTask(note, {
		choices: (version) =>
			version.tasks.filter(
				(task) => !isRunning(task) && task.name !== from.name
			),
		placeholder,
		includeVault: true,
	})
	if (!picked) return false
	const target = resolveChoice(note, picked)
	const freshFrom = note.findTask(from.name)
	const freshTarget = note.findTask(target.name)
	if (!freshFrom || !freshTarget) return false
	note.moveLastClock(freshFrom, freshTarget)
	prompts.notify(
		`${NOTICE_ICON.move} Clock moved from ${noticeTask(from.name)} to ${noticeTask(target.name)}.`
	)
	return true
}

function sameTask(task: Task) {
	return (other: Task) => other.name === task.name
}
