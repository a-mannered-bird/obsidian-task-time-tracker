import { isRunning, TaskNote } from './note'
import {
	toggleTasks,
	type Prompts,
	type ToggleContext,
	type ToggleOptions,
} from './toggle'

/** How the runner reaches the note; the commands wire it to the vault. */
export type NoteIo = {
	read(): Promise<string>
	/**
	 * Write `next` only if the note still holds `expected`; false when it
	 * changed in the meantime (sync, another command) and nothing was written.
	 */
	replace(expected: string, next: string): Promise<boolean>
}

type Answer =
	| {
			kind: 'task'
			picked: { name: string; tags: string[]; running: boolean } | null
	  }
	| { kind: 'minutes'; minutes: number | null }

/** The note changed so much that the recorded answers no longer apply. */
class StaleAnswersError extends Error {}

const MAX_REDOS = 3

export const STALE_NOTICE =
	'The note changed while you were choosing and the action no longer applies. Nothing was written.'
export const BUSY_NOTICE =
	'The note kept changing while the action was written. Nothing was written, try again.'

/**
 * Run tracking steps on the note and write the result back. The user may sit
 * in a prompt for a while, so the note can change underneath (sync): the
 * write then never overwrites it. The steps are redone on the new content
 * with the answers already given, without prompting again.
 */
export async function applyTrackingSteps(
	io: NoteIo,
	steps: ToggleOptions[],
	createContext: (note: TaskNote) => ToggleContext
): Promise<void> {
	let base = await io.read()
	let note = new TaskNote(base)
	const context = createContext(note)
	const recorded: Answer[] = []
	const firstRun = { ...context, prompts: recording(context.prompts, recorded) }
	if (!(await runSteps(note, steps, firstRun))) return

	for (let redo = 0; redo <= MAX_REDOS; redo++) {
		if (await io.replace(base, note.toString())) return
		base = await io.read()
		note = new TaskNote(base)
		if (!(await redoSteps(note, steps, context, recorded))) {
			context.prompts.notify(STALE_NOTICE)
			return
		}
	}
	context.prompts.notify(BUSY_NOTICE)
}

async function runSteps(
	note: TaskNote,
	steps: ToggleOptions[],
	context: ToggleContext
): Promise<boolean> {
	let changed = false
	for (const options of steps) {
		changed = (await toggleTasks(note, options, context)) || changed
	}
	return changed
}

/** False when the answers do not lead to a change on this content. */
async function redoSteps(
	note: TaskNote,
	steps: ToggleOptions[],
	context: ToggleContext,
	recorded: Answer[]
): Promise<boolean> {
	const remaining = [...recorded]
	try {
		const prompts = replaying(note, remaining)
		const changed = await runSteps(note, steps, { ...context, prompts })
		return changed && remaining.length === 0
	} catch (error) {
		if (error instanceof StaleAnswersError) return false
		throw error
	}
}

function recording(prompts: Prompts, answers: Answer[]): Prompts {
	return {
		pickTask: async (tasks, placeholder, options) => {
			const task = await prompts.pickTask(tasks, placeholder, options)
			answers.push({
				kind: 'task',
				picked: task && {
					name: task.name,
					tags: task.tags,
					running: isRunning(task),
				},
			})
			return task
		},
		promptMinutes: async (options) => {
			const minutes = await prompts.promptMinutes(options)
			answers.push({ kind: 'minutes', minutes })
			return minutes
		},
		notify: (message) => prompts.notify(message),
	}
}

/**
 * Prompts answering from the recording, in order. Silent: the user already
 * read the notices of the first run.
 */
function replaying(note: TaskNote, remaining: Answer[]): Prompts {
	return {
		pickTask: () => {
			const answer = remaining.shift()
			if (answer?.kind !== 'task') throw new StaleAnswersError()
			if (!answer.picked) return Promise.resolve(null)
			const { name, tags, running } = answer.picked
			const task = note.findTask(name) ?? note.insertTask(name, tags)
			// Toggling would now do the opposite of what the user chose: the
			// task was started or stopped elsewhere in the meantime.
			if (isRunning(task) !== running) throw new StaleAnswersError()
			return Promise.resolve(task)
		},
		promptMinutes: () => {
			const answer = remaining.shift()
			if (answer?.kind !== 'minutes') throw new StaleAnswersError()
			return Promise.resolve(answer.minutes)
		},
		notify: () => {},
	}
}
