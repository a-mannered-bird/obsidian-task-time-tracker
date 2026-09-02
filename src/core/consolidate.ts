import type { Clock, Interval, Task } from 'types/tasks'
import { mergeIntervals } from './intervals'
import { formatClockLine, getIndent, parseTasks } from './parser'

export type ConsolidateResult = {
	content: string
	changed: boolean
	/** Task lines merged away into the survivor. */
	removedTaskLines: number
	/** Clock lines removed by the union: overlaps, touches, empty clocks. */
	removedClockLines: number
}

/**
 * Merge every task line named in `sourceNames` or `targetName` into a single
 * line per note, named `targetName` — the shared engine behind rename (one
 * source, target may not exist yet) and merge (several sources).
 *
 * The surviving line is the one already bearing the target name, otherwise
 * the first affected line rewritten in place; it keeps its position and its
 * own tags. Ticked when any merged line was. Clocks are unioned (see
 * unionClocks) and rewritten below the survivor, oldest first.
 */
export function consolidateTasks(
	content: string,
	sourceNames: string[],
	targetName: string
): ConsolidateResult {
	const lines = content.split('\n')
	const tasks = parseTasks(lines)
	const names = new Set([...sourceNames, targetName])
	const affected = tasks.filter((task) => names.has(task.name))

	if (affected.length === 0) {
		return unchanged(content)
	}

	const survivor =
		affected.find((task) => task.name === targetName) ?? affected[0]!
	const clocks = affected.flatMap((task) => task.clocks)
	const merged = unionClocks(clocks)
	const ticked = affected.some((task) => task.ticked)

	const clockIndent = survivor.clocks[0]
		? getIndent(lines[survivor.clocks[0].lineIndex]!)
		: undefined
	const survivorBlock = [
		survivorLine(lines[survivor.lineIndex]!, survivor, targetName, ticked),
		...merged.map((clock) =>
			formatClockLine(clock.start, clock.end, clockIndent)
		),
	]

	// Line ranges of every affected task block (task line + its clocks).
	const skip = new Set<number>()
	for (const task of affected) {
		for (let index = task.lineIndex; index < blockEnd(task); index++) {
			skip.add(index)
		}
	}

	const result: string[] = []
	lines.forEach((line, index) => {
		if (index === survivor.lineIndex) result.push(...survivorBlock)
		else if (!skip.has(index)) result.push(line)
	})

	const output = result.join('\n')
	if (output === content) return unchanged(content)
	return {
		content: output,
		changed: true,
		removedTaskLines: affected.length - 1,
		removedClockLines: clocks.length - merged.length,
	}
}

/**
 * Union of the clocks: overlapping or touching ones merge, zero-length ones
 * are dropped. If any clock is running, the group it belongs to stays
 * running from its earliest start — consolidation may extend tracked time
 * but never silently stops a clock. Returned oldest first.
 */
export function unionClocks(
	clocks: Pick<Clock, 'start' | 'end'>[]
): { start: Date; end: Date | null }[] {
	const closed = mergeIntervals(
		clocks.filter((clock) => clock.end !== null).map(clockInterval)
	)
	const runningStarts = clocks
		.filter((clock) => clock.end === null)
		.map((clock) => clock.start)
	if (runningStarts.length === 0) return closed

	let runStart = new Date(Math.min(...runningStarts.map((d) => d.valueOf())))
	const kept: Interval[] = []
	// Closed intervals are disjoint and sorted; absorbing right to left lets
	// each absorption pull runStart back far enough to reach the next one.
	for (let index = closed.length - 1; index >= 0; index--) {
		const interval = closed[index]!
		if (interval.end >= runStart) {
			if (interval.start < runStart) runStart = interval.start
		} else {
			kept.unshift(interval)
		}
	}
	return [...kept, { start: runStart, end: null }]
}

function clockInterval(clock: Pick<Clock, 'start' | 'end'>): Interval {
	return { start: clock.start, end: clock.end! }
}

/**
 * The survivor's task line: kept verbatim (except the OR-ed checkbox) when
 * it already bears the target name, otherwise rebuilt with the new name and
 * its own tags.
 */
function survivorLine(
	line: string,
	survivor: Task,
	targetName: string,
	ticked: boolean
): string {
	const box = `- [${ticked ? 'x' : ' '}]`
	if (survivor.name === targetName) {
		return line.replace(/- \[[ xX]\]/, box)
	}
	const tags = survivor.tags.map((tag) => ` ${tag}`).join('')
	return `${getIndent(line)}${box} ${targetName}${tags}`
}

function blockEnd(task: Task): number {
	const lastClock = task.clocks[task.clocks.length - 1]
	return (lastClock ? lastClock.lineIndex : task.lineIndex) + 1
}

function unchanged(content: string): ConsolidateResult {
	return { content, changed: false, removedTaskLines: 0, removedClockLines: 0 }
}
