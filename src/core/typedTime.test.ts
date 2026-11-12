import { describe, expect, it } from 'vitest'
import { parseEndTime, parseStartTime } from './typedTime'

const now = new Date(2026, 10, 12, 8, 0)
const notATime = { error: 'Enter a time like 23:15.' }
const stillToCome = { error: 'That time is still to come.' }

describe('parseEndTime', () => {
	const start = new Date(2026, 10, 11, 22, 40)

	it('places the time on the start day', () => {
		expect(parseEndTime('23:15', start, now)).toEqual({
			at: new Date(2026, 10, 11, 23, 15),
		})
	})

	it('moves a time not after the start to the next day', () => {
		expect(parseEndTime('0:30', start, now)).toEqual({
			at: new Date(2026, 10, 12, 0, 30),
		})
	})

	it('refuses a time still to come', () => {
		expect(parseEndTime('9:00', start, now)).toEqual(stillToCome)
	})

	it('refuses text that is not a time of day', () => {
		expect(parseEndTime('late', start, now)).toEqual(notATime)
		expect(parseEndTime('24:00', start, now)).toEqual(notATime)
		expect(parseEndTime('23:75', start, now)).toEqual(notATime)
	})
})

describe('parseStartTime', () => {
	const start = new Date(2026, 10, 12, 7, 40)

	it('places the time on the start day, earlier or later than the start', () => {
		expect(parseStartTime('7:10', start, now)).toEqual({
			at: new Date(2026, 10, 12, 7, 10),
		})
		expect(parseStartTime('7:55', start, now)).toEqual({
			at: new Date(2026, 10, 12, 7, 55),
		})
	})

	it('refuses a time still to come', () => {
		expect(parseStartTime('8:30', start, now)).toEqual(stillToCome)
	})
})
