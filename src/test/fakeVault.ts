import type { TFile } from 'obsidian'
import type { BulkEditVault } from 'core/bulkEdit'
import { parseTasks } from 'core/parser'
import {
	BED_TIME_PROPERTY,
	readFrontmatterTime,
	WAKE_TIME_PROPERTY,
} from 'core/time'
import type { VaultTaskChange, VaultTaskSource } from 'core/vaultTaskIndex'

/**
 * In-memory daily notes for tests: path → content, the path's basename
 * being the note date. Serves both as a VaultTaskIndex source and as the
 * vault of the bulk runner; writes through `process` notify the source's
 * listeners like the real store does.
 */
export function fakeVault(notes: Record<string, string>) {
	const files = new Map(Object.entries(notes))
	const listeners = new Set<(change?: VaultTaskChange) => void>()
	let loadCount = 0

	const logOf = (path: string, content: string) => ({
		date: new Date(
			`${path.replace(/^.*\//, '').replace(/\.md$/, '')}T00:00:00`
		),
		tasks: parseTasks(content.split('\n')),
		wakeTime: readFrontmatterTime(
			frontmatterValue(content, WAKE_TIME_PROPERTY)
		),
		bedTime: readFrontmatterTime(frontmatterValue(content, BED_TIME_PROPERTY)),
	})
	const fileOf = (path: string) => ({ path }) as TFile
	const notify = (change?: VaultTaskChange) =>
		listeners.forEach((listener) => listener(change))

	const source: VaultTaskSource = {
		listFiles: () => [...files.keys()].map(fileOf),
		loadFile: (file) => {
			loadCount++
			const content = files.get(file.path)
			return Promise.resolve(
				content === undefined ? null : logOf(file.path, content)
			)
		},
		onChange: (listener) => {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
	}

	const vault: BulkEditVault = {
		getFileByPath: (path) => (files.has(path) ? fileOf(path) : null),
		process: (file, fn) => {
			const content = files.get(file.path)
			if (content === undefined) throw new Error(`No file at ${file.path}`)
			const next = fn(content)
			files.set(file.path, next)
			notify({ path: file.path, log: logOf(file.path, next) })
			return Promise.resolve(next)
		},
	}

	return {
		source,
		vault,
		read: (path: string) => files.get(path),
		getLoadCount: () => loadCount,
		setNote: (path: string, content: string) => {
			files.set(path, content)
			notify({ path, log: logOf(path, content) })
		},
		dropNote: (path: string) => {
			files.delete(path)
			notify({ path, log: null })
		},
		invalidate: () => notify(undefined),
	}
}

/** `key: value` inside a leading `---` block, enough for the time properties. */
function frontmatterValue(content: string, key: string): string | undefined {
	const match = /^---\n([\s\S]*?)\n---/.exec(content)
	if (!match) return undefined
	const line = match[1]!.split('\n').find((l) => l.startsWith(`${key}:`))
	return line?.slice(key.length + 1).trim()
}
