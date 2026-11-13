import { describe, expect, it } from 'vitest'
import { parseTasks } from './parser'
import {
	dayEndFloor,
	describeTypedTime,
	parseDayEnd,
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

	it("places a time of day on the note's day, minutes still from the reference", () => {
		const day = new Date(2026, 10, 9)
		expect(parseToggleTime('14:30', now, { day })).toEqual({
			at: new Date(2026, 10, 9, 14, 30),
		})
		expect(parseToggleTime('15', now, { day })).toEqual({
			at: new Date(2026, 10, 12, 7, 45),
		})
	})

	it('keeps a closing time after the clocks it closes', () => {
		const day = new Date(2026, 10, 9)
		const after = new Date(2026, 10, 9, 22, 0)
		expect(parseToggleTime('23:00', now, { day, after })).toEqual({
			at: new Date(2026, 10, 9, 23, 0),
		})
		expect(parseToggleTime('1:00', now, { day, after })).toEqual({
			at: new Date(2026, 10, 10, 1, 0),
		})
		expect(
			parseToggleTime('15', now, { after: new Date(2026, 10, 12, 7, 50) })
		).toEqual({ error: 'That is not after the start, 07:50.' })
	})
})

describe('dayEndFloor', () => {
	const dayStart = new Date(2026, 10, 11, 7, 0)

	it('is the latest clock end, past the start of day', () => {
		const tasks = parseTasks([
			'- [ ] Write plugin',
			'      [clock::2026-11-11T21:00:00--2026-11-11T22:30:00]',
			'- [ ] Emails',
			'      [clock::2026-11-11T09:00:00--2026-11-11T09:30:00]',
		])
		expect(dayEndFloor(tasks, dayStart)).toEqual({
			at: new Date(2026, 10, 11, 22, 30),
			what: 'the end of the last clock',
		})
	})

	it('counts a running clock by its start, since ending the day closes it', () => {
		const tasks = parseTasks([
			'- [ ] Write plugin',
			'      [clock::2026-11-11T21:00:00--2026-11-11T22:30:00]',
			'- [ ] Reading',
			'      [clock::2026-11-11T23:00:00]',
		])
		expect(dayEndFloor(tasks, dayStart)).toEqual({
			at: new Date(2026, 10, 11, 23, 0),
			what: 'the start of a running clock',
		})
	})

	it('falls back to the start of day, else nothing', () => {
		const tasks = parseTasks(['- [ ] Write plugin'])
		expect(dayEndFloor(tasks, dayStart)).toEqual({
			at: dayStart,
			what: 'the start of day',
		})
		expect(dayEndFloor(tasks, null)).toBeNull()
	})
})

describe('parseDayEnd', () => {
	const day = new Date(2026, 10, 11)
	const floor = {
		at: new Date(2026, 10, 11, 22, 30),
		what: 'the end of the last clock',
	}

	it('moves a time of day before the floor to the next day', () => {
		expect(parseDayEnd('23:00', day, floor, now)).toEqual({
			at: new Date(2026, 10, 11, 23, 0),
		})
		expect(parseDayEnd('21:00', day, floor, now)).toEqual({
			at: new Date(2026, 10, 12, 21, 0),
		})
	})

	it('accepts the floor itself: the day may end with the last clock', () => {
		expect(parseDayEnd('22:30', day, floor, now)).toEqual({
			at: new Date(2026, 10, 11, 22, 30),
		})
	})

	it('rejects minutes ago that fall before the floor, naming it', () => {
		// now is 2026-11-12 08:00; 10 hours ago is 22:00 the day before.
		expect(parseDayEnd('600', day, floor, now)).toEqual({
			error: 'That is before the end of the last clock, 22:30.',
		})
	})

	it('takes any time of day on the note without a floor', () => {
		expect(parseDayEnd('06:00', day, null, now)).toEqual({
			at: new Date(2026, 10, 11, 6, 0),
		})
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
		expect(describeTypedTime(new Date(2026, 10, 9, 14, 30), now)).toBe(
			'14:30 Monday'
		)
	})
})
