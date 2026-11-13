import { describe, expect, it } from 'vitest'
import { parseTasks } from './parser'
import {
	addClock,
	clockActions,
	describeClockDeleted,
	describeClockAdded,
	describeClockEdit,
	dragTimes,
	drawnTimes,
	fitRange,
	initialScrollTime,
	layoutBlocks,
	magnetsFor,
	nudgeTimes,
	removeClock,
	retimeClock,
	sameTaskOverlaps,
	snapStepMinutes,
	timelineAxis,
	timelineBlocks,
	type SnapOptions,
} from './timeline'

const at = (h: number, m = 0, s = 0) => new Date(2026, 7, 3, h, m, s)
const day = at(0)
const now = at(14)

const note = [
	'- [ ] Deep work #project',
	'      [clock::2026-08-03T09:00:00--2026-08-03T10:30:00]',
	'- [ ] Email',
	'      [clock::2026-08-03T10:00:00--2026-08-03T10:20:00]',
	'      [clock::2026-08-03T13:00:00]',
	'- [ ] Deep work #focus',
	'      [clock::2026-08-03T10:15:00--2026-08-03T11:00:00]',
].join('\n')

const blocksOf = (content: string) =>
	timelineBlocks(parseTasks(content.split('\n')), now)

const span = (id: string, from: number, to: number) => ({
	id,
	start: at(from),
	end: at(to),
})

const grid: SnapOptions = {
	stepMinutes: 15,
	magnets: [],
	magnetMs: 0,
	free: false,
	now,
}

const minutes = (n: number) => n * 60 * 1000

describe('timelineBlocks', () => {
	it('draws one block per clock line in start order, running ones up to now', () => {
		const blocks = blocksOf(note)
		expect(
			blocks.map((b) => [b.key.taskName, b.start, b.end, b.running])
		).toEqual([
			['Deep work', at(9), at(10, 30), false],
			['Email', at(10), at(10, 20), false],
			['Deep work', at(10, 15), at(11), false],
			['Email', at(13), now, true],
		])
		expect(blocks[3]!.key.end).toBeNull()
	})

	it('keeps the ids of duplicated clock lines apart', () => {
		const blocks = blocksOf(
			[
				'- [ ] Email',
				'      [clock::2026-08-03T10:00:00--2026-08-03T10:20:00]',
				'      [clock::2026-08-03T10:00:00--2026-08-03T10:20:00]',
			].join('\n')
		)
		expect(new Set(blocks.map((b) => b.id)).size).toBe(2)
	})
})

describe('layoutBlocks', () => {
	it('gives back-to-back blocks the full width', () => {
		const layout = layoutBlocks([span('a', 9, 10), span('b', 10, 11)])
		expect(layout.get('a')).toEqual({ column: 0, span: 1, columns: 1 })
		expect(layout.get('b')).toEqual({ column: 0, span: 1, columns: 1 })
	})

	it('puts overlapping blocks side by side, the longer one first on a tie', () => {
		const layout = layoutBlocks([span('short', 9, 10), span('long', 9, 12)])
		expect(layout.get('long')).toEqual({ column: 0, span: 1, columns: 2 })
		expect(layout.get('short')).toEqual({ column: 1, span: 1, columns: 2 })
	})

	it('reuses a column freed earlier in the same group', () => {
		// long 9–12 overlaps a 9–10 then a 10–11: both fit in column 1.
		const layout = layoutBlocks([
			span('long', 9, 12),
			span('first', 9, 10),
			span('second', 10, 11),
		])
		expect(layout.get('second')).toEqual({ column: 1, span: 1, columns: 2 })
	})

	it('widens a block over the columns free for its whole span', () => {
		// a 9–12 | b 9–10 | c 9–10, then d 10–11 lands in column 1 and
		// column 2 stays free from 10 to 11.
		const layout = layoutBlocks([
			span('a', 9, 12),
			span('b', 9, 10),
			span('c', 9, 10),
			span('d', 10, 11),
		])
		expect(layout.get('c')).toEqual({ column: 2, span: 1, columns: 3 })
		expect(layout.get('d')).toEqual({ column: 1, span: 2, columns: 3 })
	})

	it('lays out separate groups independently', () => {
		const layout = layoutBlocks([
			span('a', 9, 10),
			span('b', 9, 10),
			span('alone', 11, 12),
		])
		expect(layout.get('alone')).toEqual({ column: 0, span: 1, columns: 1 })
	})
})

describe('sameTaskOverlaps', () => {
	it('flags both clocks of a task that overlap, not other tasks', () => {
		const blocks = blocksOf(note)
		const flagged = sameTaskOverlaps(blocks)
		// Deep work 9:00–10:30 and 10:15–11:00 overlap; Email overlaps Deep
		// work, which is legitimate.
		expect([...flagged].sort()).toEqual([blocks[0]!.id, blocks[2]!.id].sort())
	})
})

