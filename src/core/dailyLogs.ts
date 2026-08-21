import type { App, CachedMetadata, Plugin, TFile } from 'obsidian'
import type { Task } from 'types/tasks'
import {
	getDailyNoteDate,
	getDailyNoteFile,
	isDailyNote,
	type DailyNotesConfig,
} from './dailyNotes'
import { parseTasks } from './parser'
import { readFrontmatterTime } from './time'

export type DailyLog = {
	date: Date
	file: TFile
	tasks: Task[]
	wakeTime: Date | null
	bedTime: Date | null
}

export type DailyLogStoreConfig = {
	dailyNotes: DailyNotesConfig
	wakeTimeProperty: string
	bedTimeProperty: string
}

type CacheEntry = { mtime: number; log: DailyLog }

/**
 * Loads and caches the daily logs (parsed daily notes). Entries are keyed by path and
 * validated against the file's mtime, so a missed event can never serve stale
 * data; events only drop entries early and notify listeners.
 */
export class DailyLogStore {
	private cache = new Map<string, CacheEntry>()
	private listeners = new Set<() => void>()

	constructor(
		private app: App,
		private getConfig: () => DailyLogStoreConfig
	) {}

	/** Hook vault/metadata events; call once from the plugin's onload. */
	register(plugin: Plugin) {
		plugin.registerEvent(
			this.app.metadataCache.on('changed', (file, data, cache) => {
				if (!isDailyNote(this.getConfig().dailyNotes, file)) return
				this.cache.set(file.path, {
					mtime: file.stat.mtime,
					log: this.buildDailyLog(file, data, cache),
				})
				this.notifyListeners()
			})
		)
		plugin.registerEvent(
			this.app.metadataCache.on('deleted', (file) => this.drop(file.path))
		)
		plugin.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => this.drop(oldPath))
		)
	}

	/** Subscribe to changes; returns the unsubscribe function. */
	onChange(listener: () => void): () => void {
		this.listeners.add(listener)
		return () => this.listeners.delete(listener)
	}

	clear() {
		this.cache.clear()
		this.notifyListeners()
	}

	async loadByDate(date: Date): Promise<DailyLog | null> {
		const file = getDailyNoteFile(this.app, this.getConfig().dailyNotes, date)
		return file ? this.loadFile(file) : null
	}

	async loadFile(file: TFile): Promise<DailyLog | null> {
		const cached = this.cache.get(file.path)
		if (cached && cached.mtime === file.stat.mtime) return cached.log

		const date = getDailyNoteDate(this.getConfig().dailyNotes, file.path)
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
		const { dailyNotes, wakeTimeProperty, bedTimeProperty } = this.getConfig()
		const frontmatter = metadata?.frontmatter ?? {}
		return {
			date: getDailyNoteDate(dailyNotes, file.path) ?? new Date(NaN),
			file,
			tasks: parseTasks(content.split('\n')),
			wakeTime: readFrontmatterTime(frontmatter[wakeTimeProperty]),
			bedTime: readFrontmatterTime(frontmatter[bedTimeProperty]),
		}
	}

	private drop(path: string) {
		if (this.cache.delete(path)) this.notifyListeners()
	}

	private notifyListeners() {
		this.listeners.forEach((listener) => listener())
	}
}
