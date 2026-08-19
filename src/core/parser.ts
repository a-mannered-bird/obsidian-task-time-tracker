import type { Clock, Task } from 'types/tasks'
import { formatLocalDateTime, parseLocalDateTime } from './time'

const TASK_LINE = /^(\s*)- \[([ xX])\] (.*)$/
const CLOCK_LINE = /^(\s*)\[clock::(.+?)(?:--(.+?))?\]\s*$/
const TAG = /#[\p{L}\p{N}_/-]+/gu

export const DEFAULT_CLOCK_INDENT = '      '

/** Label of a task line: no checkbox, no tags, collapsed whitespace. */
export function getTaskLabel(line: string): string {
	const match = TASK_LINE.exec(line)
	const text = match ? match[3]! : line
	return text.replace(TAG, '').replace(/\s+/g, ' ').trim()
}

function getTaskTags(line: string): string[] {
	return line.match(TAG) ?? []
}

/**
 * Parse every task of a note. Clock lines directly below a task belong to it;
 * clock lines anywhere else are ignored. Line indexes are kept so the model
 * can be written back by the note editor.
 */
export function parseTasks(lines: string[]): Task[] {
	const tasks: Task[] = []
	let current: Task | null = null

	lines.forEach((line, lineIndex) => {
		const taskMatch = TASK_LINE.exec(line)
		if (taskMatch) {
			current = {
				name: getTaskLabel(line),
				tags: getTaskTags(line),
				ticked: taskMatch[2] !== ' ',
				lineIndex,
				clocks: [],
			}
			tasks.push(current)
			return
		}

		const clock = current ? parseClockLine(line, lineIndex) : null
		if (clock && current) {
			current.clocks.push(clock)
			return
		}

		current = null
	})

	return tasks
}

function parseClockLine(line: string, lineIndex: number): Clock | null {
	const match = CLOCK_LINE.exec(line)
	if (!match) return null
	const start = parseLocalDateTime(match[2]!)
	if (!start) return null
	const end = match[3] === undefined ? null : parseLocalDateTime(match[3])
	// A closing timestamp that does not parse is treated as invalid line.
	if (match[3] !== undefined && !end) return null
	return { start, end, lineIndex }
}

export function formatClockLine(
	start: Date,
	end: Date | null,
	indent = DEFAULT_CLOCK_INDENT
): string {
	const endPart = end ? `--${formatLocalDateTime(end)}` : ''
	return `${indent}[clock::${formatLocalDateTime(start)}${endPart}]`
}
