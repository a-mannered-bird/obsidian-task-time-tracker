import { describe, expect, it } from 'vitest'
import { parseTasks } from './parser'
import { describeDay, findOvernightClocks, noteDayHeading } from './overnight'

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
				dayEnd: null,
			},
		])
	})

	it("offers the note's end of day when it can end the clock", () => {
		const dayEnd = new Date(2026, 10, 11, 23, 15)
		expect(findOvernightClocks(tasks, dayEnd, now)[0]?.dayEnd).toEqual(dayEnd)
	})

	it('does not offer a end of day before the clock started', () => {
		const dayEnd = new Date(2026, 10, 11, 22, 0)
		expect(findOvernightClocks(tasks, dayEnd, now)[0]?.dayEnd).toBeNull()
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

describe('noteDayHeading', () => {
	const today = new Date(2026, 10, 12)

	it('says Today, else names the day with a capital', () => {
		expect(noteDayHeading(new Date(2026, 10, 12), today)).toBe('Today')
		expect(noteDayHeading(new Date(2026, 10, 11), today)).toBe('Yesterday')
		expect(noteDayHeading(new Date(2026, 10, 9), today)).toBe('Monday')
	})
})
