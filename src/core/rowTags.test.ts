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
	it('shows the mapped emojis in mapping order and counts the other tags', () => {
		expect(tagSlot(['#admin', '#health', '#project'], mappings)).toEqual({
			emojis: ['⭐️', '🏃'],
			others: 1,
			label: '#admin #health #project',
		})
	})

	it('shows an emoji shared by two tags once', () => {
		expect(tagSlot(['#health', '#sport'], mappings).emojis).toEqual(['🏃'])
	})

	it('counts a tag mapped without an emoji among the others', () => {
		expect(tagSlot(['#later'], mappings)).toMatchObject({
			emojis: [],
			others: 1,
		})
	})

	it('says when the task has no tags', () => {
		expect(tagSlot([], mappings)).toEqual({
			emojis: [],
			others: 0,
			label: 'No tags',
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
