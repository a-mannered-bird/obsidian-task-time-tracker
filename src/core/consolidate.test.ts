import { describe, expect, it } from 'vitest'
import { consolidateTasks, extractTaskBlocks, unionClocks } from './consolidate'

const at = (day: number, h: number, m = 0) => new Date(2026, 7, day, h, m, 0)

describe('consolidateTasks: rename (single source)', () => {
	it('rewrites the line in place, keeping tags, checkbox, goals and clocks', () => {
		const content = [
			'# Monday',
			'- [ ] Deep wok #project #focus',
			'  [goal::1.5h]',
			'      [clock::2026-08-02T09:00:00--2026-08-02T10:00:00]',
			'- [ ] Email',
			'      [goal::<30m]',
		].join('\n')
		const result = consolidateTasks(content, ['Deep wok'], 'Deep work')
		expect(result.changed).toBe(true)
		// The goal line moves over as written.
		expect(result.content.split('\n')).toEqual([
			'# Monday',
			'- [ ] Deep work #project #focus',
			'  [goal::1.5h]',
			'      [clock::2026-08-02T09:00:00--2026-08-02T10:00:00]',
			'- [ ] Email',
			'      [goal::<30m]',
		])
		expect(result.removedTaskLines).toBe(0)
		expect(result.removedClockLines).toBe(0)
		expect(result.combinedGoalLines).toBe(0)
	})

	it('leaves notes without the task untouched', () => {
		const content = '- [ ] Email\n      [goal::<30m]\n'
		const result = consolidateTasks(content, ['Deep wok'], 'Deep work')
		expect(result.changed).toBe(false)
		expect(result.content).toBe(content)
	})

	it('merges into an existing line of the target name (collision)', () => {
		const content = [
			'- [ ] Deep work #focus',
			'      [clock::2026-08-02T09:00:00--2026-08-02T10:00:00]',
			'- [ ] Email',
			'- [x] Deep wok #project',
			'      [goal::2h]',
			'      [clock::2026-08-02T11:00:00--2026-08-02T11:30:00]',
		].join('\n')
		const result = consolidateTasks(content, ['Deep wok'], 'Deep work')
		// Survivor keeps its position and tags; ticked because a source was;
		// goals and clocks joined below it; the source block is gone.
		expect(result.content.split('\n')).toEqual([
			'- [x] Deep work #focus',
			'      [goal::2h]',
			'      [clock::2026-08-02T09:00:00--2026-08-02T10:00:00]',
			'      [clock::2026-08-02T11:00:00--2026-08-02T11:30:00]',
			'- [ ] Email',
		])
		expect(result.removedTaskLines).toBe(1)
		expect(result.removedClockLines).toBe(0)
	})
})

describe('consolidateTasks: merge (several sources)', () => {
	it('collects all sources under the first affected line when the target is absent', () => {
		const content = [
			'- [ ] Task A #project',
			'      [goal::pages 4/10]',
			'      [clock::2026-08-03T09:00:00--2026-08-03T09:30:00]',
			'- [ ] Notes in between',
			'- [ ] Task B',
			'      [clock::2026-08-03T10:00:00--2026-08-03T10:15:00]',
			'      [goal::pages 2/10]',
		].join('\n')
		const result = consolidateTasks(content, ['Task A', 'Task B'], 'Task AB')
		expect(result.content.split('\n')).toEqual([
			'- [ ] Task AB #project',
			'      [goal::pages 6/20]',
			'      [clock::2026-08-03T09:00:00--2026-08-03T09:30:00]',
			'      [clock::2026-08-03T10:00:00--2026-08-03T10:15:00]',
			'- [ ] Notes in between',
		])
		expect(result.combinedGoalLines).toBe(2)
		expect(result.removedTaskLines).toBe(1)
	})

	it('consolidates duplicate lines already sharing the target name', () => {
		const content = [
			'- [ ] Deep work',
			'      [clock::2026-08-02T09:00:00--2026-08-02T09:30:00]',
			'- [ ] Deep work #dup',
			'      [clock::2026-08-02T10:00:00--2026-08-02T10:30:00]',
		].join('\n')
		const result = consolidateTasks(content, [], 'Deep work')
		expect(result.content.split('\n')).toEqual([
			'- [ ] Deep work',
			'      [clock::2026-08-02T09:00:00--2026-08-02T09:30:00]',
			'      [clock::2026-08-02T10:00:00--2026-08-02T10:30:00]',
		])
		expect(result.removedTaskLines).toBe(1)
	})
})

