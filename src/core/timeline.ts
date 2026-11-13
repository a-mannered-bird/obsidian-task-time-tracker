import type {
	ClockKey,
	ClockTimes,
	FinishedClockTimes,
	Task,
} from 'types/tasks'
import { TaskNote } from './note'
import { addDays } from './dailyNotes'
import { startOfDay } from './ranges'
import {
	formatClockMinutes,
	formatHoursMinutes,
	getMinutesBetween,
} from './time'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

/** One clock line drawn on the timeline. */
export type TimelineBlock = {
	/** Unique within the note; predictable from the task name and start. */
	id: string
	/** The clock line as read, to find it again when writing. */
	key: ClockKey
	tags: string[]
	lineIndex: number
	start: Date
	/** Drawn end: now while the clock runs. */
	end: Date
	running: boolean
}

export function blockId(taskName: string, start: Date): string {
	return `${taskName}|${start.valueOf()}`
}

/** Every clock of the note as a block, in start order. */
export function timelineBlocks(tasks: Task[], now: Date): TimelineBlock[] {
	const blocks: TimelineBlock[] = []
	const seen = new Map<string, number>()
	for (const task of tasks) {
		for (const clock of task.clocks) {
			const base = blockId(task.name, clock.start)
			// Duplicated lines share task and start; keep their ids apart.
			const count = seen.get(base) ?? 0
			seen.set(base, count + 1)
			blocks.push({
				id: count ? `${base}#${count}` : base,
				key: { taskName: task.name, start: clock.start, end: clock.end },
				tags: task.tags,
				lineIndex: clock.lineIndex,
				start: clock.start,
				end: clock.end ?? now,
				running: clock.end === null,
			})
		}
	}
	return blocks.sort((a, b) => a.start.valueOf() - b.start.valueOf())
}

// ----- layout -----

type Span = { id: string; start: Date; end: Date }

/** Horizontal slot of a block: `span` columns from `column`, out of `columns`. */
export type BlockPlacement = { column: number; span: number; columns: number }

const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end

/**
 * Calendar layout: blocks overlapping each other, directly or through a
 * chain, share the width in columns; each takes the leftmost column free at
 * its start, then widens over the columns to its right that stay free for
 * its whole span. Touching blocks do not overlap.
 */
export function layoutBlocks(spans: Span[]): Map<string, BlockPlacement> {
	const sorted = [...spans].sort(
		(a, b) =>
			a.start.valueOf() - b.start.valueOf() ||
			b.end.valueOf() -
				b.start.valueOf() -
				(a.end.valueOf() - a.start.valueOf())
	)
	const placements = new Map<string, BlockPlacement>()
	let cluster: Span[] = []
	let clusterEnd = 0

	const flush = () => {
		const columnEnds: number[] = []
		const columnOf = new Map<Span, number>()
		for (const span of cluster) {
			let column = columnEnds.findIndex((end) => end <= span.start.valueOf())
			if (column === -1) column = columnEnds.length
			columnEnds[column] = span.end.valueOf()
			columnOf.set(span, column)
		}
		const columns = columnEnds.length
		for (const span of cluster) {
			const column = columnOf.get(span)!
			let width = 1
			while (
				column + width < columns &&
				!cluster.some(
					(other) =>
						columnOf.get(other) === column + width && overlaps(span, other)
				)
			) {
				width++
			}
			placements.set(span.id, { column, span: width, columns })
		}
		cluster = []
	}

	for (const span of sorted) {
		if (cluster.length && span.start.valueOf() >= clusterEnd) flush()
		cluster.push(span)
		clusterEnd = Math.max(clusterEnd, span.end.valueOf())
	}
	if (cluster.length) flush()
	return placements
}

/** Blocks overlapping another block of the same task (time counted twice). */
export function sameTaskOverlaps(blocks: TimelineBlock[]): Set<string> {
	const flagged = new Set<string>()
	for (const [index, block] of blocks.entries()) {
		for (const other of blocks.slice(index + 1)) {
			if (other.key.taskName === block.key.taskName && overlaps(block, other)) {
				flagged.add(block.id)
				flagged.add(other.id)
			}
		}
	}
	return flagged
}

// ----- axis -----

export type TimelineAxis = { start: Date; end: Date }

/**
 * The note's day, stretched to whole hours around `marks` (clocks, start and
 * end of day) that fall outside it, but never more than a day either way: a clock
 * with a mistyped date would otherwise stretch it over months.
 */
