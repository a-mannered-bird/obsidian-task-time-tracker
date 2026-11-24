import { describe, expect, it } from 'vitest'
import {
	readFrontmatterList,
	readFrontmatterValue,
	setFrontmatterList,
	setFrontmatterValue,
} from './frontmatter'

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

describe('frontmatter lists', () => {
	const note = [
		'---',
		'day_start: 2026-08-16T07:00:00',
		'tag_goals:',
		'  - "#work 6h"',
		"  - '#leisure <2h'",
		'day_end: 2026-08-16T22:00:00',
		'---',
		'- [ ] Write',
	].join('\n')

	it('reads a block list, or a flow one, unquoted', () => {
		expect(readFrontmatterList(note, 'tag_goals')).toEqual([
			'#work 6h',
			'#leisure <2h',
		])
		expect(readFrontmatterList('---\ntags: [a, "b c"]\n---\n', 'tags')).toEqual(
			['a', 'b c']
		)
		expect(readFrontmatterList(note, 'missing')).toBeUndefined()
	})

	it('reads a block list starting at the key indent', () => {
		expect(
			readFrontmatterList('---\ntag_goals:\n- "#work 6h"\n---\n', 'tag_goals')
		).toEqual(['#work 6h'])
	})

	it('rewrites the list in place, quoted, keeping the other properties', () => {
		expect(
			setFrontmatterList(note, 'tag_goals', ['#work 5h']).split('\n')
		).toEqual([
			'---',
			'day_start: 2026-08-16T07:00:00',
			'tag_goals:',
			'  - "#work 5h"',
			'day_end: 2026-08-16T22:00:00',
			'---',
			'- [ ] Write',
		])
	})

	it('removes the property once empty, and creates the frontmatter when missing', () => {
		expect(setFrontmatterList(note, 'tag_goals', []).split('\n')).toEqual([
			'---',
			'day_start: 2026-08-16T07:00:00',
			'day_end: 2026-08-16T22:00:00',
			'---',
			'- [ ] Write',
		])
		expect(
			setFrontmatterList(
				'---\ntag_goals:\n  - "#a 1h"\n---\n- [ ] Write',
				'tag_goals',
				[]
			)
		).toBe('- [ ] Write')
		expect(setFrontmatterList('- [ ] Write', 'tag_goals', ['#work 6h'])).toBe(
			'---\ntag_goals:\n  - "#work 6h"\n---\n- [ ] Write'
		)
	})
})
