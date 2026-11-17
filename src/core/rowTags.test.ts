import { describe, expect, it } from 'vitest'
import { parseTasks } from './parser'
import { setNoteTaskTags, tagSlot, tagSuggestions } from './rowTags'

const mappings = [
	{ tag: '#project', emoji: '⭐️' },
	{ tag: '#health', emoji: '🏃' },
	{ tag: '#sport', emoji: '🏃' },
	{ tag: '#later', emoji: '' },
]

describe('tagSlot', () => {
	it("shows one emoji, the first tag's having one, badged with the other tags", () => {
		expect(tagSlot(['#admin', '#health', '#project'], mappings)).toEqual({
			emoji: '🏃',
			badge: 2,
			tagged: true,
			label: '#admin #health #project',
		})
	})

	it('has no badge when no tag has an emoji: the hash icon stands for them', () => {
		expect(tagSlot(['#later', '#admin'], mappings)).toMatchObject({
			emoji: null,
			badge: 0,
			tagged: true,
		})
	})

	it('offers to add tags when the task has none', () => {
		expect(tagSlot([], mappings)).toEqual({
			emoji: null,
			badge: 0,
			tagged: false,
			label: 'Add tags',
		})
	})
})

describe('tagSuggestions', () => {
	const noteTasks = parseTasks([
		'- [ ] Email #work #admin',
		'- [ ] Gym #health',
		'- [ ] Code review #work',
	])

	it("offers the note's tags first, then the vault's, without the line's own", () => {
		expect(
			tagSuggestions(noteTasks, ['#admin', '#books', '#work'], ['#work'])
		).toEqual(['#admin', '#health', '#books'])
	})
})

describe('setNoteTaskTags', () => {
	const content = [
		'- [ ] Email #work #admin',
		'      [clock::2026-08-02T09:00:00--2026-08-02T09:25:00]',
		'- [ ] Emails #admin',
	].join('\n')

	it("rewrites the task's line to carry exactly the tags", () => {
		expect(
			setNoteTaskTags(content, 'Email', ['#work', '#focus'])?.split('\n')
		).toEqual([
			'- [ ] Email #work #focus',
			'      [clock::2026-08-02T09:00:00--2026-08-02T09:25:00]',
			'- [ ] Emails #admin',
		])
	})

	it('removes every tag', () => {
		expect(setNoteTaskTags(content, 'Email', [])?.split('\n')[0]).toBe(
			'- [ ] Email'
		)
	})

	it('leaves the note as it was when the tags are the same', () => {
		expect(setNoteTaskTags(content, 'Email', ['#admin', '#work'])).toBe(content)
	})

	it('gives null when the task is gone from the note', () => {
		expect(setNoteTaskTags(content, 'Chores', ['#home'])).toBeNull()
	})
})