describe('consolidateTasks: goals', () => {
	const content = [
		'- [ ] Run #sport',
		'      [clock::2026-08-03T07:00:00--2026-08-03T07:30:00]',
		'      [goal::speed 10/12 km/h]',
		'      [goal::1h]',
		'- [ ] Jog',
		'      [goal::<45m]',
		'      [goal::speed 12/12 km/h]',
		'      [goal::distance 3 mi]',
		'      [goal::90]',
		'      [goal::weight 81.4/<80 kg]',
		'      [clock::2026-08-03T18:00:00--2026-08-03T18:30:00]',
		'- [ ] Run #sport',
		'      [goal::distance 5/10 km]',
	].join('\n')

	it("follows each metric's rule, keeps other units and malformed lines", () => {
		const result = consolidateTasks(content, ['Jog'], 'Run', (metric) =>
			metric === 'speed' ? 'average' : 'sum'
		)
		// Speed averages (10 + 12) / 2; the limit on Jog's time keeps the
		// survivor's 1h; distance in mi stays apart from km. The survivor's
		// goals come first, then the other lines' in note order.
		expect(result.content.split('\n')).toEqual([
			'- [ ] Run #sport',
			'      [goal::speed 11/12 km/h]',
			'      [goal::1h]',
			'      [goal::distance 3 mi]',
			'      [goal::90]',
			'      [goal::weight 81.4/<80 kg]',
			'      [goal::distance 5/10 km]',
			'      [clock::2026-08-03T07:00:00--2026-08-03T07:30:00]',
			'      [clock::2026-08-03T18:00:00--2026-08-03T18:30:00]',
		])
		expect(result.combinedGoalLines).toBe(4)
	})

	it('lists every goal line of the task in its blocks', () => {
		expect(extractTaskBlocks(content, 'Jog')).toEqual(
			content.split('\n').slice(4, 11)
		)
	})
})

describe('consolidateTasks: clock union', () => {
	it('merges touching and overlapping clocks and counts the removals', () => {
		const content = [
			'- [ ] Task A',
			'      [clock::2026-08-03T09:00:00--2026-08-03T09:30:00]',
			'- [ ] Task B',
			'      [clock::2026-08-03T09:30:00--2026-08-03T10:00:00]',
			'      [clock::2026-08-03T09:45:00--2026-08-03T10:30:00]',
		].join('\n')
		const result = consolidateTasks(content, ['Task B'], 'Task A')
		expect(result.content.split('\n')).toEqual([
			'- [ ] Task A',
			'      [clock::2026-08-03T09:00:00--2026-08-03T10:30:00]',
		])
		expect(result.removedClockLines).toBe(2)
	})

	it('drops zero-length clocks and counts them', () => {
		const content = [
			'- [ ] Task A',
			'      [clock::2026-08-03T09:00:00--2026-08-03T09:00:00]',
			'      [clock::2026-08-03T10:00:00--2026-08-03T10:30:00]',
		].join('\n')
		const result = consolidateTasks(content, [], 'Task A')
		expect(result.content.split('\n')).toEqual([
			'- [ ] Task A',
			'      [clock::2026-08-03T10:00:00--2026-08-03T10:30:00]',
		])
		expect(result.removedClockLines).toBe(1)
	})

	it('sorts merged clocks chronologically whatever the note order', () => {
		const content = [
			'- [ ] Task A',
			'      [clock::2026-08-03T14:00:00--2026-08-03T15:00:00]',
			'- [ ] Task B',
			'      [clock::2026-08-03T09:00:00--2026-08-03T09:30:00]',
		].join('\n')
		const result = consolidateTasks(content, ['Task B'], 'Task A')
		expect(result.content.split('\n')).toEqual([
			'- [ ] Task A',
			'      [clock::2026-08-03T09:00:00--2026-08-03T09:30:00]',
			'      [clock::2026-08-03T14:00:00--2026-08-03T15:00:00]',
		])
	})

	it('keeps a running clock running from the earliest overlapping start', () => {
		const content = [
			'- [ ] Task A',
			'      [clock::2026-08-03T09:00:00--2026-08-03T10:00:00]',
			'- [ ] Task B',
			'      [clock::2026-08-03T09:30:00]',
		].join('\n')
		const result = consolidateTasks(content, ['Task B'], 'Task A')
		expect(result.content.split('\n')).toEqual([
			'- [ ] Task A',
			'      [clock::2026-08-03T09:00:00]',
		])
	})

	it('keeps closed clocks that end before the running one starts', () => {
		const content = [
			'- [ ] Task A',
			'      [clock::2026-08-03T09:00:00--2026-08-03T09:30:00]',
			'- [ ] Task B',
			'      [clock::2026-08-03T11:00:00]',
		].join('\n')
		const result = consolidateTasks(content, ['Task B'], 'Task A')
		expect(result.content.split('\n')).toEqual([
			'- [ ] Task A',
			'      [clock::2026-08-03T09:00:00--2026-08-03T09:30:00]',
			'      [clock::2026-08-03T11:00:00]',
		])
	})
})

