import type { Clock, ClockKey, ClockTimes, Task } from 'types/tasks'
import {
	DEFAULT_CLOCK_INDENT,
	formatClockLine,
	getIndent,
	parseTasks,
} from './parser'

export function isRunning(task: Task): boolean {
	return task.clocks.some((clock) => clock.end === null)
}

function getRunningClock(task: Task): Clock | undefined {
	return task.clocks.find((clock) => clock.end === null)
}

/** End of the most recently closed clock, or null when nothing was closed yet. */
export function getLastEnd(task: Task): Date | null {
	let last: Date | null = null
	for (const clock of task.clocks) {
		if (clock.end && (!last || clock.end > last)) last = clock.end
	}
	return last
}

/**
 * Editable representation of a note's lines. Every mutation invalidates the
 * parsed tasks, so callers must re-fetch a task (by name) after each change:
 * line indexes shift when lines are inserted or removed.
 */
export class TaskNote {
	private lines: string[]
	private parsed: Task[] | null = null

	constructor(content: string) {
		this.lines = content.split('\n')
	}

	get tasks(): Task[] {
		this.parsed ??= parseTasks(this.lines)
		return this.parsed
	}

	toString(): string {
		return this.lines.join('\n')
	}

	findTask(name: string): Task | undefined {
		return this.tasks.find((task) => task.name === name)
	}

	/** The clock with exactly these timestamps on a line of the named task. */
	findClock(key: ClockKey): Clock | undefined {
		for (const task of this.tasks) {
			if (task.name !== key.taskName) continue
			const clock = task.clocks.find(
				(c) =>
					c.start.valueOf() === key.start.valueOf() &&
					(c.end?.valueOf() ?? null) === (key.end?.valueOf() ?? null)
			)
			if (clock) return clock
		}
		return undefined
	}

	/** Rewrite a clock line with new timestamps, keeping its indent. */
	setClockTimes(clock: Clock, times: ClockTimes): void {
		const indent = getIndent(this.lines[clock.lineIndex]!)
		this.lines[clock.lineIndex] = formatClockLine(
			times.start,
			times.end,
			indent
		)
		this.invalidate()
	}

	getRunningTasks(): Task[] {
		return this.tasks.filter(isRunning)
	}

	/** Append an open clock line below the task's existing clocks. */
	startClock(task: Task, at: Date): void {
		if (isRunning(task)) {
			throw new Error(`Task "${task.name}" already has a running clock`)
		}
		this.addClock(task, at, null)
	}

	/** Append a clock line below the task's existing clocks. */
	addClock(task: Task, start: Date, end: Date | null): void {
		const insertAt = this.clockBlockEnd(task)
		const lastClock = task.clocks[task.clocks.length - 1]
		const indent = lastClock
			? getIndent(this.lines[lastClock.lineIndex]!)
			: DEFAULT_CLOCK_INDENT
		this.lines.splice(insertAt, 0, formatClockLine(start, end, indent))
		this.invalidate()
	}

	/** Add a clock line among the task's clocks, before the first later one. */
	insertClock(task: Task, start: Date, end: Date | null): void {
		const later = task.clocks.find((clock) => clock.start > start)
		if (!later) {
			this.addClock(task, start, end)
			return
		}
		const indent = getIndent(this.lines[later.lineIndex]!)
		this.lines.splice(later.lineIndex, 0, formatClockLine(start, end, indent))
		this.invalidate()
	}

	/** Remove one clock line. */
	removeClock(clock: Clock): void {
		this.lines.splice(clock.lineIndex, 1)
		this.invalidate()
	}

	/** Close the running clock of the task at the given time. */
	stopClock(task: Task, at: Date): void {
		const running = getRunningClock(task)
		if (!running) {
			throw new Error(`Task "${task.name}" has no running clock`)
		}
		const indent = getIndent(this.lines[running.lineIndex]!)
		this.lines[running.lineIndex] = formatClockLine(running.start, at, indent)
		this.invalidate()
	}

	setTicked(task: Task, ticked: boolean): void {
		const line = this.lines[task.lineIndex]!
		this.lines[task.lineIndex] = line.replace(
			/- \[[ xX]\]/,
			ticked ? '- [x]' : '- [ ]'
		)
		this.invalidate()
	}

	/** Move the last clock line of `from` below the clocks of `to`. */
	moveLastClock(from: Task, to: Task): void {
		const clock = from.clocks[from.clocks.length - 1]
		if (!clock) {
			throw new Error(`Task "${from.name}" has no clock to move`)
		}
		const [line] = this.lines.splice(clock.lineIndex, 1)
		let insertAt = this.clockBlockEnd(to)
		if (clock.lineIndex < insertAt) insertAt -= 1
		this.lines.splice(insertAt, 0, line!)
		this.invalidate()
	}

	/**
	 * Add an unticked task line after the last task's clock block (before any
	 * trailing blank lines when the note has no task yet) and return it. The
	 * name must not contain tags; they are passed separately.
	 */
	insertTask(name: string, tags: string[]): Task {
		const last = this.tasks[this.tasks.length - 1]
		let insertAt = last ? this.clockBlockEnd(last) : this.lines.length
		while (!last && insertAt > 0 && this.lines[insertAt - 1]!.trim() === '') {
			insertAt--
		}
		const suffix = tags.map((tag) => ` ${tag}`).join('')
		this.lines.splice(insertAt, 0, `- [ ] ${name}${suffix}`)
		this.invalidate()
		const task = this.findTask(name)
		if (!task) throw new Error(`Inserted task "${name}" did not parse back`)
		return task
	}

	/** Remove the task line and all its clock lines. */
	removeTask(task: Task): void {
		const count = this.clockBlockEnd(task) - task.lineIndex
		this.lines.splice(task.lineIndex, count)
		this.invalidate()
	}

	/**
	 * Move the task line and its clock lines right before or after the
	 * block of `other`. Lines between tasks (notes, subtasks) stay put.
	 */
	moveTask(task: Task, other: Task, side: 'before' | 'after'): void {
		if (task.name === other.name) return
		const target =
			side === 'before' ? other.lineIndex : this.clockBlockEnd(other)
		const block = this.lines.splice(
			task.lineIndex,
			this.clockBlockEnd(task) - task.lineIndex
		)
		const insertAt = target > task.lineIndex ? target - block.length : target
		this.lines.splice(insertAt, 0, ...block)
		this.invalidate()
	}

	/** Index of the first line after the task's clock block. */
	private clockBlockEnd(task: Task): number {
		const lastClock = task.clocks[task.clocks.length - 1]
		return (lastClock ? lastClock.lineIndex : task.lineIndex) + 1
	}

	private invalidate() {
		this.parsed = null
	}
}
