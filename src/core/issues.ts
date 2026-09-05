import type { Clock } from 'types/tasks'
import { startOfDay } from './ranges'
import {
	formatHoursMinutes,
	formatLocalDateTime,
	getMinutesBetween,
} from './time'
import type { VaultTaskIndex, VaultTaskOccurrence } from './vaultTaskIndex'

/** A clock line to jump to; `start` identifies the clock across edits. */
type ClockRef = { path: string; lineIndex: number; start: Date }

export type TaskIssue =
	/** Two names a typo apart — the accident the panel exists to catch. */
	| { kind: 'similar-name'; name: string; other: string }
	/** A closed session far longer than the task's usual ones, or ≥ 16 h. */
	| ({ kind: 'long-session'; name: string; minutes: number } & ClockRef)
	/** The task's lines do not all carry the same tags. */
	| { kind: 'tag-drift'; name: string; tagSets: string[][] }
	/** Two clocks of the same task overlap within a note (minutes count twice). */
	| ({ kind: 'clock-overlap'; name: string } & ClockRef)
	/** A clock still running in a note that is not today's. */
	| ({ kind: 'stale-clock'; name: string } & ClockRef)
	/** A clock lying entirely before the note's wake time or after its bed time. */
	| ({
			kind: 'outside-day'
			name: string
			side: 'before-wake' | 'after-bed'
	  } & ClockRef)

export type IssueKind = TaskIssue['kind']

/** Every kind, in the order the settings and the panel list them. */
export const ISSUE_KINDS: IssueKind[] = [
	'similar-name',
	'long-session',
	'tag-drift',
	'clock-overlap',
	'stale-clock',
	'outside-day',
]

export const ISSUE_TITLES: Record<IssueKind, string> = {
	'similar-name': 'Name close to another task',
	'long-session': 'Unusually long session',
	'tag-drift': 'Tags differ between notes',
	'clock-overlap': 'Overlapping clocks',
	'stale-clock': 'Clock still running in a past note',
	'outside-day': 'Clock outside the wake–bed window',
}

/** What the user chose not to see again (see visibleIssues). */
export type IssueDismissals = {
	ignoredIssueKinds: IssueKind[]
	dismissedIssues: string[]
}

/**
 * Stable identity of a warning, surviving note edits: clock issues are keyed
 * by the clock's start (line indexes shift), similar names by the sorted
 * pair, tag drift by the tag-set signature. A JSON array, so names may hold
 * any character.
 */
export function issueKey(issue: TaskIssue): string {
	switch (issue.kind) {
		case 'similar-name':
			return JSON.stringify([issue.kind, ...[issue.name, issue.other].sort()])
		case 'tag-drift':
			return JSON.stringify([
				issue.kind,
				issue.name,
				issue.tagSets
					.map((tags) => tags.join(' '))
					.sort()
					.join('|'),
			])
		default:
			return JSON.stringify([
				issue.kind,
				issue.name,
				issue.path,
				formatLocalDateTime(issue.start),
			])
	}
}

/** Task names a dismissal key refers to (one, or both of a similar pair). */
export function issueKeyNames(key: string): string[] {
	try {
		const parts: unknown = JSON.parse(key)
		if (!Array.isArray(parts) || !parts.every((p) => typeof p === 'string')) {
			return []
		}
		const strings = parts
		return strings[0] === 'similar-name'
			? strings.slice(1, 3)
			: strings.slice(1, 2)
	} catch {
		return []
	}
}

/** The issues left after the switched-off kinds and dismissed warnings. */
export function visibleIssues(
	issues: TaskIssue[],
	dismissals: IssueDismissals
): TaskIssue[] {
	const ignored = new Set(dismissals.ignoredIssueKinds)
	const dismissed = new Set(dismissals.dismissedIssues)
	return issues.filter(
		(issue) => !ignored.has(issue.kind) && !dismissed.has(issueKey(issue))
	)
}

/** A session at least this long is flagged whatever the task's habits. */
export const LONG_SESSION_MINUTES = 16 * 60
/** Below this many sessions the relative outlier rule stays silent. */
export const MIN_SESSIONS_FOR_OUTLIER = 5
/** A session longer than this many times the task's median is flagged. */
export const OUTLIER_MEDIAN_FACTOR = 5

