import { isTag } from './taskEdits'
import type { VaultTaskInfo } from './vaultTaskIndex'

/** Rows rendered at once in the management table; sorting sees everything. */
export const TASK_TABLE_ROW_CAP = 200

export type TaskSortKey = 'usage' | 'name' | 'lastUsed' | 'total'

/** The filter showing only the task of that name: the name in quotes. */
export function exactNameQuery(name: string): string {
	return `"${name}"`
}

const GOAL_QUERY_PREFIX = 'goal:'

/** The filter showing the tasks with a goal of that metric (`time` for time goals). */
export function metricQuery(metric: string): string {
	return `${GOAL_QUERY_PREFIX}${metric}`
}

/**
 * Tasks whose name or one of whose lines' tags contains the query (case
 * folded); a query in double quotes matches one name exactly, as task
 * identity does, and a query naming a tag some task carries matches that
 * tag exactly (`#work` not `#workout`), while a partial one still filters
 * as it is typed. Likewise `goal:<metric>`, the whole query, matches the
 * tasks with a goal of that metric on any line, a partial one the tasks
 * with a goal of a metric containing it.
 */
export function filterTaskInfos(
	infos: VaultTaskInfo[],
	query: string
): VaultTaskInfo[] {
	const trimmed = query.trim()
	const quoted = /^"(.+)"$/.exec(trimmed)
	if (quoted) return infos.filter((info) => info.name === quoted[1])
	if (isTag(trimmed)) {
		const tagged = infos.filter((info) => info.lineTags.includes(trimmed))
		if (tagged.length > 0) return tagged
	}
	if (trimmed.startsWith(GOAL_QUERY_PREFIX)) {
		const metric = trimmed.slice(GOAL_QUERY_PREFIX.length).trim()
		const withGoal = infos.filter((info) => info.goalLabels.includes(metric))
		if (withGoal.length > 0) return withGoal
		const partial = metric.toLowerCase()
		return infos.filter((info) =>
			info.goalLabels.some((label) => label.toLowerCase().includes(partial))
		)
	}
	const needle = trimmed.toLowerCase()
	if (!needle) return infos
	return infos.filter(
		(info) =>
			info.name.toLowerCase().includes(needle) ||
			info.lineTags.some((tag) => tag.toLowerCase().includes(needle))
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
