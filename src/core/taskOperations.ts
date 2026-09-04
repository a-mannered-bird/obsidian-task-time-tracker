import {
	runBulkEdit,
	type BulkEditReport,
	type BulkEditVault,
} from './bulkEdit'
import {
	consolidateTasks,
	unionClocks,
	type ConsolidateResult,
} from './consolidate'
import {
	deleteTaskLines,
	retagTaskLines,
	tagChangeApplies,
	type DeleteResult,
	type RetagResult,
	type TagChange,
} from './taskEdits'
import type { VaultTaskIndex, VaultTaskOccurrence } from './vaultTaskIndex'

export type DeletionPreview = {
	notes: number
	taskLines: number
	clockLines: number
}

/** What deleting the task removes, from the index alone. */
export function previewDeletion(
	index: VaultTaskIndex,
	name: string
): DeletionPreview {
	const occurrences = index.occurrences(name)
	return {
		notes: new Set(occurrences.map((occurrence) => occurrence.path)).size,
		taskLines: occurrences.length,
		clockLines: occurrences.reduce(
			(sum, { task }) => sum + task.clocks.length,
			0
		),
	}
}

export function deleteInVault(
	vault: BulkEditVault,
	index: VaultTaskIndex,
	name: string,
	onProgress?: (done: number, total: number) => void
): Promise<BulkEditReport<DeleteResult>> {
	return runBulkEdit(
		vault,
		affectedPaths(index, [], name),
		(content) => deleteTaskLines(content, name),
		onProgress
	)
}

export type RetagPreview = { notes: number; taskLines: number }

/** Lines the tag change alters, from the index alone. */
export function previewRetag(
	index: VaultTaskIndex,
	name: string,
	change: TagChange
): RetagPreview {
	const applicable = index
		.occurrences(name)
		.filter(({ task }) => tagChangeApplies(task.tags, change))
	return {
		notes: new Set(applicable.map((occurrence) => occurrence.path)).size,
		taskLines: applicable.length,
	}
}

export function retagInVault(
	vault: BulkEditVault,
	index: VaultTaskIndex,
	name: string,
	change: TagChange,
	onProgress?: (done: number, total: number) => void
): Promise<BulkEditReport<RetagResult>> {
	return runBulkEdit(
		vault,
		affectedPaths(index, [], name),
		(content) => retagTaskLines(content, name, change),
		onProgress
	)
}

/** Blast radius of a rename or merge, computed from the index alone. */
export type ConsolidationPreview = {
	notes: number
	removedTaskLines: number
	removedClockLines: number
}

/**
 * What consolidating `sourceNames` into `targetName` would do, without
 * reading a file: the index keeps every occurrence with its clocks, so the
 * per-note union is replayed exactly as the engine will run it.
 */
export function previewConsolidation(
	index: VaultTaskIndex,
	sourceNames: string[],
	targetName: string
): ConsolidationPreview {
	const preview: ConsolidationPreview = {
		notes: 0,
		removedTaskLines: 0,
		removedClockLines: 0,
	}
	for (const occurrences of occurrencesByPath(index, sourceNames, targetName)) {
		const clocks = occurrences.flatMap(({ task }) => task.clocks)
		preview.notes++
		preview.removedTaskLines += occurrences.length - 1
		preview.removedClockLines += clocks.length - unionClocks(clocks).length
	}
	return preview
}

/** Rename or merge across every daily note holding one of the names. */
export function consolidateInVault(
	vault: BulkEditVault,
	index: VaultTaskIndex,
	sourceNames: string[],
	targetName: string,
	onProgress?: (done: number, total: number) => void
): Promise<BulkEditReport<ConsolidateResult>> {
	const paths = affectedPaths(index, sourceNames, targetName)
	return runBulkEdit(
		vault,
		paths,
		(content) => consolidateTasks(content, sourceNames, targetName),
		onProgress
	)
}

/** Notes holding any of the names, oldest note first. */
export function affectedPaths(
	index: VaultTaskIndex,
	sourceNames: string[],
	targetName: string
): string[] {
	return occurrencesByPath(index, sourceNames, targetName).map(
		(occurrences) => occurrences[0]!.path
	)
}

/** Occurrences of all the names grouped per note, oldest note first. */
function occurrencesByPath(
	index: VaultTaskIndex,
	sourceNames: string[],
	targetName: string
): VaultTaskOccurrence[][] {
	const names = new Set([...sourceNames, targetName])
	const byPath = new Map<string, VaultTaskOccurrence[]>()
	for (const name of names) {
		for (const occurrence of index.occurrences(name)) {
			const list = byPath.get(occurrence.path) ?? []
			list.push(occurrence)
			byPath.set(occurrence.path, list)
		}
	}
	return [...byPath.values()].sort(
		(a, b) => a[0]!.date.valueOf() - b[0]!.date.valueOf()
	)
}