describe('unionClocks', () => {
	it('collapses two running clocks into one at the earliest start', () => {
		expect(
			unionClocks([
				{ start: at(3, 10), end: null },
				{ start: at(3, 9), end: null },
			])
		).toEqual([{ start: at(3, 9), end: null }])
	})

	it('absorbs a chain of intervals reached by the extending running clock', () => {
		// [8:00-9:00] touches [9:00-10:00], which overlaps the 9:30 running
		// clock: absorbing right to left pulls the start back to 8:00.
		expect(
			unionClocks([
				{ start: at(3, 8), end: at(3, 9) },
				{ start: at(3, 9), end: at(3, 10) },
				{ start: at(3, 9, 30), end: null },
			])
		).toEqual([{ start: at(3, 8), end: null }])
	})

	it('returns an empty union for no clocks', () => {
		expect(unionClocks([])).toEqual([])
	})
})

describe('consolidateTasks: formatting details', () => {
	it('reuses the survivor clock indent', () => {
		const content = [
			'- [ ] Task A',
			'  [clock::2026-08-03T09:00:00--2026-08-03T09:30:00]',
			'- [ ] Task B',
			'      [clock::2026-08-03T10:00:00--2026-08-03T10:30:00]',
		].join('\n')
		const result = consolidateTasks(content, ['Task B'], 'Task A')
		expect(result.content.split('\n')).toEqual([
			'- [ ] Task A',
			'  [clock::2026-08-03T09:00:00--2026-08-03T09:30:00]',
			'  [clock::2026-08-03T10:00:00--2026-08-03T10:30:00]',
		])
	})

	it('reports no change when the target is already consolidated', () => {
		const content = [
			'- [ ] Task A',
			'      [clock::2026-08-03T09:00:00--2026-08-03T09:30:00]',
		].join('\n')
		const result = consolidateTasks(content, [], 'Task A')
		expect(result.changed).toBe(false)
		expect(result.content).toBe(content)
	})
})

describe('extractTaskBlocks', () => {
	it('returns the task lines with their clocks, before and after a join', () => {
		const content = [
			'# Monday',
			'- [ ] Deep work #focus',
			'      [clock::2026-08-03T09:00:00--2026-08-03T10:00:00]',
			'      [clock::2026-08-03T09:30:00--2026-08-03T10:30:00]',
			'- [ ] Email',
			'- [ ] Deep work',
			'      [clock::2026-08-03T14:00:00--2026-08-03T14:30:00]',
		].join('\n')
		expect(extractTaskBlocks(content, 'Deep work')).toEqual([
			'- [ ] Deep work #focus',
			'      [clock::2026-08-03T09:00:00--2026-08-03T10:00:00]',
			'      [clock::2026-08-03T09:30:00--2026-08-03T10:30:00]',
			'- [ ] Deep work',
			'      [clock::2026-08-03T14:00:00--2026-08-03T14:30:00]',
		])
		const joined = consolidateTasks(content, [], 'Deep work').content
		expect(extractTaskBlocks(joined, 'Deep work')).toEqual([
			'- [ ] Deep work #focus',
			'      [clock::2026-08-03T09:00:00--2026-08-03T10:30:00]',
			'      [clock::2026-08-03T14:00:00--2026-08-03T14:30:00]',
		])
	})
})
