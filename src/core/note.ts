import type { Goal } from 'types/goals'
import type { Clock, ClockKey, ClockTimes, Task } from 'types/tasks'
import { formatGoalLine, targetOnly } from './goals'
import {
	DEFAULT_CLOCK_INDENT,
	formatClockLine,
	getIndent,
	goalLineIndexes,
	parseTasks,
	taskBlockEnd,
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
 * The task's clock lines sorted by start, or null when they already are. A
 * running clock is placed by its start like any other: it normally started
 * last, so it stays at the bottom, and the last line stays the latest clock,
 * which migrating the last clock relies on. Equal starts keep their order.
 */
export function chronologicalClockLines(
	lines: readonly string[],
	task: Task
): string[] | null {
	const sorted = [...task.clocks].sort(
		(a, b) => a.start.valueOf() - b.start.valueOf()
	)
	if (sorted.every((clock, index) => clock === task.clocks[index])) return null
	return sorted.map((clock) => lines[clock.lineIndex]!)
}

/**
 * Editable representation of a note's lines. Every mutation invalidates the
 * parsed tasks, so callers must re-fetch a task (by name) after each change:
 * line indexes shift when lines are inserted or removed. Edits to a task
 * leave its block in order: goal lines first, as written, then the clocks
 * by start.
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
		this.normalizeBlockOfLine(clock.lineIndex)
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
		const insertAt = taskBlockEnd(task)
		const sibling =
			task.clocks[task.clocks.length - 1]?.lineIndex ?? goalLineIndexes(task)[0]
		const indent =
			sibling === undefined
				? DEFAULT_CLOCK_INDENT
				: getIndent(this.lines[sibling]!)
		this.lines.splice(insertAt, 0, formatClockLine(start, end, indent))
		this.invalidate()
		this.normalizeBlock(task.lineIndex)
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
		this.normalizeBlock(task.lineIndex)
	}

	/** Remove one clock line. */
	removeClock(clock: Clock): void {
		const owner = this.ownerOfClockLine(clock.lineIndex)
		this.lines.splice(clock.lineIndex, 1)
		this.invalidate()
		if (owner) this.normalizeBlock(owner.lineIndex)
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
		this.normalizeBlock(task.lineIndex)
	}

	setTicked(task: Task, ticked: boolean): void {
		const line = this.lines[task.lineIndex]!
		this.lines[task.lineIndex] = line.replace(
			/- \[[ xX]\]/,
			ticked ? '- [x]' : '- [ ]'
		)
		this.invalidate()
		this.normalizeBlock(task.lineIndex)
	}

	/** Move the last clock line of `from` below the clocks of `to`. */
	moveLastClock(from: Task, to: Task): void {
		const clock = from.clocks[from.clocks.length - 1]
		if (!clock) {
			throw new Error(`Task "${from.name}" has no clock to move`)
		}
		const [line] = this.lines.splice(clock.lineIndex, 1)
		let insertAt = taskBlockEnd(to)
		if (clock.lineIndex < insertAt) insertAt -= 1
		this.lines.splice(insertAt, 0, line!)
		this.invalidate()
		this.normalizeBlock(
			clock.lineIndex < to.lineIndex ? to.lineIndex - 1 : to.lineIndex
		)
	}

	/**
	 * Add an unticked task line after the last task's block (before any
	 * trailing blank lines when the note has no task yet) and return it. The
	 * name must not contain tags; they are passed separately. `goals` are
	 * carried over from an earlier day: their targets only are written.
	 */
	insertTask(name: string, tags: string[], goals: Goal[] = []): Task {
		const last = this.tasks[this.tasks.length - 1]
		let insertAt = last ? taskBlockEnd(last) : this.lines.length
		while (!last && insertAt > 0 && this.lines[insertAt - 1]!.trim() === '') {
			insertAt--
		}
		const suffix = tags.map((tag) => ` ${tag}`).join('')
		this.lines.splice(
			insertAt,
			0,
			`- [ ] ${name}${suffix}`,
			...goals.map((goal) =>
				formatGoalLine(targetOnly(goal), DEFAULT_CLOCK_INDENT)
			)
		)
		this.invalidate()
		const task = this.findTask(name)
		if (!task) throw new Error(`Inserted task "${name}" did not parse back`)
		return task
	}

	/** Add a goal line below the task's other goal lines, indented like them. */
	addGoal(task: Task, goal: Goal): void {
		const goalLines = goalLineIndexes(task)
		const last = goalLines[goalLines.length - 1]
		const sibling = goalLines[0] ?? task.clocks[0]?.lineIndex
		const indent =
			sibling === undefined
				? DEFAULT_CLOCK_INDENT
				: getIndent(this.lines[sibling]!)
		this.lines.splice(
			(last ?? task.lineIndex) + 1,
			0,
			formatGoalLine(goal, indent)
		)
		this.invalidate()
		this.normalizeBlock(task.lineIndex)
	}

	/** Rewrite the goal line at this index, keeping its indent. */
	setGoal(lineIndex: number, goal: Goal): void {
		const owner = this.ownerOfGoalLine(lineIndex)
		this.lines[lineIndex] = formatGoalLine(
			goal,
			getIndent(this.lines[lineIndex]!)
		)
		this.invalidate()
		if (owner) this.normalizeBlock(owner.lineIndex)
	}

	/** Remove the goal line at this index. */
	removeGoal(lineIndex: number): void {
		const owner = this.ownerOfGoalLine(lineIndex)
		this.lines.splice(lineIndex, 1)
		this.invalidate()
		if (owner) this.normalizeBlock(owner.lineIndex)
	}

	/** Remove the task line and all its clock and goal lines. */
	removeTask(task: Task): void {
		const count = taskBlockEnd(task) - task.lineIndex
		this.lines.splice(task.lineIndex, count)
		this.invalidate()
	}

	/**
	 * Move the task line and its clock and goal lines right before or after
	 * the block of `other`. Lines between tasks (notes, subtasks) stay put.
	 */
	moveTask(task: Task, other: Task, side: 'before' | 'after'): void {
		if (task.name === other.name) return
		const target = side === 'before' ? other.lineIndex : taskBlockEnd(other)
		const block = this.lines.splice(
			task.lineIndex,
			taskBlockEnd(task) - task.lineIndex
		)
		const insertAt = target > task.lineIndex ? target - block.length : target
		this.lines.splice(insertAt, 0, ...block)
		this.invalidate()
	}

	/**
	 * Put the block of the task on this line in order: goal lines first, in
	 * the order written (a hand-written one below the clocks moves up), then
	 * the clocks by start.
	 */
	private normalizeBlock(taskLineIndex: number): void {
		const task = this.tasks.find((t) => t.lineIndex === taskLineIndex)
		if (!task) return
		const start = task.lineIndex + 1
		const current = this.lines.slice(start, taskBlockEnd(task))
		const ordered = [
			...goalLineIndexes(task).map((index) => this.lines[index]!),
			...(chronologicalClockLines(this.lines, task) ??
				task.clocks.map((clock) => this.lines[clock.lineIndex]!)),
		]
		if (ordered.every((line, index) => line === current[index])) return
		this.lines.splice(start, ordered.length, ...ordered)
		this.invalidate()
	}

	private ownerOfClockLine(clockLineIndex: number): Task | undefined {
		return this.tasks.find((task) =>
			task.clocks.some((clock) => clock.lineIndex === clockLineIndex)
		)
	}

	private ownerOfGoalLine(goalLineIndex: number): Task | undefined {
		return this.tasks.find((task) =>
			goalLineIndexes(task).includes(goalLineIndex)
		)
	}

	/** Put the block of the task owning this clock line in order. */
	private normalizeBlockOfLine(clockLineIndex: number): void {
		const owner = this.ownerOfClockLine(clockLineIndex)
		if (owner) this.normalizeBlock(owner.lineIndex)
	}

	private invalidate() {
		this.parsed = null
	}
}