export function timelineAxis(day: Date, marks: Date[]): TimelineAxis {
	const dayStart = startOfDay(day)
	const dayEnd = addDays(dayStart, 1)
	const limitStart = addDays(dayStart, -1)
	const limitEnd = addDays(dayStart, 2)
	let start = dayStart
	let end = dayEnd
	for (const mark of marks) {
		if (mark < start && mark >= limitStart) start = mark
		if (mark > end && mark <= limitEnd) end = mark
	}
	return { start: floorToHour(start), end: ceilToHour(end) }
}

function floorToHour(date: Date): Date {
	const floored = new Date(date)
	floored.setMinutes(0, 0, 0)
	return floored
}

function ceilToHour(date: Date): Date {
	const floored = floorToHour(date)
	return floored < date ? new Date(floored.valueOf() + HOUR) : floored
}

/** Where the timeline opens: now on today's note, else the start of day, else the first clock. */
export function initialScrollTime(
	day: Date,
	now: Date,
	dayStart: Date | null,
	blocks: TimelineBlock[]
): Date | null {
	if (startOfDay(day).valueOf() === startOfDay(now).valueOf()) return now
	return dayStart ?? blocks[0]?.start ?? null
}

/**
 * Range the Fit button shows: start to end of day, else the first to the last clock.
 * A end of day still ahead is only planned, so the range then ends with the
 * last clock (now while one runs), or now when nothing is logged yet.
 */
export function fitRange(
	dayStart: Date | null,
	dayEnd: Date | null,
	blocks: TimelineBlock[],
	now: Date
): TimelineAxis | null {
	const lastEnd = blocks.length
		? new Date(Math.max(...blocks.map((block) => block.end.valueOf())))
		: null
	if (dayStart && dayEnd && dayEnd > dayStart) {
		const end = dayEnd > now ? (lastEnd ?? now) : dayEnd
		return { start: dayStart, end: end > dayStart ? end : dayEnd }
	}
	if (!lastEnd) return null
	return { start: blocks[0]!.start, end: lastEnd }
}

// ----- zoom -----

/** Zoom is a scale in pixels per hour. */
export const ZOOM_MIN = 30
export const ZOOM_MAX = 600
export const ZOOM_DEFAULT = 60

export function clampZoom(pxPerHour: number): number {
	if (!Number.isFinite(pxPerHour)) return ZOOM_DEFAULT
	return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pxPerHour))
}

/** Snap step at a zoom: coarse when a minute is too small to aim at. */
export function snapStepMinutes(pxPerHour: number): number {
	if (pxPerHour < 120) return 15
	if (pxPerHour < 360) return 5
	return 1
}

// ----- dragging -----

/** What a drag holds: the whole block, or one of its edges. */
export type DragEdge = 'move' | 'start' | 'end'

export type SnapOptions = {
	stepMinutes: number
	/** Times an edge sticks to exactly when it comes within `magnetMs`. */
	magnets: Date[]
	magnetMs: number
	/** No grid and no magnets: whole minutes only (Alt held). */
	free: boolean
	now: Date
}

/**
 * Snap targets for a block being dragged: the other blocks' edges, now, and
 * the start and end of day when recorded.
 */
export function magnetsFor(
	blocks: TimelineBlock[],
	draggedId: string,
	extra: (Date | null)[]
): Date[] {
	const magnets = blocks
		.filter((block) => block.id !== draggedId)
		.flatMap((block) => [block.start, block.end])
	for (const date of extra) if (date) magnets.push(date)
	return magnets
}

/**
 * The clock's times after dragging `edge` by `deltaMs`. The moved edges
 * snap (magnet first, then the grid); a move keeps the duration and snaps
 * whichever edge lands on a magnet, else the start. Untouched edges keep
 * their seconds. A running clock counts as ending now: moving it or its end
 * finishes it (see `constrain`).
 */
export function dragTimes(
	original: ClockTimes,
	edge: DragEdge,
	deltaMs: number,
	options: SnapOptions
): ClockTimes {
	const shift = (date: Date) => new Date(date.valueOf() + deltaMs)
	if (edge === 'start') {
		return constrain(
			original,
			edge,
			{ start: snap(shift(original.start), options), end: original.end },
			options
		)
	}
	if (edge === 'end') {
		const end = original.end ?? options.now
		return constrain(
			original,
			edge,
			{ start: original.start, end: snap(shift(end), options) },
			options
		)
	}
	const start = shift(original.start)
	const end = shift(original.end ?? options.now)
	const correction = moveCorrection(start, end, options)
	return constrain(
		original,
		edge,
		{
			start: new Date(start.valueOf() + correction),
			end: new Date(end.valueOf() + correction),
		},
		options
	)
}

