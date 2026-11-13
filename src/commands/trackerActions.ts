import { Notice, type TFile } from 'obsidian'
import { describeNoteTaskRemoval, IRREVERSIBLE_NOTE } from 'core/confirmations'
import { extractTaskBlocks } from 'core/consolidate'
import { asksTrackingTime, type DailyTarget } from 'core/dailyNotes'
import {
	clockChanges,
	describeHandOff,
	moveHandOff,
	type HandOff,
} from 'core/handOff'
import { rewriteNote, type RewriteOutcome } from 'core/noteRewrite'
import { parseTasks } from 'core/parser'
import { setNoteTaskTags } from 'core/rowTags'
import { formatTimeOfDay } from 'core/timeline'
import { moveTaskLine, removeTaskLine, type TaskMove } from 'core/tracker'
import {
	askingTime,
	isToggleNotice,
	type TaskChoice,
	type ToggleOptions,
} from 'core/toggle'
import { BUSY_NOTICE } from 'core/trackingRun'
import { parseEndTime, parseStartTime, timeInputHelp } from 'core/typedTime'
import { confirmAction } from 'ui/ConfirmActionModal'
import { promptTime } from 'ui/timePrompt'
import { showActionNotice } from 'ui/undoNotice'
import type TaskTimeTracker from '../main'
import { retimeClockLine } from './timelineEdits'
import {
	currentTarget,
	NOTICE_DURATION,
	noteIo,
	readNoteContent,
	targetIo,
} from './target'
import { runTrackingSteps } from './tracking'

const GONE_NOTICE = 'The clocks changed elsewhere, nothing was written.'

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
	const step: ToggleOptions =
		mode === 'switch'
			? { switch: true }
			: { targetState: 'on', fromLastTask: mode === 'fromLastEnd' }
	return runWithHandOff(plugin, [step], choice)
}

/** Stop running tasks at one time; `done` also ticks them. */
export function stopTasks(
	plugin: TaskTimeTracker,
	names: string[],
	done: boolean
): Promise<void> {
	return runWithHandOff(plugin, [
		{ taskNames: names, targetState: 'off', tick: done },
	])
}

/** Start the interruption, or end it and say what it was. */
export function toggleInterruption(plugin: TaskTimeTracker): Promise<void> {
	return runTrackingSteps(
		plugin,
		trackingSteps(plugin, currentTarget(plugin), [
			{ switch: true, interruption: true },
		])
	)
}

/**
 * On a past note followed by a later one, now is the wrong time to track
 * at, so each step asks when it happened.
 */
function trackingSteps(
	plugin: TaskTimeTracker,
	target: DailyTarget,
	steps: ToggleOptions[]
): ToggleOptions[] {
	return asksTrackingTime(plugin.app, plugin.getDailyNotesConfig(), target)
		? steps.map(askingTime)
		: steps
}

/** Stop a running task at the moment the last stopped task ended. */
export function stopFromLastEnd(
	plugin: TaskTimeTracker,
	taskName: string
): Promise<void> {
	return runWithHandOff(plugin, [
		{ taskName, targetState: 'off', fromLastTask: true },
	])
}

/** Ask how long the running clock lasted and stop it there. */
export function setDuration(
	plugin: TaskTimeTracker,
	taskName: string
): Promise<void> {
	return runWithHandOff(plugin, [{ taskName, setDuration: true }])
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
 * confirmation showing the lines; the vault-wide deletion is in Manage tasks.
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
		message: [describeNoteTaskRemoval(taskName, clocks), IRREVERSIBLE_NOTE],
		diff: { before: extractTaskBlocks(content, taskName), after: [] },
		confirmText: 'Delete',
	})
	if (!confirmed) return
	wrote(
		await rewriteNote(noteIo(plugin, file), (current) =>
			removeTaskLine(current, taskName)
		)
	)
}

/**
 * Run the steps, then tell what they stopped and started in one notice
 * offering to change when it happened: the tab shows the clocks already,
 * so the engine's own "toggled" notices are left out.
 */
async function runWithHandOff(
	plugin: TaskTimeTracker,
	steps: ToggleOptions[],
	choice?: TaskChoice
): Promise<void> {
	const target = currentTarget(plugin)
	const io = targetIo(plugin, target)
	const before = parseTasks((await io.read()).split('\n'))
	const notices: string[] = []
	await runTrackingSteps(plugin, trackingSteps(plugin, target, steps), {
		choice,
		notify: (message) => notices.push(message),
	})
	for (const message of notices) {
		if (!isToggleNotice(message)) new Notice(message, NOTICE_DURATION)
	}
	const handOff = clockChanges(
		before,
		parseTasks((await io.read()).split('\n'))
	)
	const message = describeHandOff(handOff)
	if (message) {
		showActionNotice(message, 'Change', () => {
			void changeHandOff(plugin, target, handOff, message)
		})
	}
}

/** Ask when the hand-off really happened and move it there. */
async function changeHandOff(
	plugin: TaskTimeTracker,
	target: DailyTarget,
	handOff: HandOff,
	message: string
): Promise<void> {
	const latestStart = new Date(
		Math.max(...handOff.stopped.map((clock) => clock.start.valueOf()))
	)
	const at = await promptTime(plugin.app, {
		title: 'Change the time',
		description: `${message}. ${timeInputHelp()} A time of day before ${formatTimeOfDay(latestStart)} means the next day.`,
		parse: (text) => parseEndTime(text, latestStart, new Date()),
		confirmText: 'Change',
	})
	if (!at) return
	const outcome = await rewriteNote(targetIo(plugin, target), (content) =>
		moveHandOff(content, handOff, at)
	)
	if (wrote(outcome)) {
		const moved = moveTimes(handOff, at)
		new Notice(describeHandOff(moved) ?? message, NOTICE_DURATION)
	}
}

function moveTimes(handOff: HandOff, at: Date): HandOff {
	return {
		stopped: handOff.stopped.map((clock) => ({ ...clock, end: at })),
		started: handOff.started.map((clock) => ({ ...clock, start: at })),
	}
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
		description: `It started at ${formatTimeOfDay(start)} as far as the note knows. ${timeInputHelp()}`,
		parse: (text) => parseStartTime(text, start, new Date()),
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
		title: `Set when ${taskName} stopped`,
		description: `It started at ${formatTimeOfDay(start)}. ${timeInputHelp()} A time of day before the start means the next day.`,
		parse: (text) => parseEndTime(text, start, new Date()),
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

/** Tell about a write that did not happen; true when it did. */
function wrote(outcome: RewriteOutcome): boolean {
	if (outcome === 'gone') new Notice(GONE_NOTICE, NOTICE_DURATION)
	if (outcome === 'busy') new Notice(BUSY_NOTICE, NOTICE_DURATION)
	return outcome === 'written'
}
