import type { VaultTaskInfo } from './vaultTaskIndex'

/** Rows rendered at once in the management table; sorting sees everything. */
export const TASK_TABLE_ROW_CAP = 200

export type TaskSortKey = 'usage' | 'name' | 'lastUsed' | 'total'

/** Tasks whose name or one of whose tags contains the query (case folded). */
export function filterTaskInfos(
	infos: VaultTaskInfo[],
	query: string
): VaultTaskInfo[] {
	const needle = query.trim().toLowerCase()
	if (!needle) return infos
	return infos.filter(
		(info) =>
			info.name.toLowerCase().includes(needle) ||
			info.tags.some((tag) => tag.toLowerCase().includes(needle))
	)
}

/**
 * Sort for the management table. `ascending` flips the natural direction of
 * the key: usage, total and last used are biggest/newest first by default,
 * names alphabetical. Does not mutate the input; ties keep the index order
 * (usage-first) coming from the snapshot.
 */
export function sortTaskInfos(
	infos: VaultTaskInfo[],
	key: TaskSortKey,
	ascending = key === 'name'
): VaultTaskInfo[] {
	const direction = ascending ? 1 : -1
	return [...infos].sort((a, b) => direction * compare(a, b, key))
}

function compare(a: VaultTaskInfo, b: VaultTaskInfo, key: TaskSortKey): number {
	switch (key) {
		case 'usage':
			return a.noteCount - b.noteCount
		case 'name':
			return a.name.localeCompare(b.name)
		case 'lastUsed':
			return a.lastUsed.valueOf() - b.lastUsed.valueOf()
		case 'total':
			return a.totalMinutes - b.totalMinutes
	}
}
