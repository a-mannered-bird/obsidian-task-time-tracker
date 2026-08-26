import { moment, normalizePath, type App, type TFile } from 'obsidian'

export type DailyNotesConfig = {
	/** Folder relative to the vault root; empty string = vault root. */
	folder: string
	/** Moment format of the note path inside the folder (may contain `/`). */
	format: string
}

/** `'/Journal/'` → `'Journal'`; the setting is free text, vault paths have no surrounding slashes. */
function trimSurroundingSlashes(folder: string): string {
	return folder.replace(/^\/+|\/+$/g, '')
}

/** `Journal/2026-08-16.md`; format may add sub folders (`YYYY/MM/YYYY-MM-DD`). */
export function getDailyNotePath(config: DailyNotesConfig, date: Date): string {
	const name = moment(date).format(config.format)
	const folder = trimSurroundingSlashes(config.folder)
	return normalizePath(folder ? `${folder}/${name}.md` : `${name}.md`)
}

/**
 * Date of a daily note, or null when the path is not inside the folder or
 * does not match the format exactly (strict parsing).
 */
export function getDailyNoteDate(
	config: DailyNotesConfig,
	path: string
): Date | null {
	const folder = trimSurroundingSlashes(config.folder)
	const prefix = folder ? `${folder}/` : ''
	if (!path.startsWith(prefix) || !path.endsWith('.md')) return null

	const name = path.slice(prefix.length, -'.md'.length)
	const parsed = moment(name, config.format, true)
	return parsed.isValid() ? parsed.toDate() : null
}

export function isDailyNote(config: DailyNotesConfig, file: TFile): boolean {
	return getDailyNoteDate(config, file.path) !== null
}

export function addDays(date: Date, days: number): Date {
	const result = new Date(date)
	result.setDate(result.getDate() + days)
	return result
}

/** The daily note file for a date, if it exists in the vault. */
export function getDailyNoteFile(
	app: App,
	config: DailyNotesConfig,
	date: Date
): TFile | null {
	return app.vault.getFileByPath(getDailyNotePath(config, date))
}

/** Most recent daily note in the vault, ignoring notes dated in the future. */
export function getLatestDailyNoteFile(
	app: App,
	config: DailyNotesConfig,
	now = new Date()
): TFile | null {
	let latest: { date: Date; file: TFile } | null = null
	for (const file of app.vault.getMarkdownFiles()) {
		const date = getDailyNoteDate(config, file.path)
		if (!date || date > now) continue
		if (!latest || date > latest.date) latest = { date, file }
	}
	return latest?.file ?? null
}

/**
 * File the daily view and tracking commands act on: the active file when it
 * is a daily note, otherwise the most recent daily note (null when there is
 * none).
 */
export function resolveTargetFile(
	app: App,
	config: DailyNotesConfig,
	now = new Date()
): TFile | null {
	const active = app.workspace.getActiveFile()
	if (active && isDailyNote(config, active)) return active
	return getLatestDailyNoteFile(app, config, now)
}
