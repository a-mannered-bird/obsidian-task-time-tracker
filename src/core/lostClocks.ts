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

/** The user's last change of a note in an editor. */
export type EditorEdit = {
	/** When it happened, epoch ms. */
	at: number
	/** The note as the editor held it right after. */
	content: () => string
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
	/**
	 * Per note, the plugin's own writes whose change was not seen yet, oldest
	 * first. A list, not the last one: two writes in a row can both land
	 * before the first one's change comes in, and that change must then not
	 * be measured against the second write.
	 */
	private acknowledged = new Map<string, Task[][]>()
	private pending = new Map<string, LostClock[]>()

	/** The plugin wrote this content itself: what it removed is not lost. */
	acknowledge(path: string, content: string) {
		const writes = this.acknowledged.get(path) ?? []
		writes.push(parseTasks(content.split('\n')))
		this.acknowledged.set(path, writes)
	}

	/**
	 * What the change is measured against: nothing when the note holds one
	 * of the plugin's writes (the change is that write's), else the plugin's
	 * last write, else the previous state. Writes up to the one matched are
	 * done with.
	 */
	private baseline(
		path: string,
		previous: Task[] | null,
		current: Task[]
	): Task[] | null {
		const writes = this.acknowledged.get(path) ?? []
		const own = writes.findIndex((written) => sameTasks(written, current))
		const rest = own >= 0 ? writes.slice(own + 1) : []
		if (rest.length > 0) this.acknowledged.set(path, rest)
		else this.acknowledged.delete(path)
		if (own >= 0) return null
		return writes[writes.length - 1] ?? previous
	}

	/**
	 * A note went from `previous` (null when unknown; `mtime` is the file's
	 * as stamped when the store took it in) to `current`. Returns every clock
	 * of the note still waiting to be restored: the ones lost earlier, minus
	 * those that came back, plus the ones lost now. `userEdit` is the user's
	 * last change in an editor; this change is the user's own and loses
	 * nothing when it saves what the editor held then, or when the edit is
	 * newer than the previous file (it was still unsaved). The content test
	 * is the one to trust: changes can come in late, after a newer write
	 * already stamped the previous state with its own, later mtime.
	 */
	noteChanged(
		path: string,
		previous: { tasks: Task[]; mtime: number } | null,
		current: Task[],
		userEdit?: EditorEdit
	): LostClock[] {
		const before = this.baseline(path, previous?.tasks ?? null, current)
		const byUser =
			userEdit !== undefined &&
			((previous !== null && userEdit.at > previous.mtime) ||
				sameTasks(parseTasks(userEdit.content().split('\n')), current))

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

/** Same tasks, tags, ticks and clocks, in the same order. */
function sameTasks(a: Task[], b: Task[]): boolean {
	const key = (tasks: Task[]) =>
		JSON.stringify(
			tasks.map((task) => [
				task.name,
				task.ticked,
				task.tags,
				task.clocks.map((clock) => [
					clock.start.valueOf(),
					clock.end?.valueOf() ?? null,
				]),
			])
		)
	return key(a) === key(b)
}

function clockKey(clock: LostClock): string {
	return `${clock.taskName}|${clock.start.valueOf()}|${clock.end?.valueOf() ?? ''}`
}
