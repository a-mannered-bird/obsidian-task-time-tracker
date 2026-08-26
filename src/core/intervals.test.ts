import { describe, expect, it } from 'vitest'
import type { Interval } from 'types/tasks'
import {
	coveredMinutes,
	mergeIntervals,
	uncoveredIntervals,
	uncoveredMinutes,
} from './intervals'

const at = (h: number, m = 0) => new Date(2026, 7, 16, h, m, 0)
const span = (from: [number, number?], to: [number, number?]): Interval => ({
	start: at(from[0], from[1]),
	end: at(to[0], to[1]),
})

describe('mergeIntervals', () => {
	it('merges overlapping and touching intervals and sorts them', () => {
		expect(
			mergeIntervals([span([12], [13]), span([9], [10]), span([9, 30], [11])])
		).toEqual([span([9], [11]), span([12], [13])])
	})

	it('drops empty or reversed intervals', () => {
		expect(mergeIntervals([span([10], [10]), span([11], [10])])).toEqual([])
	})
})

describe('coveredMinutes', () => {
	it('counts overlapping intervals once', () => {
		expect(
			coveredMinutes([span([9], [11]), span([10], [12]), span([13], [13, 30])])
		).toBe(210)
	})
})

describe('uncoveredIntervals', () => {
	const bounds = span([8], [12])

	it('returns the gaps inside the bounds', () => {
		expect(
			uncoveredIntervals([span([9], [10]), span([10, 30], [11])], bounds)
		).toEqual([span([8], [9]), span([10], [10, 30]), span([11], [12])])
	})

	it('clips intervals that stick out of the bounds', () => {
		expect(
			uncoveredIntervals([span([7], [9]), span([11], [13])], bounds)
		).toEqual([span([9], [11])])
	})

	it('returns the whole bounds when nothing is covered', () => {
		expect(uncoveredMinutes([], bounds)).toBe(240)
	})
})
