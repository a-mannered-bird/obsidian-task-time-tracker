import { describe, expect, it } from 'vitest'
import {
	describeTypedTime,
	parseEndTime,
	parseStartTime,
	parseToggleTime,
} from './typedTime'

const now = new Date(2026, 10, 12, 8, 0)
const notATime = {
	error: 'Enter a time of day like 14:30, or minutes ago like 15.',
}

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

	it('accepts a time still to come, as the tracking commands do', () => {
		expect(parseEndTime('9:00', start, now)).toEqual({
			at: new Date(2026, 10, 12, 9, 0),
		})
		expect(parseEndTime('-5', start, now)).toEqual({
			at: new Date(2026, 10, 12, 8, 5),
		})
	})

	it('counts minutes back from now, after the start only', () => {
		expect(parseEndTime('15', start, now)).toEqual({
			at: new Date(2026, 10, 12, 7, 45),
		})
		expect(parseEndTime('15 min', start, now)).toEqual({
			at: new Date(2026, 10, 12, 7, 45),
		})
		// 10h ago is 22:00 the day before, earlier than the 22:40 start.
		expect(parseEndTime('600', start, now)).toEqual({
			error: 'That is not after the start, 22:40.',
		})
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

	it('accepts a time still to come, as the tracking commands do', () => {
		expect(parseStartTime('8:30', start, now)).toEqual({
			at: new Date(2026, 10, 12, 8, 30),
		})
		expect(parseStartTime('-10', start, now)).toEqual({
			at: new Date(2026, 10, 12, 8, 10),
		})
	})

	it('counts minutes back from now, before or after the start', () => {
		expect(parseStartTime('5', start, now)).toEqual({
			at: new Date(2026, 10, 12, 7, 55),
		})
		expect(parseStartTime('30m', start, now)).toEqual({
			at: new Date(2026, 10, 12, 7, 30),
		})
	})
})

describe('parseToggleTime', () => {
	it('takes a time of day, or minutes before the reference, either way', () => {
		expect(parseToggleTime('7:20', now)).toEqual({
			at: new Date(2026, 10, 12, 7, 20),
		})
		expect(parseToggleTime('15', now)).toEqual({
			at: new Date(2026, 10, 12, 7, 45),
		})
		expect(parseToggleTime('-10', now)).toEqual({
			at: new Date(2026, 10, 12, 8, 10),
		})
		expect(parseToggleTime('soon', now)).toEqual(notATime)
	})
})

describe('describeTypedTime', () => {
	it('gives the time with how far it is from now', () => {
		expect(describeTypedTime(new Date(2026, 10, 12, 7, 45), now)).toBe(
			'07:45 · 15m ago'
		)
		expect(describeTypedTime(new Date(2026, 10, 12, 9, 10), now)).toBe(
			'09:10 · in 1h 10m'
		)
		expect(describeTypedTime(now, now)).toBe('08:00 · now')
	})

	it('names the day when it is not today', () => {
		expect(describeTypedTime(new Date(2026, 10, 11, 23, 15), now)).toBe(
			'23:15 yesterday · 8h 45m ago'
		)
	})
})
