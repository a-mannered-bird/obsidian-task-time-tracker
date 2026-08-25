import { describe, expect, it } from 'vitest'
import { DEFAULT_STATS_OPTIONS, normalizeStatsOptions } from './statsOptions'

describe('normalizeStatsOptions', () => {
	it('returns the defaults for an empty block', () => {
		expect(normalizeStatsOptions(null)).toEqual({
			ok: true,
			options: DEFAULT_STATS_OPTIONS,
		})
	})

	it('accepts every option, with scalars promoted to one-item lists', () => {
		expect(
			normalizeStatsOptions({
				range: '2026-08-01..2026-08-16',
				groupBy: 'tag',
				filter: '#project',
				metrics: ['total', 'per-day'],
				skipEmptyDays: true,
			})
		).toEqual({
			ok: true,
			options: {
				range: '2026-08-01..2026-08-16',
				groupBy: 'tag',
				filter: ['#project'],
				metrics: ['total', 'per-day'],
				skipEmptyDays: true,
			},
		})
	})

	it('reports every invalid value and unknown key at once', () => {
		const result = normalizeStatsOptions({
			range: 'fortnight',
			groupBy: 'project',
			metrics: ['total', 'median'],
			skipEmptyDays: 'yes',
			colour: 'red',
		})
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.errors).toHaveLength(5)
		expect(result.errors[0]).toMatch(/^range: "fortnight"/)
		expect(result.errors[4]).toBe('Unknown option "colour".')
	})

	it('rejects a block that is not a mapping', () => {
		expect(normalizeStatsOptions(['today']).ok).toBe(false)
	})
})
