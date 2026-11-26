import { describe, expect, it } from 'vitest'
import { parseTasks } from './parser'
import {
	defaultClockTimes,
	describeClockDay,
	describeClockLength,
	parseClockTimes,
} from './setClock'

const day = new Date(2026, 10, 23)
const at = (hours: number, minutes: number) =>
	new Date(2026, 10, 23, hours, minutes)

describe('defaultClockTimes', () => {
	it("starts where the note's last clock ended, whichever task it was", () => {
		const tasks = parseTasks([
			'- [x] Email',
			'      [clock::2026-11-23T09:00:00--2026-11-23T11:20:00]',
			'- [ ] Chores',
			'      [clock::2026-11-23T08:00:00--2026-11-23T08:45:00]',
		])
		expect(defaultClockTimes(tasks, day, at(7, 0))).toEqual({
			start: at(11, 20),
			end: at(11, 50),
		})
	})

	it('starts at the start of day when the note has no finished clock', () => {
		const tasks = parseTasks([
			'- [ ] Email',
			'      [clock::2026-11-23T10:00:00]',
		])
		expect(defaultClockTimes(tasks, day, at(7, 15))).toEqual({
			start: at(7, 15),
			end: at(7, 45),
		})
	})

	it('starts at 08:00 without a clock or a start of day', () => {
		expect(defaultClockTimes([], day, null)).toEqual({
			start: at(8, 0),
			end: at(8, 30),
		})
	})

	it('ignores a clock ending past midnight, which the fields cannot hold', () => {
		const tasks = parseTasks([
			'- [x] Movie',
			'      [clock::2026-11-23T22:00:00--2026-11-24T00:30:00]',
		])
		expect(defaultClockTimes(tasks, day, at(7, 0)).start).toEqual(at(7, 0))
	})

	it('ends on the next day when the half hour runs past midnight', () => {
		const tasks = parseTasks([
			'- [x] Reading',
			'      [clock::2026-11-23T22:00:00--2026-11-23T23:40:00]',
		])
		expect(defaultClockTimes(tasks, day, null)).toEqual({
			start: at(23, 40),
			end: new Date(2026, 10, 24, 0, 10),
		})
	})
})

describe('parseClockTimes', () => {
	const clocks = parseTasks([
		'- [x] Email',
		'      [clock::2026-11-23T09:00:00--2026-11-23T10:00:00]',
		'      [clock::2026-11-23T15:00:00]',
	])[0]!.clocks

	it("places both times on the note's day", () => {
		expect(parseClockTimes('10:00', '10:45', day, clocks)).toEqual({
			times: { start: at(10, 0), end: at(10, 45) },
		})
	})

	it('asks for the fields left empty or incomplete', () => {
		expect(parseClockTimes('', '10:45', day, [])).toMatchObject({
			fields: ['start'],
		})
		expect(parseClockTimes('10:00', '', day, [])).toMatchObject({
			fields: ['end'],
		})
		expect(parseClockTimes('', '', day, [])).toMatchObject({
			fields: ['start', 'end'],
		})
	})

	it('reads an end before the start as the next day', () => {
		expect(parseClockTimes('22:30', '01:00', day, [])).toEqual({
			times: { start: at(22, 30), end: new Date(2026, 10, 24, 1, 0) },
		})
	})

	it('refuses a clock starting and ending at the same time', () => {
		expect(parseClockTimes('10:00', '10:00', day, [])).toEqual({
			error: 'The start and the end are the same time.',
			fields: ['start', 'end'],
		})
	})

	it("refuses to overlap one of the task's clocks, but may touch it", () => {
		expect(parseClockTimes('09:30', '10:30', day, clocks)).toEqual({
			error: "It overlaps this task's clock 09:00–10:00.",
			fields: ['start', 'end'],
		})
		expect(parseClockTimes('08:00', '09:00', day, clocks)).toHaveProperty(
			'times'
		)
	})

	it('treats a running clock as going on for the rest of the day', () => {
		expect(parseClockTimes('16:00', '17:00', day, clocks)).toEqual({
			error: "It overlaps this task's clock running since 15:00.",
			fields: ['start', 'end'],
		})
		expect(parseClockTimes('14:00', '15:00', day, clocks)).toHaveProperty(
			'times'
		)
	})
})

describe('describeClockLength', () => {
	it('says how long the clock lasts', () => {
		expect(describeClockLength({ start: at(9, 50), end: at(11, 5) })).toBe(
			'Lasts 1h 15m'
		)
	})

	it('says when the clock ends on the next day', () => {
		expect(
			describeClockLength({
				start: at(22, 30),
				end: new Date(2026, 10, 24, 1, 0),
			})
		).toBe('Ends the next day · lasts 2h 30m')
	})
})

describe('describeClockDay', () => {
	it('names the day, with its year only when not the current one', () => {
		expect(describeClockDay(day, new Date(2026, 11, 2))).toBe(
			'On Monday, November 23.'
		)
		expect(describeClockDay(day, new Date(2027, 0, 2))).toBe(
			'On Monday, November 23, 2026.'
		)
	})
})
