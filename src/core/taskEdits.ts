import type { Task } from 'types/tasks'
import { parseTaskInput, parseTasks, TAG } from './parser'

export type DeleteResult = {
	content: string
	changed: boolean
	removedTaskLines: number
	removedClockLines: number
}

/** Remove every line of the task, clocks included. */
export function deleteTaskLines(content: string, name: string): DeleteResult {
	const lines = content.split('\n')
	const affected = parseTasks(lines).filter((task) => task.name === name)
	if (affected.length === 0) {
		return {
			content,
			changed: false,
			removedTaskLines: 0,
			removedClockLines: 0,
		}
	}
	const skip = new Set<number>()
	for (const task of affected) {
		for (let index = task.lineIndex; index < blockEnd(task); index++) {
			skip.add(index)
		}
	}
	return {
		content: lines.filter((_, index) => !skip.has(index)).join('\n'),
		changed: true,
		removedTaskLines: affected.length,
		removedClockLines: affected.reduce(
			(sum, task) => sum + task.clocks.length,
			0
		),
	}
}

/** Tags to add to and remove from every line of a task, applied together. */
export type TagChange = { add: string[]; remove: string[] }

/**
 * The change giving every line of a task exactly the `wanted` tags:
 * `current` is the union over the lines, and adding a tag only touches the
 * lines lacking it — so listing every wanted tag normalizes drift instead of
 * preserving it.
 */
export function diffTags(current: string[], wanted: string[]): TagChange {
	return {
		add: [...wanted],
		remove: current.filter((tag) => !wanted.includes(tag)),
	}
}

/** Whether the change alters this line's tags. */
export function tagChangeApplies(tags: string[], change: TagChange): boolean {
	return (
		change.add.some((tag) => !tags.includes(tag)) ||
		change.remove.some((tag) => tags.includes(tag))
	)
}

export type RetagResult = {
	content: string
	changed: boolean
	/** Task lines whose tags changed. */
	changedTaskLines: number
}

/**
 * Apply the tag change to every line of the task: removals strip the exact
 * tokens (never a tag they merely prefix) and tidy the spacing, additions
 * append the tags the line lacks.
 */
export function retagTaskLines(
	content: string,
	name: string,
	change: TagChange
): RetagResult {
	const lines = content.split('\n')
	let changedTaskLines = 0
	for (const task of parseTasks(lines)) {
		if (task.name !== name) continue
		const line = lines[task.lineIndex]!
		const next = retagLine(line, change)
		if (next !== line) {
			lines[task.lineIndex] = next
			changedTaskLines++
		}
	}
	return {
		content: changedTaskLines ? lines.join('\n') : content,
		changed: changedTaskLines > 0,
		changedTaskLines,
	}
}

/** `#tag` exactly, with the leading hash. */
export function isTag(text: string): boolean {
	const input = parseTaskInput(text)
	return input.name === '' && input.tags.length === 1 && input.tags[0] === text
}

const TASK_PREFIX = /^(\s*- \[[ xX]\] )(.*)$/

function retagLine(line: string, change: TagChange): string {
	const match = TASK_PREFIX.exec(line)
	if (!match) return line
	const [, prefix, rest] = match
	let text = rest!
	if (change.remove.length) {
		text = text
			.replace(TAG, (token) => (change.remove.includes(token) ? '' : token))
			.replace(/\s{2,}/g, ' ')
			.trim()
	}
	const present: string[] = text.match(TAG) ?? []
	const missing = change.add.filter((tag) => !present.includes(tag))
	if (missing.length) {
		text = `${text.trimEnd()} ${missing.join(' ')}`
	}
	return `${prefix}${text}`
}

function blockEnd(task: Task): number {
	const lastClock = task.clocks[task.clocks.length - 1]
	return (lastClock ? lastClock.lineIndex : task.lineIndex) + 1
}
