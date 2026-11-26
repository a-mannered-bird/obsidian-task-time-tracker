import { type TFile } from 'obsidian'
import { describeNoteTaskRemoval } from 'core/confirmations'
import { extractTaskBlocks } from 'core/consolidate'
import type { DailyLog } from 'core/dailyLogs'
import {
	recordWrites,
	rewriteNote,
	type RewriteOutcome,
} from 'core/noteRewrite'
import { setNoteTaskTags } from 'core/rowTags'
import type { ClockTarget } from 'core/timeline'
import {
	defaultClockTimes,
	describeClockDay,
	parseClockTimes,
} from 'core/setClock'
import { moveTaskLine, removeTaskLine, type TaskMove } from 'core/tracker'
import { askingTime, type TaskChoice, type ToggleOptions } from 'core/toggle'
import { NOTICE_ICON, noticeTask } from 'core/noticeText'
import { BUSY_NOTICE, CLOCKS_CHANGED_NOTICE } from 'core/trackingRun'
import { describeStart, parseEndTime, parseStartTime } from 'core/typedTime'
import { confirmAction } from 'ui/ConfirmActionModal'
import { promptClock } from 'ui/SetClockModal'
import { showNotice } from 'ui/notice'
import { promptTime } from 'ui/timePrompt'
import { showUndoNotice } from 'ui/undoNotice'
import type TaskTimeTracker from '../main'
import { promptFirstDayStart } from './frontmatterTime'
import { addClockTo, retimeClockLine } from './timelineEdits'
import { noteIo, readNoteContent } from './target'
import { runTrackingSteps } from './tracking'
import { undoNoteWrite } from './undo'

/**
 * How the user started a task in the tracker tab: Start while nothing ran,
 * Switch (stopping what runs), alongside what runs, or alongside from when
 * the last task ended (the row menu).
 */
export type StartMode = 'start' | 'switch' | 'alongside' | 'fromLastEnd'

/**
 * Start the chosen task, added to the note when it is new. Start and
 * alongside only ever start it: something may have started elsewhere since
 * the tab showed nothing running, and the user did not ask to stop it.
 */
export function startTask(
	plugin: TaskTimeTracker,
	choice: TaskChoice,
	mode: StartMode
): Promise<void> {
	return runFromTab(plugin, [startStep(mode)], choice)
}

/** Start the chosen task like `startTask`, at a time asked first. */
export function startTaskAt(
	plugin: TaskTimeTracker,
	choice: TaskChoice,
	mode: Exclude<StartMode, 'fromLastEnd'>
): Promise<void> {
	return runFromTab(plugin, [askingTime(startStep(mode))], choice)
}

function startStep(mode: StartMode): ToggleOptions {
	return mode === 'switch'
		? { switch: true }
		: { targetState: 'on', fromLastTask: mode === 'fromLastEnd' }
}

/** Stop running tasks at one time; `done` also ticks them. */
export function stopTasks(
	plugin: TaskTimeTracker,
	names: string[],
	done: boolean
): Promise<void> {
	return runFromTab(plugin, [
		{ taskNames: names, targetState: 'off', tick: done },
	])
}

/** Start the interruption, or end it and say what it was. */
export function toggleInterruption(plugin: TaskTimeTracker): Promise<void> {
	return runFromTab(plugin, [{ switch: true, interruption: true }])
}

/**
 * End the interruption after a duration typed from its start, then say
 * what it was; the paused tasks resume at that time.
 */
export function setInterruptionDuration(
	plugin: TaskTimeTracker
): Promise<void> {
	return runFromTab(plugin, [
		{ switch: true, interruption: true, setDuration: true },
	])
}

/**
 * End the interruption at a typed time, then say what it was; the paused
 * tasks resume at that time.
 */
export function setInterruptionStop(plugin: TaskTimeTracker): Promise<void> {
	return runFromTab(plugin, [
		{ switch: true, interruption: true, timeTravel: true },
	])
}

/** Stop a running task at the moment the last stopped task ended. */
export function stopFromLastEnd(
	plugin: TaskTimeTracker,
	taskName: string
): Promise<void> {
	return runFromTab(plugin, [
		{ taskName, targetState: 'off', fromLastTask: true },
	])
}

/** Ask how long the running clock lasted and stop it there. */
export function setDuration(
	plugin: TaskTimeTracker,
	taskName: string
): Promise<void> {
	return runFromTab(plugin, [{ taskName, setDuration: true }])
}

/** Move the task's last clock (running or not) to a task picked next. */
export async function migrateLastClock(
	plugin: TaskTimeTracker,
	taskName: string
): Promise<void> {
	await runTrackingSteps(plugin, [
		{ taskName, migrate: true, placeholder: 'Which task to migrate to?' },
	])
}