describe('timelineAxis', () => {
	it('covers the note day when everything lies inside it', () => {
		expect(timelineAxis(day, [at(9), at(17)])).toEqual({
			start: at(0),
			end: at(24),
		})
	})

	it('stretches to whole hours past midnight on both sides', () => {
		expect(timelineAxis(day, [at(-1, 30), at(25, 10)])).toEqual({
			start: at(-1),
			end: at(26),
		})
	})

	it('ignores marks more than a day away', () => {
		expect(timelineAxis(day, [at(-30), at(80)])).toEqual({
			start: at(0),
			end: at(24),
		})
	})
})

describe('initialScrollTime', () => {
	const blocks = blocksOf(note)

	it('opens on now for today', () => {
		expect(initialScrollTime(day, now, at(7), blocks)).toEqual(now)
	})

	it('opens on the start of day, else the first clock, for another day', () => {
		const later = at(24 * 3)
		expect(initialScrollTime(day, later, at(7), blocks)).toEqual(at(7))
		expect(initialScrollTime(day, later, null, blocks)).toEqual(at(9))
		expect(initialScrollTime(day, later, null, [])).toBeNull()
	})
})

describe('fitRange', () => {
	const blocks = blocksOf(note)

	it('fits the start to the end of day when both are recorded', () => {
		expect(fitRange(at(7), at(13), blocks, now)).toEqual({
			start: at(7),
			end: at(13),
		})
	})

	it('stops at the last clock when end of day is still ahead', () => {
		const finished = blocks.filter((block) => !block.running)
		expect(fitRange(at(7), at(23), finished, now)).toEqual({
			start: at(7),
			end: at(11),
		})
		// A running clock is logged up to now.
		expect(fitRange(at(7), at(23), blocks, now)).toEqual({
			start: at(7),
			end: now,
		})
		expect(fitRange(at(7), at(23), [], now)).toEqual({
			start: at(7),
			end: now,
		})
	})

	it('fits the clocks otherwise, a running one up to now', () => {
		expect(fitRange(at(7), null, blocks, now)).toEqual({
			start: at(9),
			end: now,
		})
		expect(fitRange(null, null, [], now)).toBeNull()
	})
})

describe('snapStepMinutes', () => {
	it('gets finer as the zoom grows', () => {
		expect(snapStepMinutes(60)).toBe(15)
		expect(snapStepMinutes(200)).toBe(5)
		expect(snapStepMinutes(600)).toBe(1)
	})
})

describe('dragTimes', () => {
	const clock = { start: at(9, 0, 20), end: at(10, 30, 40) }

	it('snaps a dragged end to the grid and keeps the start seconds', () => {
		expect(dragTimes(clock, 'end', minutes(22), grid)).toEqual({
			start: at(9, 0, 20),
			end: at(11),
		})
	})

	it('moves the whole block by a grid step, keeping the duration to the second', () => {
		// 9:00:20 + 7 min lands closest to 9:00, so the whole block shifts by
		// -20 s: the start lands on the grid and the end keeps its offset.
		expect(dragTimes(clock, 'move', minutes(7), grid)).toEqual({
			start: at(9),
			end: at(10, 30, 20),
		})
		expect(dragTimes(clock, 'move', minutes(10), grid)).toEqual({
			start: at(9, 15),
			end: at(10, 45, 20),
		})
	})

	it('sticks an edge to a magnet before the grid', () => {
		const options = { ...grid, magnets: [at(10, 37, 12)], magnetMs: minutes(5) }
		expect(dragTimes(clock, 'end', minutes(9), options)).toEqual({
			start: at(9, 0, 20),
			end: at(10, 37, 12),
		})
	})

	it('moves a block so that its end meets a magnet', () => {
		const options = { ...grid, magnets: [at(11, 2)], magnetMs: minutes(5) }
		const moved = dragTimes(clock, 'move', minutes(30), options)
		expect(moved.end).toEqual(at(11, 2))
		expect(moved.start).toEqual(at(9, 31, 40))
	})

	it('moves by whole minutes without grid or magnets when free', () => {
		const options = {
			...grid,
			free: true,
			magnets: [at(9, 5)],
			magnetMs: minutes(5),
		}
		expect(dragTimes(clock, 'start', minutes(3), options)).toEqual({
			start: at(9, 3),
			end: at(10, 30, 40),
		})
	})

	it('never shrinks a block below one step', () => {
		expect(dragTimes(clock, 'end', -minutes(120), grid)).toEqual({
			start: at(9, 0, 20),
			end: at(9, 15, 20),
		})
		expect(dragTimes(clock, 'start', minutes(120), grid)).toEqual({
			start: at(10, 15, 40),
			end: at(10, 30, 40),
		})
	})

	it('finishes a running clock moved earlier, keeping its duration so far', () => {
		// Running since 13:00 at 14:00: an hour, now ending 30 min earlier.
		const running = { start: at(13), end: null }
		expect(dragTimes(running, 'move', -minutes(30), grid)).toEqual({
			start: at(12, 30),
			end: at(13, 30),
		})
	})

	it('finishes a running clock at its dragged end', () => {
		const running = { start: at(13), end: null }
		expect(dragTimes(running, 'end', -minutes(20), grid)).toEqual({
			start: at(13),
			end: at(13, 45),
		})
	})

	it('leaves a running clock running when it would end at now or later', () => {
		const running = { start: at(13), end: null }
		expect(dragTimes(running, 'move', minutes(30), grid)).toEqual(running)
		expect(dragTimes(running, 'end', minutes(5), grid)).toEqual(running)
		// Too short to finish before now: one step from 13:50 is 14:05.
		const late = { start: at(13, 50), end: null }
		expect(dragTimes(late, 'end', -minutes(20), grid)).toEqual(late)
	})

	it('keeps a running clock running and its start before now', () => {
		const running = { start: at(13), end: null }
		expect(dragTimes(running, 'start', -minutes(30), grid)).toEqual({
			start: at(12, 30),
			end: null,
		})
		expect(dragTimes(running, 'start', minutes(120), grid)).toEqual({
			start: at(13, 45),
			end: null,
		})
	})
})

