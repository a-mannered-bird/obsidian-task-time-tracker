import { isRunning, TaskNote } from './note'
import {
	toggleTasks,
	type Prompts,
	type TaskChoice,
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
	| { kind: 'task'; picked: TaskChoice | null }
	| { kind: 'minutes'; minutes: number | null }
	| { kind: 'time'; at: Date | null }

/** The note changed so much that the recorded answers no longer apply. */
class StaleAnswersError extends Error {}

/** The note changed while the user was answering: start over on it. */
class NoteChangedError extends Error {}

const MAX_REDOS = 3

export const STALE_NOTICE =
	'The note changed while you were choosing and the action no longer applies. Nothing was written.'
export const BUSY_NOTICE =
	'The note kept changing while the action was written. Nothing was written, try again.'

/**
 * Run tracking steps on the note and write the result back. The user may sit
 * in a prompt for a while, so the note can change underneath (sync). The
 * pickers follow the note live, so an answer means what the user saw on the
 * newest content: when the note changed while a prompt was open, the run
 * starts over on the new content with the answers given so far, asking only
 * the prompts not answered yet. The write is compare-and-swap, redone the
 * same way when the note changes in between. Notices are held back until
 * the run ends, so the user only reads those of the run that counted.
 */
export async function applyTrackingSteps(
	io: NoteIo,
	steps: ToggleOptions[],
	context: ToggleContext
): Promise<void> {
	const notify = (message: string) => context.prompts.notify(message)
	const recorded: Answer[] = []
	let failedWrites = 0
	for (;;) {
		const base = await io.read()
		const note = new TaskNote(base)
		const replaying = recorded.length > 0
		const pass = passPrompts(
			context.prompts,
			recorded,
			async () => (await io.read()) !== base
		)
		let changed: boolean
		try {
			changed = await runSteps(note, steps, {
				...context,
				prompts: pass.prompts,
			})
		} catch (error) {
			if (error instanceof NoteChangedError) continue
			if (!(error instanceof StaleAnswersError)) throw error
			notify(STALE_NOTICE)
			return
		}
		if (pass.unusedAnswers() > 0) {
			notify(STALE_NOTICE)
			return
		}
		if (!changed) {
			pass.notices.forEach(notify)
			// Every recorded answer is a pick or a value, never a dismissal (a
			// dismissal ends the run), so a redo writing nothing went stale.
			if (replaying) notify(STALE_NOTICE)
			return
		}
		if (await io.replace(base, note.toString())) {
			pass.notices.forEach(notify)
			return
		}
		if (++failedWrites > MAX_REDOS) {
			notify(BUSY_NOTICE)
			return
		}
	}
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

/**
 * Prompts for one pass over the note: answers from the recording first, in
 * order, then the user's (recorded in turn). After each answer of the user,
 * `noteChanged` tells whether the pass must start over. Notices are
 * collected instead of shown.
 */
function passPrompts(
	live: Prompts,
	recorded: Answer[],
	noteChanged: () => Promise<boolean>
) {
	let cursor = 0
	const notices: string[] = []
	const replayed = (): Answer | undefined =>
		cursor < recorded.length ? recorded[cursor++] : undefined
	const record = async (answer: Answer, dismissed: boolean) => {
		recorded.push(answer)
		cursor++
		if (!dismissed && (await noteChanged())) throw new NoteChangedError()
	}
	const prompts: Prompts = {
		pickTask: async (note, request) => {
			const answer = replayed()
			if (answer) {
				if (answer.kind !== 'task') throw new StaleAnswersError()
				const { picked } = answer
				// Toggling would now do the opposite of what the user chose:
				// the task was started or stopped elsewhere in the meantime.
				if (picked && isRunningIn(note, picked.name) !== picked.running) {
					throw new StaleAnswersError()
				}
				return picked
			}
			const picked = await live.pickTask(note, request)
			await record({ kind: 'task', picked }, picked === null)
			return picked
		},
		promptMinutes: async (options) => {
			const answer = replayed()
			if (answer) {
				if (answer.kind !== 'minutes') throw new StaleAnswersError()
				return answer.minutes
			}
			const minutes = await live.promptMinutes(options)
			await record({ kind: 'minutes', minutes }, minutes === null)
			return minutes
		},
		promptTime: async (request) => {
			const answer = replayed()
			if (answer) {
				if (answer.kind !== 'time') throw new StaleAnswersError()
				return answer.at
			}
			const at = await live.promptTime(request)
			await record({ kind: 'time', at }, at === null)
			return at
		},
		notify: (message) => notices.push(message),
	}
	return { prompts, notices, unusedAnswers: () => recorded.length - cursor }
}

function isRunningIn(note: TaskNote, name: string): boolean {
	const task = note.findTask(name)
	return task ? isRunning(task) : false
}
