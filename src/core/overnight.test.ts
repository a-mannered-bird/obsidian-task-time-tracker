import { describe, expect, it } from 'vitest'
import { parseTasks } from './parser'
import { describeDay, findOvernightClocks, parseStopTime } from './overnight'

const now = new Date(2026, 10, 12, 8, 0)

describe('findOvernightClocks', () => {
	const tasks = parseTasks([
		'- [ ] Write blog post',
		'      [clock::2026-11-11T20:00:00--2026-11-11T21:00:00]',
		'      [clock::2026-11-11T22:40:00]',
		'- [ ] Email',
		'      [clock::2026-11-11T09:00:00--2026-11-11T09:30:00]',
	])

	it('lists only the clocks still running', () => {
		expect(findOvernightClocks(tasks, null, now)).toEqual([
			{
				taskName: 'Write blog post',
				start: new Date(2026, 10, 11, 22, 40),
				bedTime: null,
			},
		])
	})

	it("offers the note's bed time when it can end the clock", () => {
		const bedTime = new Date(2026, 10, 11, 23, 15)
		expect(findOvernightClocks(tasks, bedTime, now)[0]?.bedTime).toEqual(
			bedTime
		)
	})

	it('does not offer a bed time before the clock started', () => {
		const bedTime = new Date(2026, 10, 11, 22, 0)
		expect(findOvernightClocks(tasks, bedTime, now)[0]?.bedTime).toBeNull()
	})
})

describe('describeDay', () => {
	const today = new Date(2026, 10, 12)

	it('names yesterday, then weekdays, then the date', () => {
		expect(describeDay(new Date(2026, 10, 11), today)).toBe('yesterday')
		expect(describeDay(new Date(2026, 10, 9), today)).toBe('Monday')
		expect(describeDay(new Date(2026, 10, 14), today)).toBe('Saturday')
		expect(describeDay(new Date(2026, 10, 2), today)).toBe('November 2, 2026')
	})
})

describe('parseStopTime', () => {
	const start = new Date(2026, 10, 11, 22, 40)

	it('places the time on the start day', () => {
		expect(parseStopTime('23:15', start, now)).toEqual({
			at: new Date(2026, 10, 11, 23, 15),
		})
	})

	it('moves a time not after the start to the next day', () => {
		expect(parseStopTime('0:30', start, now)).toEqual({
			at: new Date(2026, 10, 12, 0, 30),
		})
	})

	it('refuses a time still to come', () => {
		expect(parseStopTime('9:00', start, now)).toEqual({
			error: 'That time is still to come.',
		})
	})

	it('refuses text that is not a time of day', () => {
		const error = { error: 'Enter a time like 23:15.' }
		expect(parseStopTime('late', start, now)).toEqual(error)
		expect(parseStopTime('24:00', start, now)).toEqual(error)
		expect(parseStopTime('23:75', start, now)).toEqual(error)
	})
})
