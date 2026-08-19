import { describe, expect, it } from 'vitest'
import type { App, TFile } from 'obsidian'
import {
	addDays,
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
			getFileByPath: (path: string) =>
				vaultFiles.includes(path) ? file(path) : null,
		},
	} as unknown as App
}
describe('resolveTargetFile', () => {
	it('returns the active file when it is a daily note', () => {
		const active = file('Journal/2026-08-10.md')
		const app = appStub(active, ['Journal/2026-08-16.md'])
		expect(resolveTargetFile(app, config, date)).toBe(active)
	})

	it("falls back to today's daily note when the active file is not one", () => {
		const app = appStub(file('Projects/plugin.md'), ['Journal/2026-08-16.md'])
		expect(resolveTargetFile(app, config, date)?.path).toBe(
			'Journal/2026-08-16.md'
		)
	})

	it('returns null when there is no active daily note and no note for today', () => {
		const app = appStub(null, [])
		expect(resolveTargetFile(app, config, date)).toBeNull()
	})
})
