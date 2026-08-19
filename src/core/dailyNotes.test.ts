import { describe, expect, it } from 'vitest'
import { addDays, getDailyNoteDate, getDailyNotePath } from './dailyNotes'

const date = new Date(2026, 7, 16, 13, 0, 0)

describe('getDailyNotePath', () => {
	it('joins folder, formatted date and extension', () => {
		expect(
			getDailyNotePath({ folder: 'Journal', format: 'YYYY-MM-DD' }, date)
		).toBe('Journal/2026-08-16.md')
	})

	it('supports the vault root and formats containing sub folders', () => {
		expect(getDailyNotePath({ folder: '', format: 'YYYY-MM-DD' }, date)).toBe(
			'2026-08-16.md'
		)
		expect(
			getDailyNotePath({ folder: '/Journal/', format: 'YYYY/MM/DD' }, date)
		).toBe('Journal/2026/08/16.md')
	})
})

describe('getDailyNoteDate', () => {
	const config = { folder: 'Journal', format: 'YYYY-MM-DD' }

	it('parses the date of a note inside the folder', () => {
		expect(getDailyNoteDate(config, 'Journal/2026-08-16.md')).toEqual(
			new Date(2026, 7, 16)
		)
	})

	it('rejects notes outside the folder or not matching the format', () => {
		expect(getDailyNoteDate(config, '2026-08-16.md')).toBeNull()
		expect(getDailyNoteDate(config, 'Journal/tasks-dictionary.md')).toBeNull()
		expect(getDailyNoteDate(config, 'Journal/2026-8-16.md')).toBeNull()
		expect(getDailyNoteDate(config, 'Journal/2026-08-16.txt')).toBeNull()
	})

	it('round-trips with getDailyNotePath', () => {
		const path = getDailyNotePath(config, date)
		expect(getDailyNoteDate(config, path)).toEqual(new Date(2026, 7, 16))
	})
})

describe('addDays', () => {
	it('crosses month boundaries', () => {
		expect(addDays(new Date(2026, 7, 31), 1)).toEqual(new Date(2026, 8, 1))
		expect(addDays(new Date(2026, 8, 1), -1)).toEqual(new Date(2026, 7, 31))
	})
})
