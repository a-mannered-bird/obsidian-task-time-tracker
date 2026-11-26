import { describe, expect, it } from 'vitest'
import {
	cardsReached,
	crossingSound,
	goalStates,
	noteGoalCards,
} from './goalCrossings'
import { parseTasks } from './parser'
import { readTagGoals } from './tagGoals'

const date = new Date(2026, 7, 16)
const at = (hours: number, minutes = 0) =>
	new Date(2026, 7, 16, hours, minutes, 0)

function note(
	lines: string[],
	tagGoals: string[] = [],
	dayEnd: Date | null = null
) {
	return {
		date,
		dayEnd,
		tasks: parseTasks(lines),
		tagGoals: readTagGoals(tagGoals),
	}
}

const running = note(
	[
		'- [ ] Write #work',
		'      [goal::1h]',
		'      [clock::2026-08-16T09:00:00]',
		'- [ ] Social media',
		'      [goal::<30m]',
		'      [clock::2026-08-16T09:30:00]',
	],
	['#work 1h30m']
)

describe('crossingSound', () => {
	it('plays the success sound when a running clock reaches a time goal', () => {
		const before = goalStates(noteGoalCards(running, at(9, 59)))
		expect(crossingSound(before, noteGoalCards(running, at(10, 0)))).toBe(
			'reached'
		)
	})

	it('plays nothing on the next tick once goals are done or over', () => {
		const before = goalStates(noteGoalCards(running, at(10, 5)))
		expect(crossingSound(before, noteGoalCards(running, at(10, 6)))).toBe(null)
	})

	it('reaches a tag goal through the covered time of its tasks', () => {
		const tagOnly = note(
			['- [ ] Write #work', '      [clock::2026-08-16T09:00:00]'],
			['#work 1h30m']
		)
		const before = goalStates(noteGoalCards(tagOnly, at(10, 29)))
		expect(crossingSound(before, noteGoalCards(tagOnly, at(10, 30)))).toBe(
			'reached'
		)
	})

	it('warns the moment an "at most" goal goes over its limit', () => {
		// Social media's clock started at 09:30: 30 minutes at 10:00, over at 10:01.
		const before = goalStates(noteGoalCards(running, at(10, 0)))
		expect(crossingSound(before, noteGoalCards(running, at(10, 1)))).toBe(
			'over'
		)
	})

	it('lets the warning win when a goal is reached in the same change', () => {
		const before = goalStates(noteGoalCards(running, at(9, 59)))
		expect(crossingSound(before, noteGoalCards(running, at(10, 1)))).toBe(
			'over'
		)
	})

	it('plays the success sound when a metric result reaches its target', () => {
		const before = goalStates(
			noteGoalCards(
				note(['- [ ] Run', '      [goal::distance 8/10 km]']),
				at(12)
			)
		)
		const after = noteGoalCards(
			note(['- [ ] Run', '      [goal::distance 10/10 km]']),
			at(12)
		)
		expect(crossingSound(before, after)).toBe('reached')
	})

	it('plays the success sound when ending the day under an "at most" limit', () => {
		const lines = ['- [x] Snacks', '      [goal::cookies 1/<2]']
		const before = goalStates(noteGoalCards(note(lines), at(20)))
		const after = noteGoalCards(note(lines, [], at(22)), at(22))
		expect(crossingSound(before, after)).toBe('reached')
	})

	it('plays nothing when an "at most" limit is raised above the result', () => {
		const ended = at(22)
		const before = goalStates(
			noteGoalCards(
				note(['- [x] Snacks', '      [goal::cookies 3/<2]'], [], ended),
				ended
			)
		)
		const after = noteGoalCards(
			note(['- [x] Snacks', '      [goal::cookies 3/<4]'], [], ended),
			ended
		)
		expect(crossingSound(before, after)).toBe(null)
	})

	it('plays again after a goal fell back under its target and crossed anew', () => {
		const reached = noteGoalCards(
			note(['- [ ] Run', '      [goal::distance 10/10 km]']),
			at(12)
		)
		const lowered = noteGoalCards(
			note(['- [ ] Run', '      [goal::distance 9/10 km]']),
			at(12)
		)
		expect(crossingSound(goalStates(lowered), reached)).toBe('reached')
	})
})

describe('cardsReached', () => {
	it('counts a goal added already reached, but not one already done before', () => {
		const before = goalStates(
			noteGoalCards(note(['- [ ] Anki', '      [goal::cards 210/200]']), at(12))
		)
		const after = noteGoalCards(
			note([
				'- [ ] Anki',
				'      [goal::cards 210/200]',
				'      [goal::reviews 50/40]',
			]),
			at(12)
		)
		expect(cardsReached(before, after)).toEqual([after[1]?.id])
	})
})
