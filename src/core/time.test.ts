import { describe, expect, it } from 'vitest'
import {
	addMinutes,
	formatDuration,
	formatLocalDateTime,
	getMinutesBetween,
	parseLocalDateTime,
} from './time'

describe('formatLocalDateTime / parseLocalDateTime', () => {
	it('round-trips a local timestamp', () => {
		const date = new Date(2026, 7, 16, 9, 5, 7)
		const text = formatLocalDateTime(date)
		expect(text).toBe('2026-08-16T09:05:07')
		expect(parseLocalDateTime(text)).toEqual(date)
	})

	it('returns null for an invalid timestamp', () => {
		expect(parseLocalDateTime('yesterday')).toBeNull()
	})
})

describe('getMinutesBetween / addMinutes', () => {
	const start = new Date(2026, 7, 16, 9, 0, 0)

	it('measures whole minutes, rounding down', () => {
		expect(getMinutesBetween(start, new Date(2026, 7, 16, 10, 30, 59))).toBe(90)
	})

	it('shifts a date by minutes, negative values going back in time', () => {
		expect(getMinutesBetween(start, addMinutes(start, 15))).toBe(15)
		expect(getMinutesBetween(start, addMinutes(start, -15))).toBe(-15)
	})
})

describe('formatDuration', () => {
	it('shows minutes, hours/minutes and an optional share of a total', () => {
		expect(formatDuration(125)).toBe('125m - (2h 5m)')
		expect(formatDuration(30, 240)).toBe('30m - (0h 30m) - 12.5%')
	})
})