function moveCorrection(start: Date, end: Date, options: SnapOptions) {
	if (options.free) return roundToMinute(start).valueOf() - start.valueOf()
	const toStart = magnetFor(start, options)
	const toEnd = magnetFor(end, options)
	const startPull = toStart && toStart.valueOf() - start.valueOf()
	const endPull = toEnd && toEnd.valueOf() - end.valueOf()
	if (
		startPull !== null &&
		(endPull === null || Math.abs(startPull) <= Math.abs(endPull))
	) {
		return startPull
	}
	if (endPull !== null) return endPull
	return toGrid(start, options.stepMinutes).valueOf() - start.valueOf()
}

function snap(date: Date, options: SnapOptions): Date {
	if (options.free) return roundToMinute(date)
	return magnetFor(date, options) ?? toGrid(date, options.stepMinutes)
}

function magnetFor(date: Date, options: SnapOptions): Date | null {
	let best: Date | null = null
	let bestDistance = options.magnetMs
	for (const magnet of options.magnets) {
		const distance = Math.abs(magnet.valueOf() - date.valueOf())
		if (distance <= bestDistance) {
			best = magnet
			bestDistance = distance
		}
	}
	return best
}

function roundToMinute(date: Date): Date {
	return new Date(Math.round(date.valueOf() / MINUTE) * MINUTE)
}

/** Minutes since the local midnight, as a fraction (keeps the seconds). */
function minutesOfDay(date: Date): number {
	return (date.valueOf() - startOfDay(date).valueOf()) / MINUTE
}

function atMinutesOfDay(day: Date, minutes: number): Date {
	return new Date(startOfDay(day).valueOf() + minutes * MINUTE)
}

/** Nearest grid line; the grid counts from the local midnight. */
function toGrid(date: Date, stepMinutes: number): Date {
	const minutes = Math.round(minutesOfDay(date) / stepMinutes) * stepMinutes
	return atMinutesOfDay(date, minutes)
}

/**
 * A block never gets shorter than one step (never zero-length), and a
 * running clock's start never passes now. A running clock moved or ended
 * before now is finished there; one that would end at now or later is left
 * running as it was, since time not yet worked cannot be clocked.
 */
function constrain(
	original: ClockTimes,
	edge: DragEdge,
	proposed: ClockTimes,
	options: SnapOptions
): ClockTimes {
	const minimum = (options.free ? 1 : options.stepMinutes) * MINUTE
	if (edge === 'start') {
		const end = original.end ?? options.now
		const latest = end.valueOf() - minimum
		return proposed.start.valueOf() > latest
			? { start: new Date(latest), end: original.end }
			: proposed
	}
	let constrained = proposed
	if (edge === 'end' && proposed.end) {
		const earliest = original.start.valueOf() + minimum
		if (proposed.end.valueOf() < earliest) {
			constrained = { start: original.start, end: new Date(earliest) }
		}
	}
	const reachesNow = !constrained.end || constrained.end >= options.now
	return original.end === null && reachesNow ? original : constrained
}

/**
 * Keyboard nudge: the edge (both for a move) goes to the next grid line in
 * that direction, with the same limits as a drag but no magnets.
 */
export function nudgeTimes(
	original: ClockTimes,
	edge: DragEdge,
	direction: 1 | -1,
	stepMinutes: number,
	now: Date
): ClockTimes {
	const options: SnapOptions = {
		stepMinutes,
		magnets: [],
		magnetMs: 0,
		free: false,
		now,
	}
	const from = edge === 'end' ? (original.end ?? now) : original.start
	const deltaMs =
		nextGridLine(from, stepMinutes, direction).valueOf() - from.valueOf()
	const shift = (date: Date) => new Date(date.valueOf() + deltaMs)
	const proposed: ClockTimes =
		edge === 'start'
			? { start: shift(original.start), end: original.end }
			: edge === 'end'
				? { start: original.start, end: shift(from) }
				: {
						start: shift(original.start),
						end: shift(original.end ?? now),
					}
	return constrain(original, edge, proposed, options)
}

function nextGridLine(
	date: Date,
	stepMinutes: number,
	direction: 1 | -1
): Date {
	const minutes = minutesOfDay(date) / stepMinutes
	const line =
		direction === 1
			? (Math.floor(minutes) + 1) * stepMinutes
			: (Math.ceil(minutes) - 1) * stepMinutes
	return atMinutesOfDay(date, line)
}

export function sameTimes(a: ClockTimes, b: ClockTimes): boolean {
	return (
		a.start.valueOf() === b.start.valueOf() &&
		(a.end?.valueOf() ?? null) === (b.end?.valueOf() ?? null)
	)
}

// ----- writing -----

