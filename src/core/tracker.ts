import type { Task } from 'types/tasks'
import type { CompletionPlan } from './complete'
import { isRunning, TaskNote } from './note'
import {
	createEntryFromQuery,
	resurfacedEntry,
	type VaultPickerEntries,
} from './taskPicker'
import { getLastEndedTasks } from './toggle'
import type { VaultTaskInfo } from './vaultTaskIndex'

/** The tracker tab's sections, each in the note's order. */
export type TrackerLayout = {
	running: Task[]
	open: Task[]
	done: Task[]
	/** Folded, Done would leave a note holding only done tasks looking empty. */
	doneUnfolded: boolean
}

/**
 * The unassigned task is left without clocks once an interruption's time
 * went to the task it was: not something the user planned, so not listed.
 */
export function trackerLayout(
	tasks: Task[],
	unassignedTaskName: string
): TrackerLayout {
	const running = tasks.filter(isRunning)
	const idle = tasks.filter(
		(task) =>
			!isRunning(task) &&
			!(task.name === unassignedTaskName && task.clocks.length === 0)
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
 * The tasks a running interruption paused, which ending it restarts: the
 * ones stopped last, as the engine resumes them. Empty when no interruption
 * runs.
 */
export function pausedByInterruption(
	tasks: Task[],
	unassignedTaskName: string
): Task[] {
	const interruption = tasks.find(
		(task) => task.name === unassignedTaskName && isRunning(task)
	)
	return interruption ? getLastEndedTasks(tasks) : []
}

export type BarOption =
	| { kind: 'note'; task: Task }
	| { kind: 'vault'; info: VaultTaskInfo }
	| { kind: 'create'; name: string; tags: string[] }

/** The bar's suggestions, in the order they are shown and navigated. */
export type BarSuggestions = {
	today: BarOption[]
	other: BarOption[]
	create: BarOption | null
}

/** Scores a text against the typed query; null when it does not match. */
export type QueryMatch = (text: string) => { score: number } | null

/**
 * Suggestions for the typed text: the note's tasks, then the other notes'
 * (usage-first, at most `otherLimit`), each ranked by match score once
 * something is typed, then an offer to create the typed task when it names
 * none of them. `vault` is null while the index loads or when vault tasks
 * are off.
 */
export function barSuggestions(
	query: string,
	noteTasks: Task[],
	vault: VaultPickerEntries | null,
	match: QueryMatch,
	otherLimit: number
): BarSuggestions {
	const typed = query.trim() !== ''
	const noteNames = new Set(noteTasks.map((task) => task.name))
	const ranked = <T>(items: T[], text: (item: T) => string): T[] => {
		if (!typed) return items
		return items
			.map((item) => ({ item, result: match(text(item)) }))
			.filter((entry) => entry.result !== null)
			.sort((a, b) => (b.result?.score ?? 0) - (a.result?.score ?? 0))
			.map((entry) => entry.item)
	}

	const visible = (vault?.visible ?? []).filter(
		(info) => !noteNames.has(info.name)
	)
	const hidden = (vault?.hidden ?? []).filter(
		(info) => !noteNames.has(info.name)
	)
	const resurfaced = typed ? resurfacedEntry(query, hidden) : null
	const others = [
		...ranked(visible, (info) => info.name).slice(0, otherLimit),
		...(resurfaced ? [resurfaced] : []),
	]
	const created = typed
		? createEntryFromQuery(query, [
				...noteNames,
				...visible.map((info) => info.name),
				...hidden.map((info) => info.name),
			])
		: null

	return {
		today: ranked(noteTasks, (task) => task.name).map((task) => ({
			kind: 'note' as const,
			task,
		})),
		other: others.map((info) => ({ kind: 'vault' as const, info })),
		create: created ? { kind: 'create', ...created } : null,
	}
}

export function barOptions(suggestions: BarSuggestions): BarOption[] {
	const { today, other, create } = suggestions
	return create ? [...today, ...other, create] : [...today, ...other]
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