describe('magnetsFor', () => {
	it('offers the other blocks edges and the given times', () => {
		const blocks = blocksOf(note)
		const magnets = magnetsFor(blocks, blocks[0]!.id, [at(7), null])
		expect(magnets).toContainEqual(at(10, 20))
		expect(magnets).toContainEqual(at(7))
		expect(magnets).not.toContainEqual(at(10, 30))
	})
})

describe('nudgeTimes', () => {
	const clock = { start: at(9, 7), end: at(10, 30) }

	it('moves to the next grid line in each direction', () => {
		expect(nudgeTimes(clock, 'move', 1, 15, now)).toEqual({
			start: at(9, 15),
			end: at(10, 38),
		})
		expect(nudgeTimes(clock, 'move', -1, 15, now)).toEqual({
			start: at(9),
			end: at(10, 23),
		})
	})

	it('steps a whole step from a time already on the grid', () => {
		expect(nudgeTimes(clock, 'end', 1, 15, now)).toEqual({
			start: at(9, 7),
			end: at(10, 45),
		})
		expect(nudgeTimes(clock, 'start', -1, 5, now)).toEqual({
			start: at(9, 5),
			end: at(10, 30),
		})
	})

	it('applies the drag limits', () => {
		const short = { start: at(9), end: at(9, 15) }
		expect(nudgeTimes(short, 'end', -1, 15, now)).toEqual(short)
	})

	it('finishes a running clock moved up, and leaves it moved down', () => {
		const running = { start: at(13), end: null }
		expect(nudgeTimes(running, 'move', -1, 15, now)).toEqual({
			start: at(12, 45),
			end: at(13, 45),
		})
		expect(nudgeTimes(running, 'move', 1, 15, now)).toEqual(running)
		expect(nudgeTimes(running, 'end', -1, 15, now)).toEqual({
			start: at(13),
			end: at(13, 45),
		})
	})
})

describe('retimeClock', () => {
	it('rewrites only the matching clock line, keeping its indent', () => {
		const result = retimeClock(
			note,
			{ taskName: 'Deep work', start: at(10, 15), end: at(11) },
			{ start: at(10, 30), end: at(11) }
		)
		expect(result).toBe(
			note.replace(
				'[clock::2026-08-03T10:15:00--2026-08-03T11:00:00]',
				'[clock::2026-08-03T10:30:00--2026-08-03T11:00:00]'
			)
		)
	})

	it('keeps a running clock open', () => {
		const result = retimeClock(
			note,
			{ taskName: 'Email', start: at(13), end: null },
			{ start: at(12, 45), end: null }
		)
		expect(result?.split('\n')[4]).toBe('      [clock::2026-08-03T12:45:00]')
	})

	it('finds nothing when the clock changed elsewhere', () => {
		expect(
			retimeClock(
				note,
				{ taskName: 'Email', start: at(10), end: at(10, 25) },
				{ start: at(10), end: at(10, 30) }
			)
		).toBeNull()
	})
})

describe('describeClockEdit', () => {
	it('shows the times before and after', () => {
		expect(
			describeClockEdit(
				'Deep work',
				{ start: at(9), end: at(10, 30) },
				{ start: at(9, 15), end: at(10, 30) }
			)
		).toBe('Deep work 09:00–10:30 → 09:15–10:30')
		expect(
			describeClockEdit(
				'Email',
				{ start: at(13), end: null },
				{ start: at(12, 45), end: null }
			)
		).toBe('Email 13:00–now → 12:45–now')
	})
})

