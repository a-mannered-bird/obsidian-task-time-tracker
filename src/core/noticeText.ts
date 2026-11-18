/** The emoji each kind of notice starts with. */
export const NOTICE_ICON = {
	start: '▶️',
	stop: '⏹️',
	switch: '🔀',
	done: '✅',
	edit: '✏️',
	add: '➕',
	remove: '🗑️',
	move: '⤴️',
	join: '🔗',
	dayStart: '🌅',
	dayEnd: '🌇',
	dayEnded: '🌙',
	undone: '↩️',
	restored: '♻️',
	updated: '📝',
	progress: '⏳',
	reload: '🔄',
	info: 'ℹ️',
	warning: '⚠️',
} as const

/*
 * Notice texts stay plain strings, so they can be joined, reused in a
 * prompt and compared in tests. A task name is wrapped in private-use
 * characters, which no typed name holds, for the notice to show it bold.
 */
const TASK_OPEN = '\uE000'
const TASK_CLOSE = '\uE001'
const TASK_NAME = new RegExp(
	`${TASK_OPEN}([^${TASK_CLOSE}]*)${TASK_CLOSE}`,
	'g'
)

/** A task name inside a notice text. */
export function noticeTask(name: string): string {
	return `${TASK_OPEN}${name}${TASK_CLOSE}`
}

export type NoticeSegment = { text: string; isTask: boolean }

/** The text cut into plain runs and quoted task names, in order. */
export function noticeSegments(text: string): NoticeSegment[] {
	const segments: NoticeSegment[] = []
	let last = 0
	for (const match of text.matchAll(TASK_NAME)) {
		if (match.index > last) {
			segments.push({ text: text.slice(last, match.index), isTask: false })
		}
		segments.push({ text: `"${match[1] ?? ''}"`, isTask: true })
		last = match.index + match[0].length
	}
	if (last < text.length)
		segments.push({ text: text.slice(last), isTask: false })
	return segments
}

/** The text as it reads without formatting, task names in quotes. */
export function plainNoticeText(text: string): string {
	return noticeSegments(text)
		.map((segment) => segment.text)
		.join('')
}
