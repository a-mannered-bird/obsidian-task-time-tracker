import { describe, expect, it } from 'vitest'
import { clockChanges, describeHandOff, moveHandOff } from './handOff'
import { parseTasks } from './parser'

const at = (h: number, m: number) => new Date(2026, 10, 12, h, m)

const running = [
	'- [ ] Chores',
	'      [clock::2026-11-12T09:00:00--2026-11-12T09:30:00]',
	'      [clock::2026-11-12T10:00:00]',
	'- [ ] Email',
]

const switched = [
	'- [ ] Chores',
	'      [clock::2026-11-12T09:00:00--2026-11-12T09:30:00]',
	'      [clock::2026-11-12T10:00:00--2026-11-12T10:42:00]',
	'- [ ] Email',
	'      [clock::2026-11-12T10:42:00]',
]

describe('clockChanges', () => {
	it('finds the clock a switch stopped and the one it started', () => {
		expect(clockChanges(parseTasks(running), parseTasks(switched))).toEqual({
			stopped: [{ taskName: 'Chores', start: at(10, 0), end: at(10, 42) }],
			started: [{ taskName: 'Email', start: at(10, 42), end: null }],
		})
	})

	it('finds nothing when no clock changed state', () => {
		expect(clockChanges(parseTasks(running), parseTasks(running))).toEqual({
			stopped: [],
			started: [],
		})
	})
})

describe('describeHandOff', () => {
	it('names a switch and a stop', () => {
		const handOff = clockChanges(parseTasks(running), parseTasks(switched))
		expect(describeHandOff(handOff)).toBe(
			'Switched from Chores to Email at 10:42'
		)
		expect(describeHandOff({ ...handOff, started: [] })).toBe(
			'Stopped Chores at 10:42'
		)
	})

	it('has nothing to say when nothing stopped', () => {
		expect(describeHandOff({ stopped: [], started: [] })).toBeNull()
	})
})

describe('moveHandOff', () => {
	it('moves the end of the stopped clock and the start of the started one', () => {
		const handOff = clockChanges(parseTasks(running), parseTasks(switched))
		expect(moveHandOff(switched.join('\n'), handOff, at(10, 30))).toBe(
			[
				'- [ ] Chores',
				'      [clock::2026-11-12T09:00:00--2026-11-12T09:30:00]',
				'      [clock::2026-11-12T10:00:00--2026-11-12T10:30:00]',
				'- [ ] Email',
				'      [clock::2026-11-12T10:30:00]',
			].join('\n')
		)
	})

	it('refuses when the note no longer holds the clocks as left', () => {
		const handOff = clockChanges(parseTasks(running), parseTasks(switched))
		expect(moveHandOff(running.join('\n'), handOff, at(10, 30))).toBeNull()
	})
})
