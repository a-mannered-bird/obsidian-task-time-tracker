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

/** `2026-08-16`: the note path inside the folder, without extension. */
export function getDailyNoteName(config: DailyNotesConfig, date: Date): string {
	return moment(date).format(config.format)
}

/** `Journal/2026-08-16.md`; format may add sub folders (`YYYY/MM/YYYY-MM-DD`). */
export function getDailyNotePath(config: DailyNotesConfig, date: Date): string {
	const name = getDailyNoteName(config, date)
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

/**
 * Closest existing daily note strictly before (`-1`) or after (`1`) the
 * date, or null when there is none.
 */
export function getAdjacentDailyNoteFile(
	app: App,
	config: DailyNotesConfig,
	date: Date,
	direction: -1 | 1
): TFile | null {
	let closest: { date: Date; file: TFile } | null = null
	for (const file of app.vault.getMarkdownFiles()) {
		const noteDate = getDailyNoteDate(config, file.path)
		if (!noteDate) continue
		if (direction === -1 ? noteDate >= date : noteDate <= date) continue
		if (
			!closest ||
			(direction === -1 ? noteDate > closest.date : noteDate < closest.date)
		)
			closest = { date: noteDate, file }
	}
	return closest?.file ?? null
}

/** Create an empty daily note for the date, plus missing parent folders. */
export async function createDailyNote(
	app: App,
	config: DailyNotesConfig,
	date: Date
): Promise<TFile> {
	const path = getDailyNotePath(config, date)
	let folder = ''
	for (const segment of path.split('/').slice(0, -1)) {
		folder = folder ? `${folder}/${segment}` : segment
		if (!app.vault.getFolderByPath(folder)) await app.vault.createFolder(folder)
	}
	return app.vault.create(path, '')
}

/** A daily note to act on; `file` is null until its first write creates it. */
export type DailyTarget = {
	date: Date
	path: string
	file: TFile | null
}

/**
 * The daily note the daily view and the tracking commands act on: the
 * active file when it is a daily note, otherwise today's, existing or not.
 * Never an earlier note: tracking written there would land on the wrong day.
 */
export function resolveTarget(
	app: App,
	config: DailyNotesConfig,
	now = new Date()
): DailyTarget {
	const active = app.workspace.getActiveFile()
	const activeDate = active ? getDailyNoteDate(config, active.path) : null
	if (active && activeDate) {
		return { date: activeDate, path: active.path, file: active }
	}
	const date = startOfDay(now)
	return {
		date,
		path: getDailyNotePath(config, date),
		file: getDailyNoteFile(app, config, date),
	}
}

/**
 * Whether tracking on the target must ask when it happened instead of
 * using now: a past note with a later daily note, so now belongs to that
 * one. The latest note keeps now, for work going on past midnight.
 */
export function asksTrackingTime(
	app: App,
	config: DailyNotesConfig,
	target: DailyTarget,
	now = new Date()
): boolean {
	return (
		target.date < startOfDay(now) &&
		getAdjacentDailyNoteFile(app, config, target.date, 1) !== null
	)
}

export function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function isSameDay(a: Date, b: Date): boolean {
	return startOfDay(a).valueOf() === startOfDay(b).valueOf()
}