/** Move the task's lines up or down among the tasks of its section. */
export async function moveTask(
	plugin: TaskTimeTracker,
	file: TFile,
	taskName: string,
	move: TaskMove
): Promise<void> {
	wrote(
		await rewriteNote(noteIo(plugin, file), (content) =>
			moveTaskLine(content, taskName, move)
		)
	)
}

/** Give the task's line in this note exactly these tags. */
export async function setTaskTags(
	plugin: TaskTimeTracker,
	file: TFile,
	taskName: string,
	tags: string[]
): Promise<void> {
	wrote(
		await rewriteNote(noteIo(plugin, file), (content) =>
			setNoteTaskTags(content, taskName, tags)
		)
	)
}

/**
 * Remove the task line and its clocks from this note only, after a
 * confirmation showing the lines, with Undo; the vault-wide deletion is in
 * Manage tasks.
 */
export async function deleteTaskFromNote(
	plugin: TaskTimeTracker,
	file: TFile,
	taskName: string,
	clocks: number
): Promise<void> {
	const content = await readNoteContent(plugin, file)
	const confirmed = await confirmAction(plugin.app, {
		title: `Delete "${taskName}"`,
		message: [describeNoteTaskRemoval(taskName, clocks)],
		diff: { before: extractTaskBlocks(content, taskName), after: [] },
		confirmText: 'Delete',
	})
	if (!confirmed) return
	const recorder = recordWrites(noteIo(plugin, file))
	wrote(
		await rewriteNote(recorder.io, (current) =>
			removeTaskLine(current, taskName)
		)
	)
	const write = recorder.written()
	if (write) {
		showUndoNotice(
			`${NOTICE_ICON.remove} Deleted ${noticeTask(taskName)} from this note.`,
			undoNoteWrite(noteIo(plugin, file), write)
		)
	}
}

/**
 * Run the steps from the tab. Never on a past day, where the tab only sets
 * clocks (`isPastDay`): the latest note tracks at now, even past midnight.
 */
function runFromTab(
	plugin: TaskTimeTracker,
	steps: ToggleOptions[],
	choice?: TaskChoice
): Promise<void> {
	return runTrackingSteps(plugin, steps, { choice })
}

/** Ask when a running clock really started and move its start there. */
export async function changeStart(
	plugin: TaskTimeTracker,
	file: TFile,
	taskName: string,
	start: Date
): Promise<void> {
	const at = await promptTime(plugin.app, {
		title: `Change when ${taskName} started`,
		description: describeStart(start, new Date()),
		verb: 'Starts',
		parse: (text, now) => parseStartTime(text, start, now),
		confirmText: 'Change',
	})
	if (!at) return
	await retimeClockLine(
		plugin,
		file,
		{ taskName, start, end: null },
		{ start: at, end: null }
	)
}

/** Ask when a running clock stopped and close it there. */
export async function setStop(
	plugin: TaskTimeTracker,
	file: TFile,
	taskName: string,
	start: Date
): Promise<void> {
	const at = await promptTime(plugin.app, {
		title: `When does "${taskName}" stop?`,
		description: describeStart(start, new Date()),
		verb: 'Stops',
		parse: (text, now) => parseEndTime(text, start, now),
		confirmText: 'Stop',
	})
	if (!at) return
	await retimeClockLine(
		plugin,
		file,
		{ taskName, start, end: null },
		{ start, end: at }
	)
}

/**
 * Ask for a clock's start and end on the note's day and give it to the
 * task, added to the note when new (Undo takes both back): how a past
 * day's tasks get their time, as nothing runs there. Dismissed, nothing
 * is written. The day's first clock then asks when the day started, when
 * the note does not say, as starting the first task does.
 */
export async function setClock(
	plugin: TaskTimeTracker,
	log: DailyLog,
	target: ClockTarget
): Promise<void> {
	const clocks =
		log.tasks.find((task) => task.name === target.name)?.clocks ?? []
	const times = await promptClock(plugin.app, {
		title: `Add a clock to "${target.name}"`,
		description: describeClockDay(log.date, new Date()),
		initial: defaultClockTimes(log.tasks, log.date, log.dayStart),
		parse: (start, end) => parseClockTimes(start, end, log.date, clocks),
	})
	if (!times || !(await addClockTo(plugin, log.file, target, times))) return
	const firstClock = log.tasks.every((task) => task.clocks.length === 0)
	if (firstClock && !log.dayStart) {
		const day = { date: log.date, path: log.file.path, file: log.file }
		await promptFirstDayStart(plugin, day, times.start)
	}
}

/** Tell about a write that did not happen; true when it did. */
function wrote(outcome: RewriteOutcome): boolean {
	if (outcome === 'gone') showNotice(CLOCKS_CHANGED_NOTICE)
	if (outcome === 'busy') showNotice(BUSY_NOTICE)
	return outcome === 'written'
}
