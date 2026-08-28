import { describe, expect, it } from 'vitest'
import { countDays, resolveRange, shiftRange, startOfWeek } from './ranges'

// Wednesday 2026-08-19, mid-afternoon: bounds must ignore the time of day.
const today = new Date(2026, 7, 19, 15, 42, 0)
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)

describe('resolveRange presets', () => {
	it.each([
		['today', d(2026, 8, 19), d(2026, 8, 19)],
		['yesterday', d(2026, 8, 18), d(2026, 8, 18)],
		['this-week', d(2026, 8, 17), d(2026, 8, 19)],
		['last-week', d(2026, 8, 10), d(2026, 8, 16)],
		['this-month', d(2026, 8, 1), d(2026, 8, 19)],
		['last-month', d(2026, 7, 1), d(2026, 7, 31)],
		['this-year', d(2026, 1, 1), d(2026, 8, 19)],
		['last-year', d(2025, 1, 1), d(2025, 12, 31)],
	])('%s', (spec, start, end) => {
		expect(resolveRange(spec, today)).toEqual({ start, end })
	})

	it('"all" has no start', () => {
		expect(resolveRange('all', today)).toEqual({
			start: null,
			end: d(2026, 8, 19),
		})
	})

	it('starts weeks on Monday, also on a Sunday', () => {
		expect(resolveRange('this-week', d(2026, 8, 23))).toEqual({
			start: d(2026, 8, 17),
			end: d(2026, 8, 23),
		})
		expect(startOfWeek(d(2026, 8, 17))).toEqual(d(2026, 8, 17))
	})

	it('handles month arithmetic across the year boundary', () => {
		expect(resolveRange('last-month', d(2026, 1, 10))).toEqual({
			start: d(2025, 12, 1),
			end: d(2025, 12, 31),
		})
		expect(resolveRange('last-3-months', d(2026, 1, 10))?.start).toEqual(
			d(2025, 11, 1)
		)
	})
})

describe('resolveRange last-N windows', () => {
	it.each([
		['last-7-days', d(2026, 8, 13), d(2026, 8, 19)],
		['last-2-weeks', d(2026, 8, 10), d(2026, 8, 19)],
		['last-3-months', d(2026, 6, 1), d(2026, 8, 19)],
		['last-2-years', d(2025, 1, 1), d(2026, 8, 19)],
	])('%s', (spec, start, end) => {
		expect(resolveRange(spec, today)).toEqual({ start, end })
	})

	it('treats a count of 1 like the matching this-* preset, singular allowed', () => {
		expect(resolveRange('last-1-day', today)).toEqual(
			resolveRange('today', today)
		)
		expect(resolveRange('last-1-week', today)).toEqual(
			resolveRange('this-week', today)
		)
		expect(resolveRange('last-1-month', today)).toEqual(
			resolveRange('this-month', today)
		)
		expect(resolveRange('last-1-year', today)).toEqual(
			resolveRange('this-year', today)
		)
	})

	it('rejects a zero count and unknown units', () => {
		expect(resolveRange('last-0-days', today)).toBeNull()
		expect(resolveRange('last-2-fortnights', today)).toBeNull()
	})
})

describe('resolveRange custom', () => {
	it('parses from..to and orders the bounds', () => {
		expect(resolveRange('2026-08-01..2026-08-16', today)).toEqual({
			start: d(2026, 8, 1),
			end: d(2026, 8, 16),
		})
		expect(resolveRange('2026-08-16..2026-08-01', today)).toEqual({
			start: d(2026, 8, 1),
			end: d(2026, 8, 16),
		})
	})

	it('rejects unknown specs and invalid dates', () => {
		expect(resolveRange('fortnight', today)).toBeNull()
		expect(resolveRange('2026-02-30..2026-03-01', today)).toBeNull()
	})
})

describe('shiftRange', () => {
	it('returns the written range at offset 0', () => {
		expect(shiftRange('this-month', 0, today)).toEqual(
			resolveRange('this-month', today)
		)
	})

	it('steps calendar specs by full units', () => {
		expect(shiftRange('this-month', -1, today)).toEqual({
			start: d(2026, 7, 1),
			end: d(2026, 7, 31),
		})
		expect(shiftRange('this-week', -1, today)).toEqual(
			resolveRange('last-week', today)
		)
		expect(shiftRange('this-year', -1, today)).toEqual(
			resolveRange('last-year', today)
		)
	})

	it('steps windows and custom spans by their own length', () => {
		expect(shiftRange('last-7-days', -1, today)).toEqual({
			start: d(2026, 8, 6),
			end: d(2026, 8, 12),
		})
		expect(shiftRange('last-2-weeks', -1, today)).toEqual({
			start: d(2026, 7, 27),
			end: d(2026, 8, 9),
		})
		expect(shiftRange('2026-08-01..2026-08-04', -1, today)).toEqual({
			start: d(2026, 7, 28),
			end: d(2026, 7, 31),
		})
	})

	it('clamps a shifted end to today when stepping forward', () => {
		expect(shiftRange('last-month', 1, today)).toEqual({
			start: d(2026, 8, 1),
			end: d(2026, 8, 19),
		})
		expect(shiftRange('yesterday', 1, today)).toEqual({
			start: d(2026, 8, 19),
			end: d(2026, 8, 19),
		})
	})

	it('refuses ranges starting in the future, "all" and unknown specs', () => {
		expect(shiftRange('yesterday', 2, today)).toBeNull()
		expect(shiftRange('this-month', 1, today)).toBeNull()
		expect(shiftRange('all', -1, today)).toBeNull()
		expect(shiftRange('fortnight', -1, today)).toBeNull()
	})
})

describe('countDays', () => {
	it('counts both bounds inclusively', () => {
		expect(countDays({ start: d(2026, 8, 1), end: d(2026, 8, 1) })).toBe(1)
		expect(countDays({ start: d(2026, 8, 10), end: d(2026, 8, 16) })).toBe(7)
	})
})