/** The note with one clock line retimed; null when that clock is gone. */
export function retimeClock(
	content: string,
	key: ClockKey,
	times: ClockTimes
): string | null {
	const note = new TaskNote(content)
	const clock = note.findClock(key)
	if (!clock) return null
	note.setClockTimes(clock, times)
	return note.toString()
}

/**
 * The clock drawn by dragging over empty space from `anchor` to `pointer`,
 * either way: both ends snap like a dragged edge, the clock is at least one
 * step long, and it never reaches past now (time not yet worked). Null when
 * nothing that long fits before now.
 */
export function drawnTimes(
	anchor: Date,
	pointer: Date,
	options: SnapOptions
): FinishedClockTimes | null {
	const minimum = (options.free ? 1 : options.stepMinutes) * MINUTE
	const from = snap(anchor, options).valueOf()
	const to = snap(pointer, options).valueOf()
	let start = Math.min(from, to)
	let end = Math.max(from, to)
	if (end - start < minimum) {
		if (to < from) start = end - minimum
		else end = start + minimum
	}
	end = Math.min(end, options.now.valueOf())
	if (end - start < minimum) return null
	return { start: new Date(start), end: new Date(end) }
}

/** A task to give a new clock: found by name, or added with these tags. */
export type ClockTarget = { name: string; tags: string[] }

/**
 * The note with a finished clock for the task, placed among its clocks in
 * time order; the task line is added after the last task when missing.
 */
export function addClock(
	content: string,
	target: ClockTarget,
	times: ClockTimes
): string {
	const note = new TaskNote(content)
	const task =
		note.findTask(target.name) ?? note.insertTask(target.name, target.tags)
	note.insertClock(task, times.start, times.end)
	return note.toString()
}

/**
 * The note without the clock, and without its task line too when
 * `dropEmptyTask` and the task has no clock left: undoing `addClock`. Null
 * when the clock is no longer there.
 */
export function removeClock(
	content: string,
	key: ClockKey,
	dropEmptyTask: boolean
): string | null {
	const note = new TaskNote(content)
	const clock = note.findClock(key)
	if (!clock) return null
	const owner = note.tasks.find((task) => task.clocks.includes(clock))
	note.removeClock(clock)
	// The task line sits above its clocks, so its index is unchanged.
	const task = note.tasks.find((t) => t.lineIndex === owner?.lineIndex)
	if (dropEmptyTask && task && task.clocks.length === 0) note.removeTask(task)
	return note.toString()
}

/** What the menu of a block offers for its clock line. */
export type ClockAction = 'open' | 'reopen' | 'delete'

/**
 * The actions on a block's clock line. Removing the end (the clock runs
 * again) is offered on the task's latest clock only, while none of its
 * clocks runs: an earlier clock running up to now would cover the later
 * ones, and a task runs once at a time.
 */
export function clockActions(
	block: TimelineBlock,
	blocks: TimelineBlock[]
): ClockAction[] {
	const others = blocks.filter(
		(other) =>
			other.key.taskName === block.key.taskName && other.id !== block.id
	)
	const reopenable =
		!block.running &&
		others.every((other) => !other.running && other.start < block.start)
	return reopenable ? ['open', 'reopen', 'delete'] : ['open', 'delete']
}

/** `Deleted Deep work 09:00–10:30`, shown with the undo button. */
export function describeClockDeleted(
	taskName: string,
	times: ClockTimes
): string {
	return `Deleted ${taskName} ${formatRange(times)}`
}

/** `Added Deep work 09:00–10:30`, shown with the undo button. */
export function describeClockAdded(
	taskName: string,
	times: ClockTimes
): string {
	return `Added ${taskName} ${formatRange(times)}`
}

export function formatTimeOfDay(date: Date): string {
	return formatClockMinutes(date.getHours() * 60 + date.getMinutes())
}

function formatRange(times: ClockTimes): string {
	const end = times.end ? formatTimeOfDay(times.end) : 'now'
	return `${formatTimeOfDay(times.start)}–${end}`
}

/** `Deep work 09:00–10:30 → 09:15–10:30`, shown with the undo button. */
export function describeClockEdit(
	taskName: string,
	before: ClockTimes,
	after: ClockTimes
): string {
	return `${taskName} ${formatRange(before)} → ${formatRange(after)}`
}

/** What a block says, from the most to the least important part. */
export function blockLabel(block: TimelineBlock): {
	range: string
	duration: string
} {
	return {
		range: formatRange({
			start: block.start,
			end: block.running ? null : block.end,
		}),
		duration: formatHoursMinutes(
			Math.max(0, getMinutesBetween(block.start, block.end))
		),
	}
}
