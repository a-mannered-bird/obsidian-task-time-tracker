import { describe, expect, it } from 'vitest'
import { applyCompletion, isEmptyPlan, planCompletion } from './complete'
import { TaskNote } from './note'

const content = [
	'# Tasks',
	'- [ ] Write plugin #project',
	'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
	'- [x] Walk the dog #routine',
	'      [clock::2026-08-16T08:00:00--2026-08-16T08:30:00]',
	'- [ ] Emails',
	'      [clock::2026-08-16T22:00:00]',
	'- [ ] Never started',
	'- [ ] Unassigned',
	'',
	'Some notes.',
].join('\n')

describe('planCompletion', () => {
	it('splits tasks into clocks to close, tasks to tick and tasks to remove', () => {
		const plan = planCompletion(new TaskNote(content))
		expect(plan.toClose.map((t) => t.name)).toEqual(['Emails'])
		expect(plan.toTick.map((t) => t.name)).toEqual(['Write plugin', 'Emails'])
		expect(plan.toRemove.map((t) => t.name)).toEqual([
			'Never started',
			'Unassigned',
		])
	})

	it('is empty for an already completed note', () => {
		const note = new TaskNote(
			[
				'- [x] Done',
				'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
			].join('\n')
		)
		expect(isEmptyPlan(planCompletion(note))).toBe(true)
	})
})

describe('applyCompletion', () => {
	it('closes running clocks at the given time, ticks clocked tasks, removes the rest', () => {
		const note = new TaskNote(content)
		applyCompletion(
			note,
			planCompletion(note),
			new Date(2026, 7, 16, 23, 30, 0)
		)
		expect(note.toString()).toBe(
			[
				'# Tasks',
				'- [x] Write plugin #project',
				'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
				'- [x] Walk the dog #routine',
				'      [clock::2026-08-16T08:00:00--2026-08-16T08:30:00]',
				'- [x] Emails',
				'      [clock::2026-08-16T22:00:00--2026-08-16T23:30:00]',
				'',
				'Some notes.',
			].join('\n')
		)
	})
})
