import { describe, expect, it } from 'vitest'
import {
	addMinutes,
	formatClockMinutes,
	formatDuration,
	formatHoursMinutes,
	formatLocalDateTime,
	getMinutesBetween,
	parseLocalDateTime,
	readFrontmatterTime,
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

describe('readFrontmatterTime', () => {
	const date = new Date(2026, 7, 16, 7, 12, 0)

	it('accepts a Date or a timestamp string', () => {
		expect(readFrontmatterTime(date)).toEqual(date)
		expect(readFrontmatterTime('2026-08-16T07:12:00')).toEqual(date)
	})

	it('returns null for missing, invalid or unexpected values', () => {
		expect(readFrontmatterTime(undefined)).toBeNull()
		expect(readFrontmatterTime('soon')).toBeNull()
		expect(readFrontmatterTime(new Date('nope'))).toBeNull()
		expect(readFrontmatterTime(42)).toBeNull()
	})
})

describe('getMinutesBetween / addMinutes', () => {
	const start = new Date(2026, 7, 16, 9, 0, 0)

	it('counts the minutes between the ends truncated to their minute', () => {
		expect(getMinutesBetween(start, new Date(2026, 7, 16, 10, 30, 59))).toBe(90)
		// 14:47:43–15:00 is 12m 17s, but reads 14:47–15:00: 13 minutes.
		expect(
			getMinutesBetween(
				new Date(2026, 7, 16, 14, 47, 43),
				new Date(2026, 7, 16, 15, 0, 0)
			)
		).toBe(13)
	})

	it('adds up touching clocks to their union', () => {
		const middle = new Date(2026, 7, 16, 9, 20, 30)
		const end = new Date(2026, 7, 16, 9, 40, 30)
		expect(
			getMinutesBetween(start, middle) + getMinutesBetween(middle, end)
		).toBe(getMinutesBetween(start, end))
	})

	it('shifts a date by minutes, negative values going back in time', () => {
		expect(getMinutesBetween(start, addMinutes(start, 15))).toBe(15)
		expect(getMinutesBetween(start, addMinutes(start, -15))).toBe(-15)
	})
})

describe('formatDuration', () => {
	it('shows hours/minutes and an optional share of a total', () => {
		expect(formatDuration(125)).toBe('2h 05m')
		expect(formatDuration(30, 240)).toBe('30m - 12.5%')
	})
})

describe('formatClockMinutes / formatHoursMinutes', () => {
	it('renders minutes since midnight as a clock time, wrapping past 24h', () => {
		expect(formatClockMinutes(450)).toBe('07:30')
		expect(formatClockMinutes(1470)).toBe('00:30')
	})

	it('renders a duration compactly', () => {
		expect(formatHoursMinutes(125)).toBe('2h 05m')
		expect(formatHoursMinutes(45)).toBe('45m')
	})
})
