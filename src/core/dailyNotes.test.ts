import { describe, expect, it } from 'vitest'
import type { App, TFile } from 'obsidian'
import {
	addDays,
	getAdjacentDailyNoteFile,
	getDailyNoteDate,
	getDailyNotePath,
	resolveTargetFile,
} from './dailyNotes'

const date = new Date(2026, 7, 16, 13, 0, 0)
const config = { folder: 'Journal', format: 'YYYY-MM-DD' }

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

function file(path: string): TFile {
	return { path } as TFile
}

/** Only the two calls resolveTargetFile makes. */
function appStub(activeFile: TFile | null, vaultFiles: string[]): App {
	return {
		workspace: { getActiveFile: () => activeFile },
		vault: {
			getMarkdownFiles: () => vaultFiles.map(file),
		},
	} as unknown as App
}
describe('resolveTargetFile', () => {
	it('returns the active file when it is a daily note', () => {
		const active = file('Journal/2026-08-10.md')
		const app = appStub(active, ['Journal/2026-08-16.md'])
		expect(resolveTargetFile(app, config, date)).toBe(active)
	})

	it('falls back to the most recent daily note when the active file is not one', () => {
		const app = appStub(file('Projects/plugin.md'), [
			'Journal/2026-08-12.md',
			'Journal/2026-08-15.md',
			'Journal/tasks-dictionary.md',
		])
		expect(resolveTargetFile(app, config, date)?.path).toBe(
			'Journal/2026-08-15.md'
		)
	})

	it('ignores daily notes dated in the future', () => {
		const app = appStub(null, [
			'Journal/2026-08-15.md',
			'Journal/2026-08-20.md',
		])
		expect(resolveTargetFile(app, config, date)?.path).toBe(
			'Journal/2026-08-15.md'
		)
	})

	it('returns null when there is no active daily note and none in the vault', () => {
		const app = appStub(null, [])
		expect(resolveTargetFile(app, config, date)).toBeNull()
	})
})

describe('getAdjacentDailyNoteFile', () => {
	const app = appStub(null, [
		'Journal/2026-08-10.md',
		'Journal/2026-08-13.md',
		'Journal/2026-08-16.md',
		'Journal/tasks-dictionary.md',
	])
	const noteDate = new Date(2026, 7, 13)

	it('finds the closest note in each direction, skipping gaps', () => {
		expect(getAdjacentDailyNoteFile(app, config, noteDate, -1)?.path).toBe(
			'Journal/2026-08-10.md'
		)
		expect(getAdjacentDailyNoteFile(app, config, noteDate, 1)?.path).toBe(
			'Journal/2026-08-16.md'
		)
	})

	it('returns null at the edges', () => {
		expect(
			getAdjacentDailyNoteFile(app, config, new Date(2026, 7, 10), -1)
		).toBeNull()
		expect(
			getAdjacentDailyNoteFile(app, config, new Date(2026, 7, 16), 1)
		).toBeNull()
	})
})
