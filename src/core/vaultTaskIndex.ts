import type { TFile } from 'obsidian'
import type { Task } from 'types/tasks'
import { taskMinutes } from './aggregate'
import type { DailyLog } from './dailyLogs'

type NoteTasks = Pick<DailyLog, 'date' | 'tasks' | 'wakeTime' | 'bedTime'>

/** Structural counterpart of DailyLogChange, holding only what is read. */
export type VaultTaskChange = { path: string; log: NoteTasks | null }

/** What the index reads; satisfied by DailyLogStore plus a file listing. */
export type VaultTaskSource = {
	/** Candidate daily note files for the initial scan. */
	listFiles(): TFile[]
	loadFile(file: TFile): Promise<NoteTasks | null>
	onChange(listener: (change?: VaultTaskChange) => void): () => void
}

/** Aggregate of one task name over every daily note of the vault. */
export type VaultTaskInfo = {
	name: string
	/** Number of daily notes containing the task. */
	noteCount: number
	/** Date of the most recent daily note containing the task. */
	lastUsed: Date
	/** Tags of the task's occurrence in that most recent note. */
	tags: string[]
	/** Minutes over all occurrences; running clocks count up to `now`. */
	totalMinutes: number
}

export type VaultTaskOccurrence = {
	path: string
	date: Date
	task: Task
	/** The note's wake/bed times, when recorded; the day's window. */
	wakeTime: Date | null
	bedTime: Date | null
}

type NoteEntry = NoteTasks

/**
 * Vault-wide task aggregates over the daily notes, for the picker's vault
 * section and the task management panel. The initial scan is lazy (see
 * ensureBuilt); source change events keep the entries fresh afterwards, and a
 * bulk invalidation (change without payload) queues a rescan for the next use.
 */
export class VaultTaskIndex {
	private byPath = new Map<string, NoteEntry>()
	private building: Promise<void> | null = null
	private built = false
	private generation = 0

	constructor(private source: VaultTaskSource) {
		source.onChange((change) => this.apply(change))
	}

	/** True once the initial scan finished; change events keep it fresh. */
	get isReady(): boolean {
		return this.built
	}

	/** Scan every daily note once; concurrent calls share the same scan. */
	ensureBuilt(): Promise<void> {
		if (this.built) return Promise.resolve()
		this.building ??= this.build()
		return this.building
	}

	/**
	 * Aggregates per task name, most used first: note count, then last used,
	 * then name — a deterministic default for the picker's vault section.
	 */
	snapshot(now = new Date()): VaultTaskInfo[] {
		const infos = new Map<string, VaultTaskInfo>()
		for (const entry of this.byPath.values()) {
			const counted = new Set<string>()
			for (const task of entry.tasks) {
				let info = infos.get(task.name)
				if (!info) {
					info = {
						name: task.name,
						noteCount: 0,
						lastUsed: entry.date,
						tags: task.tags,
						totalMinutes: 0,
					}
					infos.set(task.name, info)
				}
				if (!counted.has(task.name)) {
					counted.add(task.name)
					info.noteCount++
				}
				// Strictly newer only: within a note (equal dates) the first
				// line keeps providing the tags, whatever the note order.
				if (entry.date > info.lastUsed) {
					info.lastUsed = entry.date
					info.tags = task.tags
				}
				info.totalMinutes += taskMinutes(task, now)
			}
		}
		return [...infos.values()].sort(
			(a, b) =>
				b.noteCount - a.noteCount ||
				b.lastUsed.valueOf() - a.lastUsed.valueOf() ||
				a.name.localeCompare(b.name)
		)
	}

	/** Every tag used on any task line, sorted. */
	allTags(): string[] {
		const tags = new Set<string>()
		for (const entry of this.byPath.values()) {
			for (const task of entry.tasks) {
				for (const tag of task.tags) tags.add(tag)
			}
		}
		return [...tags].sort((a, b) => a.localeCompare(b))
	}

	/** Every line of the task across the vault, oldest note first. */
	occurrences(name: string): VaultTaskOccurrence[] {
		const result: VaultTaskOccurrence[] = []
		for (const [path, entry] of this.byPath) {
			for (const task of entry.tasks) {
				if (task.name === name) {
					result.push({
						path,
						date: entry.date,
						task,
						wakeTime: entry.wakeTime,
						bedTime: entry.bedTime,
					})
				}
			}
		}
		return result.sort((a, b) => a.date.valueOf() - b.date.valueOf())
	}

	private apply(change?: VaultTaskChange) {
		if (!change) {
			this.byPath.clear()
			this.built = false
			this.generation++
			return
		}
		if (change.log) {
			this.byPath.set(change.path, noteEntry(change.log))
		} else {
			this.byPath.delete(change.path)
		}
	}

	private async build(): Promise<void> {
		// A bulk invalidation while scanning bumps the generation; restart so
		// the finished index never mixes notes from before and after it.
		let generation: number
		do {
			generation = this.generation
			for (const file of this.source.listFiles()) {
				const log = await this.source.loadFile(file)
				if (generation !== this.generation) break
				if (log) this.byPath.set(file.path, noteEntry(log))
			}
		} while (generation !== this.generation)
		this.built = true
		this.building = null
	}
}

/** Keep only what the index reads, not the whole DailyLog. */
function noteEntry(log: NoteTasks): NoteEntry {
	return {
		date: log.date,
		tasks: log.tasks,
		wakeTime: log.wakeTime,
		bedTime: log.bedTime,
	}
}