describe('drawnTimes', () => {
	it('snaps both ends, whichever way the drag goes', () => {
		const clock = { start: at(9), end: at(10, 15) }
		expect(drawnTimes(at(9, 7), at(10, 20), grid)).toEqual(clock)
		expect(drawnTimes(at(10, 20), at(9, 7), grid)).toEqual(clock)
	})

	it('makes a barely moved drag one step long', () => {
		expect(drawnTimes(at(9, 5), at(9, 6), grid)).toEqual({
			start: at(9),
			end: at(9, 15),
		})
	})

	it('stops at now, and draws nothing that would start after it', () => {
		// now is 14:00.
		expect(drawnTimes(at(13, 30), at(15), grid)).toEqual({
			start: at(13, 30),
			end: at(14),
		})
		expect(drawnTimes(at(13, 55), at(14, 30), grid)).toBeNull()
	})
})

describe('addClock', () => {
	const times = { start: at(11), end: at(11, 30) }

	it('places the clock among the clocks of the task, in time order', () => {
		expect(addClock(note, { name: 'Email', tags: [] }, times)).toBe(
			[
				'- [ ] Deep work #project',
				'      [clock::2026-08-03T09:00:00--2026-08-03T10:30:00]',
				'- [ ] Email',
				'      [clock::2026-08-03T10:00:00--2026-08-03T10:20:00]',
				'      [clock::2026-08-03T11:00:00--2026-08-03T11:30:00]',
				'      [clock::2026-08-03T13:00:00]',
				'- [ ] Deep work #focus',
				'      [clock::2026-08-03T10:15:00--2026-08-03T11:00:00]',
			].join('\n')
		)
	})

	it('adds a missing task after the last one, with its tags', () => {
		expect(addClock(note, { name: 'Review', tags: ['#team'] }, times)).toBe(
			`${note}\n- [ ] Review #team\n      [clock::2026-08-03T11:00:00--2026-08-03T11:30:00]`
		)
	})
})

describe('removeClock', () => {
	it('removes the clock line and keeps a task that has other clocks', () => {
		expect(
			removeClock(
				note,
				{ taskName: 'Email', start: at(10), end: at(10, 20) },
				true
			)
		).toBe(
			note.replace(
				'\n      [clock::2026-08-03T10:00:00--2026-08-03T10:20:00]',
				''
			)
		)
	})

	it('undoes adding a clock to a new task, task line included', () => {
		const target = { name: 'Review', tags: ['#team'] }
		const times = { start: at(11), end: at(11, 30) }
		const added = addClock(note, target, times)
		expect(removeClock(added, { taskName: 'Review', ...times }, true)).toBe(
			note
		)
	})

	it('keeps an emptied task line it did not add', () => {
		const result = removeClock(
			note,
			{ taskName: 'Deep work', start: at(10, 15), end: at(11) },
			false
		)
		expect(result?.split('\n').at(-1)).toBe('- [ ] Deep work #focus')
	})

	it('finds nothing when the clock changed elsewhere', () => {
		expect(
			removeClock(
				note,
				{ taskName: 'Email', start: at(10), end: at(10, 25) },
				true
			)
		).toBeNull()
	})
})

describe('describeClockAdded', () => {
	it('names the task and the times', () => {
		expect(
			describeClockAdded('Deep work', { start: at(9), end: at(10, 30) })
		).toBe('Added Deep work 09:00–10:30')
	})
})

describe('clockActions', () => {
	const blocks = blocksOf(note)
	const actionsAt = (taskName: string, start: Date) => {
		const block = blocks.find(
			(b) =>
				b.key.taskName === taskName && b.start.valueOf() === start.valueOf()
		)
		return block && clockActions(block, blocks)
	}

	it('lets the end of the task latest clock go when none of its clocks runs', () => {
		expect(actionsAt('Deep work', at(10, 15))).toEqual([
			'open',
			'reopen',
			'delete',
		])
	})

	it('keeps the end of an earlier clock, and of any clock while one runs', () => {
		// Deep work clocks again at 10:15.
		expect(actionsAt('Deep work', at(9))).toEqual(['open', 'delete'])
		// Email runs since 13:00.
		expect(actionsAt('Email', at(10))).toEqual(['open', 'delete'])
		expect(actionsAt('Email', at(13))).toEqual(['open', 'delete'])
	})
})

describe('describeClockDeleted', () => {
	it('names the task and the times, now for a running clock', () => {
		expect(describeClockDeleted('Email', { start: at(13), end: null })).toBe(
			'Deleted Email 13:00–now'
		)
	})
})
