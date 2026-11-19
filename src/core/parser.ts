import type { Clock, Task } from 'types/tasks'
import { GOAL_KEY, parseGoal } from './goals'
import { formatLocalDateTime, parseLocalDateTime } from './time'

const TASK_LINE = /^(\s*)- \[([ xX])\] (.*)$/
const CLOCK_LINE = /^(\s*)\[clock::(.+?)(?:--(.+?))?\]\s*$/
const GOAL_LINE = new RegExp(String.raw`^\s*\[${GOAL_KEY}::(.*)\]\s*$`)
/** A tag token anywhere in a line (global: reset lastIndex or use match). */
export const TAG = /#[\p{L}\p{N}_/-]+/gu

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
 * Free text typed by the user, split like a task line would parse: the label
 * without tags, and the tags found anywhere in the text.
 */
export function parseTaskInput(text: string): { name: string; tags: string[] } {
	return { name: getTaskLabel(text), tags: getTaskTags(text) }
}

/**
 * Parse every task of a note. Clock and goal lines directly below a task, in
 * any order, belong to it; anywhere else they are ignored. A goal line that
 * does not read as a goal still belongs to the task, as a malformed one.
 * Line indexes are kept so the model can be written back by the note editor.
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
				goals: [],
				malformedGoals: [],
			}
			tasks.push(current)
			return
		}

		const clock = current ? parseClockLine(line, lineIndex) : null
		if (clock && current) {
			current.clocks.push(clock)
			return
		}

		const goalText = current ? GOAL_LINE.exec(line)?.[1] : undefined
		if (goalText !== undefined && current) {
			const parsed = parseGoal(goalText)
			if ('goal' in parsed) current.goals.push({ ...parsed.goal, lineIndex })
			else {
				current.malformedGoals.push({
					lineIndex,
					text: goalText,
					problem: parsed.problem,
				})
			}
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

/** Index of the first line after the task line and its clock and goal lines. */
export function taskBlockEnd(task: Task): number {
	return (
		Math.max(
			task.lineIndex,
			...task.clocks.map((clock) => clock.lineIndex),
			...task.goals.map((goal) => goal.lineIndex),
			...task.malformedGoals.map((goal) => goal.lineIndex)
		) + 1
	)
}

/** Line indexes of the task's goal lines, malformed ones included, in order. */
export function goalLineIndexes(task: Task): number[] {
	return [...task.goals, ...task.malformedGoals]
		.map((goal) => goal.lineIndex)
		.sort((a, b) => a - b)
}

export function formatClockLine(
	start: Date,
	end: Date | null,
	indent = DEFAULT_CLOCK_INDENT
): string {
	const endPart = end ? `--${formatLocalDateTime(end)}` : ''
	return `${indent}[clock::${formatLocalDateTime(start)}${endPart}]`
}

export function getIndent(line: string): string {
	return /^\s*/.exec(line)?.[0] ?? ''
}
