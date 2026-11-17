import { describe, expect, it } from 'vitest'
import { readFrontmatterValue, setFrontmatterValue } from './frontmatter'

describe('readFrontmatterValue', () => {
	it('reads a plain or quoted value from the leading block only', () => {
		const content = [
			'---',
			'day_start: 2026-11-17T07:05:00',
			"day_end: '2026-11-17T23:10:00'",
			'---',
			'day_end: not frontmatter',
		].join('\n')
		expect(readFrontmatterValue(content, 'day_start')).toBe(
			'2026-11-17T07:05:00'
		)
		expect(readFrontmatterValue(content, 'day_end')).toBe('2026-11-17T23:10:00')
		expect(readFrontmatterValue(content, 'tags')).toBeUndefined()
		expect(readFrontmatterValue('- [ ] Chores', 'day_start')).toBeUndefined()
	})
})

describe('setFrontmatterValue', () => {
	it('creates the frontmatter when the note has none', () => {
		expect(
			setFrontmatterValue('- [ ] Chores\n', 'day_start', '2026-11-17T07:05:00')
		).toBe(
			['---', 'day_start: 2026-11-17T07:05:00', '---', '- [ ] Chores', ''].join(
				'\n'
			)
		)
	})

	it('adds the property last, or replaces it in place', () => {
		const content = ['---', 'tags: [daily]', '---', '- [ ] Chores'].join('\n')
		const added = setFrontmatterValue(content, 'day_end', '2026-11-17T23:10:00')
		expect(added.split('\n')).toEqual([
			'---',
			'tags: [daily]',
			'day_end: 2026-11-17T23:10:00',
			'---',
			'- [ ] Chores',
		])
		expect(
			setFrontmatterValue(added, 'day_end', '2026-11-18T00:30:00').split('\n')
		).toEqual([
			'---',
			'tags: [daily]',
			'day_end: 2026-11-18T00:30:00',
			'---',
			'- [ ] Chores',
		])
	})
})
