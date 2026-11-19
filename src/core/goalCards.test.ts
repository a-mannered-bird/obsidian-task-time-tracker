import { describe, expect, it } from 'vitest'
import {
	describeMissingResults,
	describeSuggestedTarget,
	dismissedOn,
	goalCards,
	goalSuggestions,
	groupGoalCards,
	missingResults,
	pruneDismissals,
} from './goalCards'
import { goalKeyId } from './goalEdits'
import { parseTasks } from './parser'

const now = new Date(2026, 7, 16, 12, 0, 0)

const tasks = parseTasks([
	'- [ ] Run #sport',
	'      [goal::1h]',
	'      [goal::distance 8/10 km]',
	'      [goal::speed /12 km/h]',
	'      [clock::2026-08-16T07:00:00--2026-08-16T07:50:00]',
	'- [ ] Anki',
	'      [goal::cards 210/200]',
	'- [ ] Social media',
	'      [goal::<30m]',
	'      [clock::2026-08-16T09:00:00--2026-08-16T09:20:00]',
	'- [ ] Snacks',
	'      [goal::cookies 3/<2]',
	'- [ ] Email',
])

describe('goalCards', () => {
	const cards = goalCards(tasks, now, false)
	const byTitle = new Map(cards.map((card) => [card.title, card]))

	it('makes one card per goal, a time goal measured by the clocks', () => {
		expect(cards.map((card) => card.title)).toEqual([
			'Run · time',
			'Run · distance',
			'Run · speed',
			'Anki · cards',
			'Social media · time',
			'Snacks · cookies',
		])
		expect(byTitle.get('Run · time')).toMatchObject({
			achieved: 50,
			target: 60,
			state: 'open',
		})
		expect(byTitle.get('Run · distance')?.progress).toBe(0.8)
		expect(byTitle.get('Run · speed')?.progress).toBe(0)
	})

	it('is done once reached, the ring capped at full', () => {
		expect(byTitle.get('Anki · cards')).toMatchObject({
			state: 'done',
			progress: 1,
		})
	})

	it('judges an "at most" goal over at once, done only once the day is over', () => {
		expect(byTitle.get('Snacks · cookies')?.state).toBe('over')
		expect(byTitle.get('Social media · time')?.state).toBe('open')
		const ended = goalCards(tasks, now, true)
		expect(ended.find((c) => c.title === 'Social media · time')?.state).toBe(
			'done'
		)
	})
})

describe('groupGoalCards', () => {
	it('keeps few cards together and groups many by task', () => {
		const few = goalCards(tasks.slice(0, 1), now, false)
		expect(groupGoalCards(few).map((g) => g.taskName)).toEqual([null])
		const many = goalCards(tasks, now, false)
		expect(
			groupGoalCards(many).map((g) => [g.taskName, g.cards.length])
		).toEqual([
			['Run', 3],
			['Anki', 1],
			['Social media', 1],
			['Snacks', 1],
		])
	})
})

describe('goalSuggestions', () => {
	const note = parseTasks([
		'- [ ] Run',
		'      [goal::1h]',
		'      [goal::distance 3 mi]',
		'- [ ] Anki',
		'- [ ] Email',
	])
	const recent = (name: string) =>
		name === 'Anki'
			? {
					date: new Date(2026, 7, 14),
					goals: parseTasks([
						'- [ ] Anki',
						'  [goal::cards 140/200]',
						'  [goal::reviews 20/50]',
					])[0]!.goals,
				}
			: name === 'Run'
				? {
						date: new Date(2026, 7, 15),
						goals: parseTasks([
							'- [ ] Run',
							'  [goal::45m]',
							'  [goal::distance 5/10 km]',
							'  [goal::speed /12 km/h]',
						])[0]!.goals,
					}
				: null

	it("offers each task's latest goals the note lacks, targets only", () => {
		const suggestions = goalSuggestions(note, recent, new Set())
		// Run already has a time goal and a distance (in another unit).
		expect(suggestions.map((s) => s.title)).toEqual([
			'Run · speed',
			'Anki · cards',
			'Anki · reviews',
		])
		expect(suggestions.map((s) => describeSuggestedTarget(s.goal))).toEqual([
			'/ 12 km/h',
			'/ 200',
			'/ 50',
		])
		expect(suggestions[1]?.from).toEqual(new Date(2026, 7, 14))
	})

	it('leaves out the dismissed ones', () => {
		const dismissed = new Set([
			goalKeyId({ taskName: 'Anki', metric: 'cards', unit: '' }),
		])
		expect(
			goalSuggestions(note, recent, dismissed).map((s) => s.title)
		).toEqual(['Run · speed', 'Anki · reviews'])
	})
})

describe('dismissals', () => {
	const dismissals = [
		{ day: '2026-08-16', taskName: 'Anki', metric: 'cards', unit: '' },
		{ day: '2026-08-08', taskName: 'Anki', metric: 'reviews', unit: '' },
		{ day: '2026-08-09', taskName: 'Run', metric: null, unit: '' },
	]

	it("lists the note's day only", () => {
		expect([...dismissedOn(dismissals, '2026-08-16')]).toEqual([
			goalKeyId({ taskName: 'Anki', metric: 'cards', unit: '' }),
		])
	})

	it('keeps them a week', () => {
		expect(pruneDismissals(dismissals, '2026-08-16').map((d) => d.day)).toEqual(
			['2026-08-16', '2026-08-09']
		)
	})
})

describe('missingResults', () => {
	it('lists the metric targets without a result', () => {
		const missing = missingResults(tasks)
		expect(missing).toEqual(['Run · speed'])
		expect(describeMissingResults(missing)).toBe('No result for: Run · speed.')
		expect(describeMissingResults([])).toBeNull()
	})
})
