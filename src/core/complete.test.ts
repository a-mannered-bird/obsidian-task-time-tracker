import { describe, expect, it } from 'vitest'
import {
	applyCompletion,
	goalTaskChoices,
	isEmptyPlan,
	planCompletion,
	withRemovals,
} from './complete'
import { TaskNote } from './note'

const content = [
	'# Tasks',
	'- [ ] Write plugin #project',
	'      [goal::2h]',
	'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
	'- [x] Walk the dog #routine',
	'      [clock::2026-08-16T08:00:00--2026-08-16T08:30:00]',
	'- [ ] Emails',
	'      [clock::2026-08-16T22:00:00]',
	'- [ ] Never started',
	'- [ ] Anki',
	'      [goal::cards 140/200]',
	'- [ ] Unassigned',
	'- [ ] Stretch',
	'      [goal::15]',
	'',
	'Some notes.',
].join('\n')

describe('planCompletion', () => {
	it('splits tasks into clocks to close, tasks to tick, to remove and with goals', () => {
		const plan = planCompletion(new TaskNote(content))
		expect(plan.toClose.map((t) => t.name)).toEqual(['Emails'])
		expect(plan.toTick.map((t) => t.name)).toEqual(['Write plugin', 'Emails'])
		expect(plan.toRemove.map((t) => t.name)).toEqual([
			'Never started',
			'Unassigned',
		])
		// A malformed goal line still counts: the user meant a goal.
		expect(plan.withGoals.map((t) => t.name)).toEqual(['Anki', 'Stretch'])
	})

	it('is empty for an already completed note', () => {
		const note = new TaskNote(
			[
				'- [x] Done',
				'      [goal::1h]',
				'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
			].join('\n')
		)
		expect(isEmptyPlan(planCompletion(note))).toBe(true)
	})

	it('is not empty while an unclocked task has goals', () => {
		const note = new TaskNote(['- [ ] Anki', '  [goal::cards /200]'].join('\n'))
		expect(isEmptyPlan(planCompletion(note))).toBe(false)
	})
})

describe('goalTaskChoices', () => {
	it('offers each task with goals, showing them', () => {
		expect(goalTaskChoices(planCompletion(new TaskNote(content)))).toEqual([
			{ value: 'Anki', label: 'Anki · cards 140/200' },
			{ value: 'Stretch', label: 'Stretch · 15' },
		])
	})
})

describe('applyCompletion', () => {
	const end = new Date(2026, 7, 16, 23, 30, 0)

	it('closes running clocks, ticks clocked tasks, removes the rest but tasks with goals', () => {
		const note = new TaskNote(content)
		applyCompletion(note, planCompletion(note), end)
		expect(note.toString()).toBe(
			[
				'# Tasks',
				'- [x] Write plugin #project',
				'      [goal::2h]',
				'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
				'- [x] Walk the dog #routine',
				'      [clock::2026-08-16T08:00:00--2026-08-16T08:30:00]',
				'- [x] Emails',
				'      [clock::2026-08-16T22:00:00--2026-08-16T23:30:00]',
				'- [ ] Anki',
				'      [goal::cards 140/200]',
				'- [ ] Stretch',
				'      [goal::15]',
				'',
				'Some notes.',
			].join('\n')
		)
	})

	it('removes the tasks with goals the user picked, with their goal lines', () => {
		const note = new TaskNote(content)
		const plan = withRemovals(planCompletion(note), ['Stretch'])
		expect(plan.withGoals.map((t) => t.name)).toEqual(['Anki'])
		applyCompletion(note, plan, end)
		expect(note.toString().split('\n').slice(8)).toEqual([
			'- [ ] Anki',
			'      [goal::cards 140/200]',
			'',
			'Some notes.',
		])
	})
})
