import { describe, expect, it } from 'vitest'
import {
	resolveSeriesColor,
	seriesColor,
	tagColor,
	taskColor,
} from './chartColors'

const mappings = [
	{ tag: '#project', emoji: '⭐️' },
	{ tag: '#work', emoji: '💼', color: 'var(--color-blue)' },
	{ tag: '#sport', emoji: '🏃', color: '#ff8800' },
]

describe('task and tag colors', () => {
	it("gives a tag its mapping's color, if any", () => {
		expect(tagColor('#work', mappings)).toBe('var(--color-blue)')
		expect(tagColor('#project', mappings)).toBeUndefined()
		expect(tagColor('#unknown', mappings)).toBeUndefined()
	})

	it('gives a task its own color, else its first tag with one', () => {
		const own = { Run: 'var(--color-red)' }
		expect(taskColor('Run', ['#sport'], own, mappings)).toBe('var(--color-red)')
		// #project has no color: the next tag's applies.
		expect(
			taskColor('Write', ['#project', '#work', '#sport'], {}, mappings)
		).toBe('var(--color-blue)')
		expect(taskColor('Email', ['#project'], {}, mappings)).toBeUndefined()
	})

	it('falls back to the rank cycle for a series without a color', () => {
		expect(resolveSeriesColor('#ff8800', 3)).toBe('#ff8800')
		expect(resolveSeriesColor(undefined, 3)).toBe(seriesColor(3))
	})
})
