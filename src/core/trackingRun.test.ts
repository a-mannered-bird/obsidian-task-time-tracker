import { describe, expect, it } from 'vitest'
import { TaskNote } from './note'
import { taskChoice, type Prompts, type ToggleOptions } from './toggle'
import { applyTrackingSteps, STALE_NOTICE, type NoteIo } from './trackingRun'

const now = new Date(2026, 7, 16, 12, 0, 0)

/**
 * A note that other writers (`external`) can change at any time, e.g. from
 * inside a prompt, the way a sync does while the user is choosing.
 */
function fakeNote(lines: string[]) {
	let content = lines.join('\n')
	let prompted = 0
	const notices: string[] = []
	const io: NoteIo = {
		read: () => Promise.resolve(content),
		replace: (expected, next) => {
			if (content !== expected) return Promise.resolve(false)
			content = next
			return Promise.resolve(true)
		},
	}
	/**
	 * Prompts picking `name`, after letting `during` run. With `live`, the
	 * pick is made from the note as it is after `during`, the way the picker
	 * follows the note; otherwise from the version it was opened on.
	 */
	const picking = (
		name: string,
		during?: () => void,
		{ live = false, minutes = null as number | null } = {}
	): Prompts => ({
		pickTask: (note, request) => {
			prompted++
			during?.()
			const shown = live ? new TaskNote(content) : note
			const task = request.choices(shown).find((t) => t.name === name)
			return Promise.resolve(task ? taskChoice(task) : null)
		},
		promptMinutes: () => {
			prompted++
			return Promise.resolve(minutes)
		},
		notify: (message) => notices.push(message),
	})
	const run = (prompts: Prompts, steps: ToggleOptions[] = [{}]) =>
		applyTrackingSteps(io, steps, {
			prompts,
			now,
		})
	return {
		io,
		notices,
		picking,
		run,
		external: (next: string[]) => (content = next.join('\n')),
		lines: () => content.split('\n'),
		prompted: () => prompted,
	}
}

describe('applyTrackingSteps', () => {
	it('writes the toggle when the note did not change meanwhile', async () => {
		const note = fakeNote(['- [ ] Emails', '- [ ] Walk the dog'])
		await note.run(note.picking('Emails'))
		expect(note.lines()).toEqual([
			'- [ ] Emails',
			'      [clock::2026-08-16T12:00:00]',
			'- [ ] Walk the dog',
		])
	})

	it('redoes the toggle on the new content when the note changed during the prompt, without asking again', async () => {
		const note = fakeNote(['- [ ] Emails', '- [ ] Walk the dog'])
		const synced = () =>
			note.external([
				'- [ ] Emails',
				'- [ ] Walk the dog',
				'      [clock::2026-08-16T08:00:00--2026-08-16T08:30:00]',
			])
		await note.run(note.picking('Emails', synced))
		expect(note.lines()).toEqual([
			'- [ ] Emails',
			'      [clock::2026-08-16T12:00:00]',
			'- [ ] Walk the dog',
			'      [clock::2026-08-16T08:00:00--2026-08-16T08:30:00]',
		])
		expect(note.prompted()).toBe(1)
	})

	it('writes nothing when the picked task was started elsewhere meanwhile', async () => {
		const note = fakeNote(['- [ ] Emails'])
		const startedElsewhere = [
			'- [ ] Emails',
			'      [clock::2026-08-16T11:50:00]',
		]
		await note.run(
			note.picking('Emails', () => note.external(startedElsewhere))
		)
		// Redoing the toggle would stop the clock the other device started.
		expect(note.lines()).toEqual(startedElsewhere)
		expect(note.notices).toContain(STALE_NOTICE)
	})

	it('adds the picked task again when the new content lacks it', async () => {
		const note = fakeNote(['- [ ] Emails #work', '- [ ] Walk the dog'])
		await note.run(
			note.picking('Emails', () => note.external(['- [ ] Walk the dog']))
		)
		expect(note.lines()).toEqual([
			'- [ ] Walk the dog',
			'- [ ] Emails #work',
			'      [clock::2026-08-16T12:00:00]',
		])
	})

	it('leaves the note alone when the prompt is dismissed', async () => {
		const note = fakeNote(['- [ ] Emails'])
		await note.run(note.picking('No such task'))
		expect(note.lines()).toEqual(['- [ ] Emails'])
	})

	it('acts on the state the picker showed when the note changed while it was open', async () => {
		const note = fakeNote(['- [ ] Emails', '- [ ] Walk the dog'])
		const startedElsewhere = () =>
			note.external([
				'- [ ] Emails',
				'      [clock::2026-08-16T11:50:00]',
				'- [ ] Walk the dog',
			])
		await note.run(note.picking('Emails', startedElsewhere, { live: true }))
		// The picker showed Emails running, so picking it stops it.
		expect(note.lines()).toEqual([
			'- [ ] Emails',
			'      [clock::2026-08-16T11:50:00--2026-08-16T12:00:00]',
			'- [ ] Walk the dog',
		])
		expect(note.prompted()).toBe(1)
		expect(note.notices).toEqual([
			'☕️ "Emails" toggled off at 12:00:00 (10 / 10m).',
		])
	})

	it('keeps asking the prompts not answered yet after starting over on the new content', async () => {
		const note = fakeNote(['- [ ] Emails'])
		const synced = () =>
			note.external([
				'- [ ] Emails',
				'- [ ] Walk the dog',
				'      [clock::2026-08-16T08:00:00--2026-08-16T08:30:00]',
			])
		await note.run(
			note.picking('Emails', synced, { live: true, minutes: 15 }),
			[{ timeTravel: true }]
		)
		expect(note.lines()).toEqual([
			'- [ ] Emails',
			'      [clock::2026-08-16T11:45:00]',
			'- [ ] Walk the dog',
			'      [clock::2026-08-16T08:00:00--2026-08-16T08:30:00]',
		])
		// One pick, one minutes prompt: the restart replayed the pick.
		expect(note.prompted()).toBe(2)
	})
})
