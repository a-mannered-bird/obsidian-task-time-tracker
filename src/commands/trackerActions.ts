import { Notice, type TFile } from 'obsidian'
import type { DailyTarget } from 'core/dailyNotes'
import {
	clockChanges,
	describeHandOff,
	moveHandOff,
	type HandOff,
} from 'core/handOff'
import { rewriteNote, type RewriteOutcome } from 'core/noteRewrite'
import { parseTasks } from 'core/parser'
import { formatTimeOfDay } from 'core/timeline'
import {
	isToggleNotice,
	type TaskChoice,
	type ToggleOptions,
} from 'core/toggle'
import { addTaskLine } from 'core/tracker'
import { BUSY_NOTICE } from 'core/trackingRun'
import { parseEndTime, parseStartTime, type TypedTime } from 'core/typedTime'
import { promptText } from 'ui/TextPromptModal'
import { showActionNotice } from 'ui/undoNotice'
import type TaskTimeTracker from '../main'
import { retimeClockLine } from './timelineEdits'
import { currentTarget, NOTICE_DURATION, targetIo } from './target'
import { runTrackingSteps } from './tracking'

const GONE_NOTICE = 'The clocks changed elsewhere, nothing was written.'

/**
 * How the user started a task in the tracker tab: Start while nothing ran,
 * Switch (stopping what runs) or alongside what runs.
 */
export type StartMode = 'start' | 'switch' | 'alongside'

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
		mode === 'switch' ? { switch: true } : { targetState: 'on' }
	return runWithHandOff(plugin, [step], choice)
}

/** Stop running tasks; `done` also ticks them. */
export function stopTasks(
	plugin: TaskTimeTracker,
	names: string[],
	done: boolean
): Promise<void> {
	return runWithHandOff(
		plugin,
		names.map((taskName) => ({ taskName, targetState: 'off', tick: done }))
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
	await runTrackingSteps(plugin, steps, {
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
	const at = await promptTime(plugin, {
		title: 'Change the time',
		description: `${message}. When did it happen? A time before ${formatTimeOfDay(latestStart)} means the next day.`,
		parse: (text) => parseEndTime(text, latestStart, new Date()),
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
	const at = await promptTime(plugin, {
		title: `Change when ${taskName} started`,
		description: `It started at ${formatTimeOfDay(start)} as far as the note knows.`,
		parse: (text) => parseStartTime(text, start, new Date()),
	})
	if (!at) return
	await retimeClockLine(
		plugin,
		file,
		{ taskName, start, end: null },
		{ start: at, end: null }
	)
}

async function promptTime(
	plugin: TaskTimeTracker,
	options: {
		title: string
		description: string
		parse: (text: string) => TypedTime
	}
): Promise<Date | null> {
	const value = await promptText(plugin.app, {
		title: options.title,
		description: options.description,
		label: 'Time',
		placeholder: 'HH:MM',
		confirmText: 'Change',
		validate: (text) => {
			const parsed = options.parse(text)
			return 'error' in parsed ? parsed.error : null
		},
	})
	if (value === null) return null
	const parsed = options.parse(value)
	return 'at' in parsed ? parsed.at : null
}

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
	wrote(outcome)
}

/** Tell about a write that did not happen; true when it did. */
function wrote(outcome: RewriteOutcome): boolean {
	if (outcome === 'gone') new Notice(GONE_NOTICE, NOTICE_DURATION)
	if (outcome === 'busy') new Notice(BUSY_NOTICE, NOTICE_DURATION)
	return outcome === 'written'
}
