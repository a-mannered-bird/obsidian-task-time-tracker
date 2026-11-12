import { describe, expect, it } from 'vitest'
import type { App, TFile } from 'obsidian'
import {
	addDays,
	getAdjacentDailyNoteFile,
	getDailyNoteDate,
	getDailyNotePath,
	resolveTarget,
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

/** Only the vault and workspace calls the functions under test make. */
function appStub(activeFile: TFile | null, vaultFiles: string[]): App {
	return {
		workspace: { getActiveFile: () => activeFile },
		vault: {
			getMarkdownFiles: () => vaultFiles.map(file),
			getFileByPath: (path: string) =>
				vaultFiles.includes(path) ? file(path) : null,
		},
	} as unknown as App
}
describe('resolveTarget', () => {
	it('returns the active file when it is a daily note, even a past one', () => {
		const active = file('Journal/2026-08-10.md')
		const app = appStub(active, [
			'Journal/2026-08-10.md',
			'Journal/2026-08-16.md',
		])
		expect(resolveTarget(app, config, date)).toEqual({
			date: new Date(2026, 7, 10),
			path: 'Journal/2026-08-10.md',
			file: active,
		})
	})

	it("targets today's note when the active file is not a daily note", () => {
		const app = appStub(file('Projects/plugin.md'), [
			'Journal/2026-08-15.md',
			'Journal/2026-08-16.md',
		])
		expect(resolveTarget(app, config, date).file?.path).toBe(
			'Journal/2026-08-16.md'
		)
	})

	it("targets today's note before it exists, never an earlier one", () => {
		const app = appStub(null, ['Journal/2026-08-15.md'])
		expect(resolveTarget(app, config, date)).toEqual({
			date: new Date(2026, 7, 16),
			path: 'Journal/2026-08-16.md',
			file: null,
		})
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
