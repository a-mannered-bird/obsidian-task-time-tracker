import { describe, expect, it } from 'vitest'
import { defaultGoalColor, goalCards } from './goalCards'
import {
	cardColor,
	cardEmoji,
	describeGoalBar,
	doneBadgeOf,
	goalBars,
	goalColor,
	goalEmoji,
	goalStreak,
	metricRuleOf,
	ownGoalBadge,
	parseStampTexts,
	stampText,
	tagGoalStreak,
} from './goalStyle'
import { parseTasks } from './parser'
import { readTagGoals } from './tagGoals'

const now = new Date(2026, 7, 16, 12, 0, 0)

const [run] = parseTasks([
	'- [ ] Run',
	'      [goal::1h]',
	'      [goal::distance 8/10 km]',
	'      [goal::speed /12 km/h]',
	'      [goal::weight 81,4/<80 kg]',
	'      [clock::2026-08-16T07:00:00--2026-08-16T07:50:00]',
])
const cards = goalCards([run!], now, false)

describe('metric settings', () => {
	const settings = { distance: { color: '#ff0000', emoji: '🏃' } }

	it('uses the color and emoji set for a metric, else the defaults', () => {
		const [time, distance, speed] = cards.map((card) => card.goal)
		expect(goalColor(distance!, settings)).toBe('#ff0000')
		expect(goalEmoji(distance!, settings)).toBe('🏃')
		expect(goalColor(speed!, settings)).toBe(defaultGoalColor(speed!))
		expect(goalEmoji(speed!, settings)).toBe('🎯')
		expect(goalEmoji(time!, { time: { emoji: '⌛' } })).toBe('⌛')
	})

	it('adds up with the rule set, else by unit', () => {
		const ruleOf = metricRuleOf({ weight: { rule: 'last' } })
		expect(ruleOf('weight', 'kg')).toBe('last')
		expect(ruleOf('speed', 'km/h')).toBe('average')
		expect(ruleOf('distance', 'km')).toBe('sum')
	})
})

describe('stamp texts', () => {
	it('reads one text per line, blank lines ignored', () => {
		expect(parseStampTexts(' Done\n\nNailed it \n')).toEqual([
			'Done',
			'Nailed it',
		])
	})

	it('keeps the same text for a card all day', () => {
		const texts = ['A', 'B', 'C', 'D', 'E']
		const picked = stampText(texts, '2026-08-16', 'run')
		expect(stampText(texts, '2026-08-16', 'run')).toBe(picked)
		expect(texts).toContain(picked)
		expect(stampText([], '2026-08-16', 'run')).toBeNull()
	})
})

describe('done badges', () => {
	const pages = { taskName: 'Read', metric: 'pages', unit: '' }
	const time = { taskName: 'Read', metric: null, unit: '' }

	it("finds a goal's own badge, by task and metric", () => {
		const goalBadges = [{ key: pages, badge: 'trophy' as const }]
		expect(ownGoalBadge(goalBadges, pages)).toBe('trophy')
		expect(ownGoalBadge(goalBadges, time)).toBeNull()
	})

	it('picks a random badge, the same all day for a goal', () => {
		const picked = doneBadgeOf('random', '2026-08-16', 'run', ['Done'])
		expect(doneBadgeOf('random', '2026-08-16', 'run', ['Done'])).toBe(picked)
		expect(picked).not.toBe('none')
		const days = ['2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19']
		const goals = ['run', 'read', 'swim', 'anki', 'walk']
		const all = new Set(
			days.flatMap((day) =>
				goals.map((goal) => doneBadgeOf('random', day, goal, ['Done']))
			)
		)
		expect(all.size).toBeGreaterThan(2)
	})

	it('never picks the rubber stamp at random without texts', () => {
		const days = Array.from({ length: 30 }, (_, i) => `2026-08-${i + 1}`)
		const picks = days.map((day) => doneBadgeOf('random', day, 'run', []))
		expect(picks.includes('stamp')).toBe(false)
	})

	it('shows a chosen badge as is', () => {
		expect(doneBadgeOf('none', '2026-08-16', 'run', [])).toBe('none')
		expect(doneBadgeOf('flame', '2026-08-16', 'run', [])).toBe('flame')
	})
})

