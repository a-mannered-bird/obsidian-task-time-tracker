import { describe, expect, it } from 'vitest'
import {
	describeRing,
	describeSuggestedTarget,
	daySuggestions,
	dismissedOn,
	goalCards,
	goalSuggestions,
	groupGoalCards,
	missingResults,
	pruneDismissals,
	restoreDismissals,
	tagGoalCards,
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

	it('empties the ring of an "at most" goal as its limit is used', () => {
		// 20 of 30 minutes used: a third of the limit is left.
		expect(byTitle.get('Social media · time')?.progress).toBeCloseTo(1 / 3)
		expect(byTitle.get('Snacks · cookies')?.progress).toBe(0)
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

describe('describeRing', () => {
	const ringLabels = (dayOver: boolean) =>
		new Map(
			goalCards(tasks, now, dayOver).map((card) => [
				card.title,
				describeRing(card),
			])
		)

	it('tells the share reached, or the share of the limit left', () => {
		const open = ringLabels(false)
		expect(open.get('Run · distance')).toBe('80% of the target')
		expect(open.get('Anki · cards')).toBe('100% of the target, done')
		expect(open.get('Social media · time')).toBe('33% of the limit left')
		expect(open.get('Snacks · cookies')).toBe('Over the limit')
		expect(ringLabels(true).get('Social media · time')).toBe(
			'Stayed within the limit, done'
		)
	})
})

describe('groupGoalCards', () => {
	it('groups cards and suggestions by task, in note order', () => {
		const cards = goalCards(tasks, now, false)
		const suggestions = goalSuggestions(parseTasks(['- [ ] Email']), () => ({
			date: now,
			goals: tasks[0]!.goals,
		}))
		const names = tasks.map((task) => task.name)
		expect(
			groupGoalCards(names, cards, suggestions).map((g) => [
				g.taskName,
				g.cards.length,
				g.suggestions.length,
			])
		).toEqual([
			['Run', 3, 0],
			['Anki', 1, 0],
			['Social media', 1, 0],
			['Snacks', 1, 0],
			['Email', 0, 3],
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
		const suggestions = goalSuggestions(note, recent)
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
	})

	it("sets apart the ones rejected for the note's day", () => {
		const dismissals = [
			{ day: '2026-08-16', taskName: 'Anki', metric: 'cards', unit: '' },
			{ day: '2026-08-15', taskName: 'Run', metric: 'speed', unit: 'km/h' },
		]
		const { offered, rejected } = daySuggestions(
			note,
			recent,
			dismissals,
			'2026-08-16'
		)
		expect(offered.map((s) => s.title)).toEqual([
			'Run · speed',
			'Anki · reviews',
		])
		expect(rejected.map((s) => s.title)).toEqual(['Anki · cards'])
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

	it("brings back the day's rejections only", () => {
		expect(
			restoreDismissals(dismissals, '2026-08-16').map((d) => d.day)
		).toEqual(['2026-08-08', '2026-08-09'])
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
	})
})

describe('tag goals', () => {
	const dayTasks = parseTasks([
		'- [ ] Write #work',
		'      [clock::2026-08-16T08:00:00--2026-08-16T11:00:00]',
		'- [ ] Email #work',
		'      [clock::2026-08-16T10:00:00--2026-08-16T12:00:00]',
		'- [ ] Guitar #leisure',
		'      [clock::2026-08-16T20:00:00--2026-08-16T22:30:00]',
	])
	const tagGoals = [
		{ tag: '#work', minutes: 240, atMost: false },
		{ tag: '#leisure', minutes: 120, atMost: true },
	]

	it("makes a card per tag goal, measured by its tasks' covered time", () => {
		const cards = tagGoalCards(tagGoals, dayTasks, now, false)
		// 08:00–11:00 and 10:00–12:00 cover 4h: the 6h of clocks overlap.
		expect(
			cards.map((card) => [card.title, card.tag, card.achieved, card.state])
		).toEqual([
			['#work', '#work', 240, 'done'],
			['#leisure', '#leisure', 150, 'over'],
		])
	})

	it("suggests the latest day's tag goals the note lacks", () => {
		const { offered } = daySuggestions([], () => null, [], '2026-08-16', {
			note: [tagGoals[0]!],
			recent: [...tagGoals, { tag: '#admin', minutes: 30, atMost: false }],
		})
		expect(offered.map((s) => [s.title, s.tag])).toEqual([
			['#leisure', '#leisure'],
			['#admin', '#admin'],
		])
		expect(describeSuggestedTarget(offered[0]!.goal)).toBe('<2h')
	})
})
