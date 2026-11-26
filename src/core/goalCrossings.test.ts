import { describe, expect, it } from 'vitest'
import type { GoalCard } from './goalCards'
import {
	cardsReached,
	crossingSound,
	describeCrossing,
	goalCrossings,
	goalStates,
	noteGoalCards,
} from './goalCrossings'
import { plainNoticeText } from './noticeText'
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

function soundOf(before: GoalCard[], after: GoalCard[]) {
	return crossingSound(goalCrossings(goalStates(before), after))
}

function noticesOf(before: GoalCard[], after: GoalCard[]) {
	return goalCrossings(goalStates(before), after).map((crossing) =>
		plainNoticeText(describeCrossing(crossing))
	)
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

describe('goalCrossings', () => {
	it('plays the success sound when a running clock reaches a time goal', () => {
		const before = noteGoalCards(running, at(9, 59))
		const after = noteGoalCards(running, at(10, 0))
		expect(soundOf(before, after)).toBe('reached')
		expect(noticesOf(before, after)).toEqual(['🎯 Goal reached: "Write" · 1h.'])
	})

	it('plays nothing on the next tick once goals are done or over', () => {
		expect(
			soundOf(
				noteGoalCards(running, at(10, 5)),
				noteGoalCards(running, at(10, 6))
			)
		).toBe(null)
	})

	it('reaches a tag goal through the covered time of its tasks', () => {
		const tagOnly = note(
			['- [ ] Write #work', '      [clock::2026-08-16T09:00:00]'],
			['#work 1h30m']
		)
		const before = noteGoalCards(tagOnly, at(10, 29))
		const after = noteGoalCards(tagOnly, at(10, 30))
		expect(soundOf(before, after)).toBe('reached')
		expect(noticesOf(before, after)).toEqual([
			'🎯 Goal reached: #work · 1h30m.',
		])
	})

	it('warns the moment an "at most" goal goes over its limit', () => {
		// Social media's clock started at 09:30: 30 minutes at 10:00, over at 10:01.
		const before = noteGoalCards(running, at(10, 0))
		const after = noteGoalCards(running, at(10, 1))
		expect(soundOf(before, after)).toBe('over')
		expect(noticesOf(before, after)).toEqual([
			'⚠️ Over the limit: "Social media" · 31m for at most 30m.',
		])
	})

	it('lets the warning win when a goal is reached in the same change, naming both', () => {
		const before = noteGoalCards(running, at(9, 59))
		const after = noteGoalCards(running, at(10, 1))
		expect(soundOf(before, after)).toBe('over')
		expect(noticesOf(before, after)).toEqual([
			'⚠️ Over the limit: "Social media" · 31m for at most 30m.',
			'🎯 Goal reached: "Write" · 1h.',
		])
	})

	it('plays the success sound when a metric result reaches its target', () => {
		const before = noteGoalCards(
			note(['- [ ] Run', '      [goal::distance 8/10 km]']),
			at(12)
		)
		const after = noteGoalCards(
			note(['- [ ] Run', '      [goal::distance 10/10 km]']),
			at(12)
		)
		expect(soundOf(before, after)).toBe('reached')
		expect(noticesOf(before, after)).toEqual([
			'🎯 Goal reached: "Run" · distance 10/10 km.',
		])
	})

	it('warns when a metric result goes over an "at most" target', () => {
		const before = noteGoalCards(
			note(['- [ ] Snacks', '      [goal::cookies 2/<2]']),
			at(12)
		)
		const after = noteGoalCards(
			note(['- [ ] Snacks', '      [goal::cookies 3/<2]']),
			at(12)
		)
		expect(noticesOf(before, after)).toEqual([
			'⚠️ Over the limit: "Snacks" · cookies 3/<2.',
		])
	})

	it('plays the success sound when ending the day under an "at most" limit', () => {
		const lines = ['- [x] Snacks', '      [goal::cookies 1/<2]']
		expect(
			soundOf(
				noteGoalCards(note(lines), at(20)),
				noteGoalCards(note(lines, [], at(22)), at(22))
			)
		).toBe('reached')
	})

	it('plays nothing when an "at most" limit is raised above the result', () => {
		const ended = at(22)
		const before = noteGoalCards(
			note(['- [x] Snacks', '      [goal::cookies 3/<2]'], [], ended),
			ended
		)
		const after = noteGoalCards(
			note(['- [x] Snacks', '      [goal::cookies 3/<4]'], [], ended),
			ended
		)
		expect(soundOf(before, after)).toBe(null)
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
		expect(soundOf(lowered, reached)).toBe('reached')
	})
})

describe('cardsReached', () => {
	it('counts a goal added already reached, but not one already done before', () => {
		const before = noteGoalCards(
			note(['- [ ] Anki', '      [goal::cards 210/200]']),
			at(12)
		)
		const after = noteGoalCards(
			note([
				'- [ ] Anki',
				'      [goal::cards 210/200]',
				'      [goal::reviews 50/40]',
			]),
			at(12)
		)
		expect(cardsReached(goalStates(before), after)).toEqual([after[1]?.id])
	})
})
