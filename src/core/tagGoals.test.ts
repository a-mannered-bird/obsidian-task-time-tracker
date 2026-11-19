import { describe, expect, it } from 'vitest'
import { formatTagGoal, parseTagGoal, readTagGoals } from './tagGoals'

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
