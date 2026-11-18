import { describe, expect, it } from 'vitest'
import { TaskNote } from './note'
import { taskChoice, type Prompts, type ToggleOptions } from './toggle'
import { applyTrackingSteps, STALE_NOTICE, type NoteIo } from './trackingRun'
import { plainNoticeText } from './noticeText'

const now = new Date(2026, 7, 16, 12, 0, 0)

/**
 * A note that other writers (`external`) can change at any time, e.g. from
 * inside a prompt, the way a sync does while the user is choosing.
 */
function fakeNote(lines: string[]) {
	let content = lines.join('\n')
	let prompted = 0
	const notices: string[] = []
	const timeTitles: string[] = []
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
	 * follows the note; otherwise from the version it was opened on. Time
	 * prompts take `times` in order, dismissed once they run out; `duringTime`
	 * runs inside each of them.
	 */
	const picking = (
		name: string,
		during?: () => void,
		{
			live = false,
			times = [] as string[],
			duringTime = undefined as (() => void) | undefined,
		} = {}
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
			return Promise.resolve(null)
		},
		promptTime: (request) => {
			prompted++
			timeTitles.push(request.title)
			duringTime?.()
			const time = times.shift()
			const parsed = time === undefined ? null : request.parse(time)
			return Promise.resolve(parsed && 'at' in parsed ? parsed.at : null)
		},
		notify: (message) => notices.push(plainNoticeText(message)),
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
		timeTitles,
	}
}

describe('applyTrackingSteps', () => {
	it('writes the toggle when the note did not change meanwhile', async () => {
		const note = fakeNote([
			'- [ ] Emails',
			'      [clock::2026-08-16T08:00:00--2026-08-16T08:30:00]',
			'- [ ] Walk the dog',
		])
		await note.run(note.picking('Walk the dog'))
		expect(note.lines()).toEqual([
			'- [ ] Emails',
			'      [clock::2026-08-16T08:00:00--2026-08-16T08:30:00]',
			'- [ ] Walk the dog',
			'      [clock::2026-08-16T12:00:00]',
		])
		expect(note.timeTitles).toEqual([])
	})

	it('asks when the day started with the first clock of the note, in the same write', async () => {
		const note = fakeNote(['- [ ] Emails', '- [ ] Walk the dog'])
		await note.run(note.picking('Emails', undefined, { times: ['07:30'] }))
		expect(note.lines()).toEqual([
			'---',
			'day_start: 2026-08-16T07:30:00',
			'---',
			'- [ ] Emails',
			'      [clock::2026-08-16T12:00:00]',
			'- [ ] Walk the dog',
		])
		expect(note.timeTitles).toEqual(['Start of day'])
	})

	it('writes nothing when the start of day is dismissed', async () => {
		const note = fakeNote(['- [ ] Emails'])
		await note.run(note.picking('Emails'))
		expect(note.lines()).toEqual(['- [ ] Emails'])
		expect(note.notices).toEqual([])
	})

	it('drops the start of day when the note got its first clock elsewhere while it was asked', async () => {
		const note = fakeNote(['- [ ] Emails', '- [ ] Walk the dog'])
		const synced = () =>
			note.external([
				'- [ ] Emails',
				'- [ ] Walk the dog',
				'      [clock::2026-08-16T08:00:00--2026-08-16T08:30:00]',
			])
		await note.run(
			note.picking('Emails', undefined, {
				times: ['07:30'],
				duringTime: synced,
			})
		)
		// The other device's write already started the day, without a start.
		expect(note.lines()).toEqual([
			'- [ ] Emails',
			'      [clock::2026-08-16T12:00:00]',
			'- [ ] Walk the dog',
			'      [clock::2026-08-16T08:00:00--2026-08-16T08:30:00]',
		])
		expect(note.prompted()).toBe(2)
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
			note.picking('Emails', () => note.external(['- [ ] Walk the dog']), {
				times: ['12:00'],
			})
		)
		expect(note.lines()).toEqual([
			'---',
			'day_start: 2026-08-16T12:00:00',
			'---',
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
			'⏹️ Stopped "Emails" (10m of 10m today) at 12:00.',
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
			note.picking('Emails', synced, { live: true, times: ['15'] }),
			[{ timeTravel: true }]
		)
		expect(note.lines()).toEqual([
			'- [ ] Emails',
			'      [clock::2026-08-16T11:45:00]',
			'- [ ] Walk the dog',
			'      [clock::2026-08-16T08:00:00--2026-08-16T08:30:00]',
		])
		// One pick, one time prompt: the restart replayed the pick.
		expect(note.prompted()).toBe(2)
	})
})
