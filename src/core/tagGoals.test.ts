import { describe, expect, it } from 'vitest'
import { parseTasks } from './parser'
import {
	carryTagGoals,
	formatTagGoal,
	noteTagGoals,
	parseTagGoal,
	readTagGoals,
	removeTagGoal,
	setTagGoals,
	tagCoveredMinutes,
	updateTagGoal,
} from './tagGoals'

describe('parseTagGoal', () => {
	it('reads a tag and a time, < for at most', () => {
		expect(parseTagGoal('#work 6h')).toEqual({
			tag: '#work',
			minutes: 360,
			atMost: false,
		})
		expect(parseTagGoal('#leisure <1h30m')).toEqual({
			tag: '#leisure',
			minutes: 90,
			atMost: true,
		})
	})

	it.each(['work 6h', '#work', '#work 6', '#work #play 6h', '#work six hours'])(
		'refuses %j',
		(entry) => {
			expect(parseTagGoal(entry)).toBeNull()
		}
	)
})

describe('readTagGoals', () => {
	it('reads a list, skipping malformed entries and non-strings', () => {
		expect(readTagGoals(['#work 6h', 'oops', 42, '#leisure <2h'])).toEqual([
			{ tag: '#work', minutes: 360, atMost: false },
			{ tag: '#leisure', minutes: 120, atMost: true },
		])
	})

	it('takes a single string as a list of one, and nothing as none', () => {
		expect(readTagGoals('#work 6h')).toHaveLength(1)
		expect(readTagGoals(undefined)).toEqual([])
	})
})

describe('formatTagGoal', () => {
	it('writes an entry back as read', () => {
		const goal = parseTagGoal('#leisure <1h30m')
		expect(goal && formatTagGoal(goal)).toBe('#leisure <1h30m')
	})
})

const note = [
	'---',
	'tag_goals:',
	'  - "#work 6h"',
	'  - "#leisure <2h"',
	'  - "oops"',
	'---',
	'- [ ] Write #work',
	'      [clock::2026-08-16T09:00:00--2026-08-16T11:00:00]',
	'- [ ] Email #work #admin',
	'      [clock::2026-08-16T10:30:00--2026-08-16T11:30:00]',
	'- [ ] Guitar #leisure',
	'      [clock::2026-08-16T20:00:00]',
].join('\n')

describe('tag goal edits', () => {
	it('replaces the goal of a tag in place, keeping the other entries as written', () => {
		const next = setTagGoals(note, [
			{ tag: '#leisure', minutes: 90, atMost: true },
			{ tag: '#admin', minutes: 30, atMost: false },
		])
		expect(next.split('\n').slice(0, 7)).toEqual([
			'---',
			'tag_goals:',
			'  - "#work 6h"',
			'  - "#leisure <1h30m"',
			'  - "oops"',
			'  - "#admin 30m"',
			'---',
		])
	})

	it('updates and removes one tag goal; null once gone', () => {
		expect(
			updateTagGoal(note, '#work', (goal) => ({ ...goal, minutes: 300 }))
		).toContain('  - "#work 5h"')
		const removed = removeTagGoal(note, '#work')!
		expect(noteTagGoals(removed).map((goal) => goal.tag)).toEqual(['#leisure'])
		expect(removeTagGoal(removed, '#work')).toBeNull()
		expect(updateTagGoal(removed, '#work', (goal) => goal)).toBeNull()
	})
})

describe('tagCoveredMinutes', () => {
	it("unions the tag's tasks' clocks, a running one up to now", () => {
		const tasks = parseTasks(note.split('\n'))
		const now = new Date(2026, 7, 16, 20, 45)
		// 09:00–11:00 and 10:30–11:30 overlap: 2h30m covered, not 3h.
		expect(tagCoveredMinutes(tasks, '#work', now)).toBe(150)
		expect(tagCoveredMinutes(tasks, '#leisure', now)).toBe(45)
		expect(tagCoveredMinutes(tasks, '#none', now)).toBe(0)
	})
})

describe('carryTagGoals', () => {
	const recent = [{ tag: '#work', minutes: 360, atMost: false }]

	it("gives a new note the latest day's tag goals on the plugin's first write", () => {
		expect(
			carryTagGoals(
				'',
				'- [ ] Write\n      [clock::2026-08-17T09:00:00]',
				recent
			)
		).toBe(
			'---\ntag_goals:\n  - "#work 6h"\n---\n- [ ] Write\n      [clock::2026-08-17T09:00:00]'
		)
	})

	it('leaves a note that had tasks or tag goals, or still has no task', () => {
		const next = '- [ ] Write\n- [ ] Email'
		expect(carryTagGoals('- [ ] Write', next, recent)).toBe(next)
		expect(carryTagGoals('---\ntag_goals: []\n---\n', next, recent)).toBe(next)
		expect(carryTagGoals('# Monday', '# Monday\n', recent)).toBe('# Monday\n')
		expect(carryTagGoals('', next, [])).toBe(next)
	})
})
