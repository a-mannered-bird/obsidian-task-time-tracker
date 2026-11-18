import { describe, expect, it } from 'vitest'
import {
	clockChanges,
	describeHandOff,
	describeRetime,
	moveHandOff,
	type HandOff,
} from './handOff'
import { plainNoticeText } from './noticeText'
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

	it('takes a running clock moved to another task for no new start', () => {
		const migrated = [
			'- [ ] Chores',
			'      [clock::2026-11-12T09:00:00--2026-11-12T09:30:00]',
			'- [ ] Email',
			'      [clock::2026-11-12T10:00:00]',
		]
		expect(clockChanges(parseTasks(running), parseTasks(migrated))).toEqual({
			stopped: [],
			started: [],
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
	const handOff = clockChanges(parseTasks(running), parseTasks(switched))
	const today = {
		tasks: parseTasks(switched),
		day: at(0, 0),
		now: at(10, 42),
	}
	const say = (change: HandOff, context = today) => {
		const text = describeHandOff(change, context)
		return text === null ? null : plainNoticeText(text)
	}

	it('names a switch and a stop with how long the stopped clock ran', () => {
		// Chores ran 10:00–10:42, after 09:00–09:30 earlier: 42m of 1h 12m.
		expect(say(handOff)).toBe(
			'🔀 Switched from "Chores" (42m of 1h 12m today) to "Email" at 10:42'
		)
		expect(say({ ...handOff, started: [] })).toBe(
			'⏹️ Stopped "Chores" (42m of 1h 12m today) at 10:42'
		)
	})

	it('names the day of a stop in an earlier note', () => {
		const nextDay = new Date(2026, 10, 13, 8, 0)
		expect(
			say({ ...handOff, started: [] }, { ...today, now: nextDay })
		).toBe('⏹️ Stopped "Chores" (42m of 1h 12m yesterday) at 10:42')
	})

	it('names a start', () => {
		expect(say({ ...handOff, stopped: [] })).toBe(
			'▶️ Started "Email" at 10:42'
		)
	})

	it('has nothing to say when nothing started or stopped', () => {
		expect(say({ stopped: [], started: [] })).toBeNull()
	})
})

describe('describeRetime', () => {
	const context = { tasks: parseTasks(switched), day: at(0, 0), now: at(11, 0) }

	it('tells a running clock given an end as a stop', () => {
		expect(
			plainNoticeText(
				describeRetime(
					{ taskName: 'Chores', start: at(10, 0), end: null },
					{ start: at(10, 0), end: at(10, 42) },
					context
				)
			)
		).toBe('⏹️ Stopped "Chores" (42m of 1h 12m today) at 10:42')
	})

	it('shows both ranges for any other edit', () => {
		expect(
			plainNoticeText(
				describeRetime(
					{ taskName: 'Chores', start: at(9, 0), end: at(9, 30) },
					{ start: at(9, 15), end: at(9, 30) },
					context
				)
			)
		).toBe('✏️ "Chores" 09:00–09:30 → 09:15–09:30')
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