/**
 * Every issue over the vault's tasks, in one pass over the index. The
 * thresholds are fixed on purpose (see PLAN): tuned rather than exposed.
 */
export function detectIssues(index: VaultTaskIndex, now: Date): TaskIssue[] {
	const names = index.snapshot(now).map((info) => info.name)
	const issues: TaskIssue[] = [...similarNames(names)]
	for (const name of names) {
		const occurrences = index.occurrences(name)
		issues.push(
			...longSessions(name, occurrences),
			...tagDrift(name, occurrences),
			...clockOverlaps(name, occurrences),
			...staleClocks(name, occurrences, now),
			...outsideDay(name, occurrences)
		)
	}
	return issues
}

/** One line per issue for tooltips and menus; the note is named by its path. */
export function describeIssue(issue: TaskIssue): string {
	switch (issue.kind) {
		case 'similar-name':
			return `Name close to "${issue.other}"`
		case 'long-session':
			return `${formatHoursMinutes(issue.minutes)} session in ${noteName(issue.path)}`
		case 'tag-drift':
			return `Tags differ across notes: ${issue.tagSets
				.map((tags) => (tags.length ? tags.join(' ') : 'no tag'))
				.join(' | ')}`
		case 'clock-overlap':
			return `Overlapping clocks in ${noteName(issue.path)}`
		case 'stale-clock':
			return `Still running since ${formatLocalDateTime(issue.start).replace('T', ' ')} in ${noteName(issue.path)}`
		case 'outside-day':
			return `${issue.side === 'before-wake' ? 'Before the wake time' : 'After the bed time'} in ${noteName(issue.path)}`
	}
}

function noteName(path: string): string {
	return path.replace(/^.*\//, '').replace(/\.md$/, '')
}

/** Issues grouped by task name, for the panel's warning column. */
export function issuesByTask(issues: TaskIssue[]): Map<string, TaskIssue[]> {
	const byTask = new Map<string, TaskIssue[]>()
	for (const issue of issues) {
		const list = byTask.get(issue.name) ?? []
		list.push(issue)
		byTask.set(issue.name, list)
	}
	return byTask
}

// ----- similar names -----

/**
 * Pairs whose normalized names are within typo distance: one edit for short
 * names, two otherwise (Damerau-Levenshtein, so a transposition is one).
 * Reported on both names. Names differing by more than two characters in
 * length are skipped before any distance is computed.
 */
export function similarNames(names: string[]): TaskIssue[] {
	const normalized = names.map(normalizeName)
	const issues: TaskIssue[] = []
	for (let a = 0; a < names.length; a++) {
		for (let b = a + 1; b < names.length; b++) {
			const left = normalized[a]!
			const right = normalized[b]!
			if (Math.abs(left.length - right.length) > 2) continue
			const allowed = Math.min(left.length, right.length) < 6 ? 1 : 2
			if (editDistance(left, right, allowed) <= allowed) {
				issues.push({ kind: 'similar-name', name: names[a]!, other: names[b]! })
				issues.push({ kind: 'similar-name', name: names[b]!, other: names[a]! })
			}
		}
	}
	return issues
}

function normalizeName(name: string): string {
	return name.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Optimal string alignment distance (Levenshtein plus adjacent
 * transpositions). Rows past `limit + 1` cannot come back under the limit,
 * so the loop stops early on hopeless pairs.
 */
export function editDistance(a: string, b: string, limit = Infinity): number {
	if (a === b) return 0
	const rows = a.length + 1
	const cols = b.length + 1
	let previous2: number[] = []
	let previous: number[] = Array.from({ length: cols }, (_, j) => j)
	for (let i = 1; i < rows; i++) {
		const current: number[] = [i]
		let rowMin = i
		for (let j = 1; j < cols; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1
			let value = Math.min(
				previous[j]! + 1,
				current[j - 1]! + 1,
				previous[j - 1]! + cost
			)
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				value = Math.min(value, previous2[j - 2]! + 1)
			}
			current.push(value)
			rowMin = Math.min(rowMin, value)
		}
		if (rowMin > limit) return rowMin
		previous2 = previous
		previous = current
	}
	return previous[cols - 1]!
}

// ----- long sessions -----

function longSessions(
	name: string,
	occurrences: VaultTaskOccurrence[]
): TaskIssue[] {
	const sessions = occurrences.flatMap(({ path, task }) =>
		task.clocks
			.filter((clock): clock is Clock & { end: Date } => clock.end !== null)
			.map((clock) => ({
				path,
				lineIndex: clock.lineIndex,
				start: clock.start,
				minutes: getMinutesBetween(clock.start, clock.end),
			}))
	)
	const usual =
		sessions.length >= MIN_SESSIONS_FOR_OUTLIER
			? median(sessions.map((session) => session.minutes)) *
				OUTLIER_MEDIAN_FACTOR
			: Infinity
	return sessions
		.filter(
			(session) =>
				session.minutes >= LONG_SESSION_MINUTES || session.minutes > usual
		)
		.map((session) => ({ kind: 'long-session', name, ...session }))
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b)
	const middle = Math.floor(sorted.length / 2)
	return sorted.length % 2
		? sorted[middle]!
		: (sorted[middle - 1]! + sorted[middle]!) / 2
}