describe('goalStreak', () => {
	const day = (date: number, lines: string[]) => ({
		date: new Date(2026, 7, date),
		task: parseTasks(['- [ ] Anki', ...lines])[0]!,
	})
	const key = { taskName: 'Anki', metric: 'cards', unit: '' }

	it('counts the days in a row the goal was met, back from the day', () => {
		const occurrences = [
			day(12, ['  [goal::cards 200/200]']),
			day(13, ['  [goal::cards 100/200]']),
			day(14, ['  [goal::cards 210/200]']),
			day(15, ['  [goal::cards 200/200]']),
			day(16, ['  [goal::cards 250/200]']),
		]
		expect(goalStreak(occurrences, key, new Date(2026, 7, 16))).toBe(3)
		expect(goalStreak(occurrences, key, new Date(2026, 7, 13))).toBe(0)
	})

	it('stops at a day without the task or without the goal', () => {
		const occurrences = [
			day(13, ['  [goal::cards 200/200]']),
			day(15, ['  [goal::cards 200/200]']),
			day(16, ['  [goal::cards 200/200]']),
		]
		expect(goalStreak(occurrences, key, new Date(2026, 7, 16))).toBe(2)
		expect(
			goalStreak([day(16, ['  [goal::1h]'])], key, new Date(2026, 7, 16))
		).toBe(0)
	})

	it("skips the days without the goal when it is the goal's setting", () => {
		const occurrences = [
			day(10, ['  [goal::cards 100/200]']),
			day(12, ['  [goal::cards 200/200]']),
			day(13, ['  [goal::1h]']),
			day(15, ['  [goal::cards 200/200]']),
			day(16, ['  [goal::cards 200/200]']),
		]
		const at = new Date(2026, 7, 16)
		expect(goalStreak(occurrences, key, at, true)).toBe(3)
		expect(goalStreak(occurrences, key, at, false)).toBe(2)
	})
})

describe('tracker bars', () => {
	it('shows three bars and folds the rest', () => {
		const bars = goalBars(cards)
		expect(bars.shown.map((card) => card.title)).toEqual([
			'Run · time',
			'Run · distance',
			'Run · speed',
		])
		expect(bars.folded.map((card) => card.title)).toEqual(['Run · weight'])
	})

	it('describes each bar with its numbers', () => {
		expect(cards.map((card) => describeGoalBar(card, '•'))).toEqual([
			'• time · 50m / 1h · 83%',
			'• distance · 8 / 10 km · 80%',
			'• speed · 0 / 12 km/h · 0%',
			'• weight · 81,4 / <80 kg · over the limit',
		])
	})
})

describe('tagGoalStreak', () => {
	const note = (date: number, minutes: number, goal = '#work 2h') => ({
		date: new Date(2026, 7, date),
		tasks: parseTasks([
			'- [ ] Write #work',
			`      [clock::2026-08-${date}T08:00:00--2026-08-${date}T${String(8 + Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00]`,
		]),
		tagGoals: readTagGoals([goal]),
	})

	it("counts the days in a row the tag's covered time met its goal", () => {
		const notes = [note(13, 60), note(14, 120), note(15, 180), note(16, 120)]
		expect(tagGoalStreak(notes, '#work', new Date(2026, 7, 16))).toBe(3)
		expect(tagGoalStreak(notes, '#admin', new Date(2026, 7, 16))).toBe(0)
	})

	it('skips the days without the tag goal when asked', () => {
		const notes = [note(13, 120), note(14, 120, '#admin 1h'), note(15, 120)]
		const day = new Date(2026, 7, 15)
		expect(tagGoalStreak(notes, '#work', day)).toBe(1)
		expect(tagGoalStreak(notes, '#work', day, true)).toBe(2)
	})
})

describe('tag goal cards', () => {
	const mappings = [{ tag: '#work', emoji: '💼', color: '#123456' }]
	const time = { kind: 'time' as const, minutes: 60, atMost: false }

	it("take their tag's color and emoji, else the time goal's", () => {
		expect(cardColor({ goal: time, tag: '#work' }, {}, mappings)).toBe(
			'#123456'
		)
		expect(cardEmoji({ goal: time, tag: '#work' }, {}, mappings)).toBe('💼')
		expect(cardColor({ goal: time, tag: '#home' }, {}, mappings)).toBe(
			defaultGoalColor(time)
		)
		expect(cardEmoji({ goal: time, tag: '#home' }, {}, mappings)).toBe('⏱')
	})

	it("leave a task's goals to their metric settings", () => {
		expect(
			cardColor({ goal: time, tag: null }, { time: { color: 'red' } }, mappings)
		).toBe('red')
	})
})
