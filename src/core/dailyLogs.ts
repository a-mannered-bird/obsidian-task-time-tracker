import {
	TFile,
	Vault,
	type App,
	type CachedMetadata,
	type Plugin,
} from 'obsidian'
import type { Task } from 'types/tasks'
import {
	addDays,
	getDailyNoteDate,
	getDailyNoteFile,
	isDailyNote,
	type DailyNotesConfig,
} from './dailyNotes'
import { parseTasks } from './parser'
import {
	BED_TIME_PROPERTY,
	readFrontmatterTime,
	WAKE_TIME_PROPERTY,
} from './time'

export type DailyLog = {
	date: Date
	file: TFile
	tasks: Task[]
	wakeTime: Date | null
	bedTime: Date | null
}

type CacheEntry = { mtime: number; log: DailyLog }

/**
 * One note changed (`log`) or went away (`log: null`). Listeners receive
 * `undefined` instead when the whole cache was invalidated (see clear).
 */
export type DailyLogChange = { path: string; log: DailyLog | null }

/**
 * Loads and caches the daily logs (parsed daily notes). Entries are keyed by path and
 * validated against the file's mtime, so a missed event can never serve stale
 * data; events only drop entries early and notify listeners.
 */
export class DailyLogStore {
	private cache = new Map<string, CacheEntry>()
	private listeners = new Set<(change?: DailyLogChange) => void>()

	constructor(
		private app: App,
		private getConfig: () => DailyNotesConfig
	) {}

	/** Hook vault/metadata events; call once from the plugin's onload. */
	register(plugin: Plugin) {
		plugin.registerEvent(
			this.app.metadataCache.on('changed', (file, data, cache) => {
				if (!isDailyNote(this.getConfig(), file)) return
				const log = this.buildDailyLog(file, data, cache)
				this.cache.set(file.path, { mtime: file.stat.mtime, log })
				this.notifyListeners({ path: file.path, log })
			})
		)
		plugin.registerEvent(
			this.app.metadataCache.on('deleted', (file) => this.drop(file.path))
		)
		plugin.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				this.drop(oldPath)
				// The metadata cache only fires `changed` on content changes, so
				// a note renamed into the daily notes folder/format is loaded
				// here to keep listeners (e.g. the vault task index) complete.
				if (file instanceof TFile && isDailyNote(this.getConfig(), file)) {
					void this.loadFile(file).then((log) => {
						if (log) this.notifyListeners({ path: file.path, log })
					})
				}
			})
		)
	}

	/** Subscribe to changes; returns the unsubscribe function. */
	onChange(listener: (change?: DailyLogChange) => void): () => void {
		this.listeners.add(listener)
		return () => this.listeners.delete(listener)
	}

	clear() {
		this.cache.clear()
		this.notifyListeners()
	}

	async loadByDate(date: Date): Promise<DailyLog | null> {
		const file = getDailyNoteFile(this.app, this.getConfig(), date)
		return file ? this.loadFile(file) : null
	}

	/** Existing daily notes between the two dates, inclusive, oldest first. */
	async loadRange(from: Date, to: Date): Promise<DailyLog[]> {
		const logs: DailyLog[] = []
		for (let date = from; date <= to; date = addDays(date, 1)) {
			const log = await this.loadByDate(date)
			if (log) logs.push(log)
		}
		return logs
	}

	/**
	 * Date of the oldest daily note, or null when there is none. Only the
	 * daily notes folder is walked (recursively, as the format may contain
	 * sub folders); with the vault root as folder that is the whole vault.
	 */
	earliestDate(): Date | null {
		const config = this.getConfig()
		const folder = config.folder
			? this.app.vault.getFolderByPath(config.folder)
			: this.app.vault.getRoot()
		if (!folder) return null

		let earliest: Date | null = null
		Vault.recurseChildren(folder, (file) => {
			if (!(file instanceof TFile)) return
			const date = getDailyNoteDate(config, file.path)
			if (date && (!earliest || date < earliest)) earliest = date
		})
		return earliest
	}

	async loadFile(file: TFile): Promise<DailyLog | null> {
		const cached = this.cache.get(file.path)
		if (cached && cached.mtime === file.stat.mtime) return cached.log

		const date = getDailyNoteDate(this.getConfig(), file.path)
		if (!date) return null

		const content = await this.app.vault.cachedRead(file)
		const metadata = this.app.metadataCache.getFileCache(file)
		const log = this.buildDailyLog(file, content, metadata)
		this.cache.set(file.path, { mtime: file.stat.mtime, log })
		return log
	}

	private buildDailyLog(
		file: TFile,
		content: string,
		metadata: CachedMetadata | null
	): DailyLog {
		const frontmatter = metadata?.frontmatter ?? {}
		return {
			date: getDailyNoteDate(this.getConfig(), file.path) ?? new Date(NaN),
			file,
			tasks: parseTasks(content.split('\n')),
			wakeTime: readFrontmatterTime(frontmatter[WAKE_TIME_PROPERTY]),
			bedTime: readFrontmatterTime(frontmatter[BED_TIME_PROPERTY]),
		}
	}

	private drop(path: string) {
		if (this.cache.delete(path)) this.notifyListeners({ path, log: null })
	}

	private notifyListeners(change?: DailyLogChange) {
		this.listeners.forEach((listener) => listener(change))
	}
}