// ----- tag drift -----

function tagDrift(
	name: string,
	occurrences: VaultTaskOccurrence[]
): TaskIssue[] {
	const sets = new Map<string, string[]>()
	for (const { task } of occurrences) {
		const sorted = [...task.tags].sort()
		sets.set(sorted.join(' '), sorted)
	}
	return sets.size > 1
		? [{ kind: 'tag-drift', name, tagSets: [...sets.values()] }]
		: []
}

// ----- clock overlaps -----

/**
 * Within each note, clocks of the task (across all its lines there) that
 * overlap an earlier one. Touching clocks are consecutive sessions, not an
 * overlap; running clocks are measured against nothing.
 */
function clockOverlaps(
	name: string,
	occurrences: VaultTaskOccurrence[]
): TaskIssue[] {
	const byPath = new Map<string, Clock[]>()
	for (const { path, task } of occurrences) {
		byPath.set(path, [...(byPath.get(path) ?? []), ...task.clocks])
	}
	const issues: TaskIssue[] = []
	for (const [path, clocks] of byPath) {
		const closed = clocks
			.filter((clock): clock is Clock & { end: Date } => clock.end !== null)
			.sort((a, b) => a.start.valueOf() - b.start.valueOf())
		let latestEnd: Date | null = null
		for (const clock of closed) {
			if (latestEnd && clock.start < latestEnd) {
				issues.push({
					kind: 'clock-overlap',
					name,
					path,
					lineIndex: clock.lineIndex,
					start: clock.start,
				})
			}
			if (!latestEnd || clock.end > latestEnd) latestEnd = clock.end
		}
	}
	return issues
}

// ----- stale running clocks -----

function staleClocks(
	name: string,
	occurrences: VaultTaskOccurrence[],
	now: Date
): TaskIssue[] {
	const today = startOfDay(now).valueOf()
	const issues: TaskIssue[] = []
	for (const { path, date, task } of occurrences) {
		if (startOfDay(date).valueOf() >= today) continue
		for (const clock of task.clocks) {
			if (clock.end === null) {
				issues.push({
					kind: 'stale-clock',
					name,
					path,
					lineIndex: clock.lineIndex,
					start: clock.start,
				})
			}
		}
	}
	return issues
}

// ----- clocks outside the day's window -----

/**
 * Clocks wholly before the note's wake time or wholly after its bed time:
 * by the plugin's own definition of a day they belong to another note (or
 * the times are wrong — only a human can tell, so this is jump-to-line
 * material). A boundary that is not recorded is not checked; touching one
 * is inside. A running clock can only be after bed.
 */
function outsideDay(
	name: string,
	occurrences: VaultTaskOccurrence[]
): TaskIssue[] {
	const issues: TaskIssue[] = []
	for (const { path, task, wakeTime, bedTime } of occurrences) {
		for (const clock of task.clocks) {
			const ref = { name, path, lineIndex: clock.lineIndex, start: clock.start }
			if (wakeTime && clock.end && clock.end < wakeTime) {
				issues.push({ kind: 'outside-day', side: 'before-wake', ...ref })
			} else if (bedTime && clock.start > bedTime) {
				issues.push({ kind: 'outside-day', side: 'after-bed', ...ref })
			}
		}
	}
	return issues
}
