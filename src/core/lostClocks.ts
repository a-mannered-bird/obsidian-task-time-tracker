import type { Clock, Interval, Task } from 'types/tasks'
import { consolidateTasks } from './consolidate'
import { uncoveredIntervals } from './intervals'
import { TaskNote } from './note'
import { parseTasks } from './parser'
import { formatLocalDateTime } from './time'

/** A clock a note used to hold and no longer does. */
export type LostClock = {
	taskName: string
	/** Tags of the task line, to recreate it when it is gone too. */
	tags: string[]
	start: Date
	end: Date | null
}

const LISTED_CLOCKS = 3

/**
 * Clocks of `before` whose time `after` no longer tracks for the same task.
 * Time is what counts, not lines: a clock merged into a longer one, or a
 * running clock that was closed, is not lost.
 */
export function findLostClocks(before: Task[], after: Task[]): LostClock[] {
	const clocks = before.flatMap((task) =>
		task.clocks.map((clock) => ({
			taskName: task.name,
			tags: task.tags,
			start: clock.start,
			end: clock.end,
		}))
	)
	return stillLost(clocks, after)
}

/** The lost clocks the tasks still do not cover. */
export function stillLost(lost: LostClock[], tasks: Task[]): LostClock[] {
	return lost.filter((clock) => {
		const sameTask = tasks.filter((task) => task.name === clock.taskName)
		return !isCovered(
			clock,
			sameTask.flatMap((task) => task.clocks)
		)
	})
}

function isCovered(lost: LostClock, clocks: Clock[]): boolean {
	const { start, end } = lost
	if (end === null) {
		return clocks.some(
			(clock) =>
				clock.start <= start && (clock.end === null || clock.end > start)
		)
	}
	// A running clock covers everything from its start on.
	const intervals: Interval[] = clocks.map((clock) => ({
		start: clock.start,
		end: clock.end ?? new Date(Math.max(end.valueOf(), clock.start.valueOf())),
	}))
	return uncoveredIntervals(intervals, { start, end }).length === 0
}

/**
 * The note with the lost clocks back under their task (recreated at the end
 * when it is gone), unioned with the clocks already there. Clocks the note
 * covers again are skipped, so restoring twice changes nothing.
 */
export function restoreLostClocks(content: string, lost: LostClock[]): string {
	const note = new TaskNote(content)
	const names = new Set<string>()
	for (const clock of stillLost(lost, note.tasks)) {
		const task =
			note.findTask(clock.taskName) ??
			note.insertTask(clock.taskName, clock.tags)
		note.addClock(task, clock.start, clock.end)
		names.add(clock.taskName)
	}
	let restored = note.toString()
	for (const name of names) {
		restored = consolidateTasks(restored, [], name).content
	}
	return restored
}

/** Text of the notice offering to restore the clocks. */
export function describeLostClocks(
	noteName: string,
	lost: LostClock[]
): string {
	const count = lost.length === 1 ? '1 clock' : `${lost.length} clocks`
	const listed = lost.slice(0, LISTED_CLOCKS).map(describeClock)
	const more = lost.length - listed.length
	if (more > 0) listed.push(`and ${more} more`)
	return `${count} disappeared from ${noteName} in a change made outside the editor, such as a sync: ${listed.join(', ')}.`
}

function describeClock(clock: LostClock): string {
	const time = (date: Date) =>
		formatLocalDateTime(date).split('T')[1]!.slice(0, 5)
	const span = clock.end
		? `${time(clock.start)}–${time(clock.end)}`
		: `running since ${time(clock.start)}`
	return `"${clock.taskName}" ${span}`
}

/**
 * Follows the changes of the daily notes and keeps, per note, the clocks
 * that vanished in a change neither the plugin nor the user made — in
 * practice a sync that reconciled two versions of the note badly.
 */
export class LostClockTracker {
	private acknowledged = new Map<string, Task[]>()
	private pending = new Map<string, LostClock[]>()

	/** The plugin wrote this content itself: what it removed is not lost. */
	acknowledge(path: string, content: string) {
		this.acknowledged.set(path, parseTasks(content.split('\n')))
	}

	/**
	 * A note went from `previous` (null when unknown; `mtime` is the file's
	 * back then) to `current`. Returns every clock of the note still waiting
	 * to be restored: the ones lost earlier, minus those that came back, plus
	 * the ones lost now. `lastUserEdit` (epoch ms) is when the user last
	 * changed the note in an editor: newer than the previous file, the edit
	 * was still unsaved, so this change is the user's own and loses nothing.
	 */
	noteChanged(
		path: string,
		previous: { tasks: Task[]; mtime: number } | null,
		current: Task[],
		lastUserEdit?: number
	): LostClock[] {
		const before = this.acknowledged.get(path) ?? previous?.tasks
		this.acknowledged.delete(path)
		const byUser =
			lastUserEdit !== undefined &&
			previous !== null &&
			lastUserEdit > previous.mtime

		const lost = stillLost(this.pending.get(path) ?? [], current)
		if (before && !byUser) {
			const known = new Set(lost.map(clockKey))
			for (const clock of findLostClocks(before, current)) {
				if (!known.has(clockKey(clock))) lost.push(clock)
			}
		}
		if (lost.length > 0) this.pending.set(path, lost)
		else this.pending.delete(path)
		return lost
	}

	/** The note's lost clocks were restored or dismissed, or the note is gone. */
	forget(path: string) {
		this.pending.delete(path)
		this.acknowledged.delete(path)
	}
}

function clockKey(clock: LostClock): string {
	return `${clock.taskName}|${clock.start.valueOf()}|${clock.end?.valueOf() ?? ''}`
}
