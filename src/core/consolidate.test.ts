import { describe, expect, it } from 'vitest'
import { consolidateTasks, unionClocks } from './consolidate'

const at = (day: number, h: number, m = 0) => new Date(2026, 7, day, h, m, 0)

describe('consolidateTasks: rename (single source)', () => {
	it('rewrites the line in place, keeping tags, checkbox and clocks', () => {
		const content = [
			'# Monday',
			'- [ ] Deep wok #project #focus',
			'      [clock::2026-08-02T09:00:00--2026-08-02T10:00:00]',
			'- [ ] Email',
		].join('\n')
		const result = consolidateTasks(content, ['Deep wok'], 'Deep work')
		expect(result.changed).toBe(true)
		expect(result.content.split('\n')).toEqual([
			'# Monday',
			'- [ ] Deep work #project #focus',
			'      [clock::2026-08-02T09:00:00--2026-08-02T10:00:00]',
			'- [ ] Email',
		])
		expect(result.removedTaskLines).toBe(0)
		expect(result.removedClockLines).toBe(0)
	})

	it('leaves notes without the task untouched', () => {
		const content = '- [ ] Email\n'
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
			'      [clock::2026-08-02T11:00:00--2026-08-02T11:30:00]',
		].join('\n')
		const result = consolidateTasks(content, ['Deep wok'], 'Deep work')
		// Survivor keeps its position and tags; ticked because a source was;
		// clocks joined below it; the source block is gone.
		expect(result.content.split('\n')).toEqual([
			'- [x] Deep work #focus',
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
			'      [clock::2026-08-03T09:00:00--2026-08-03T09:30:00]',
			'- [ ] Notes in between',
			'- [ ] Task B',
			'      [clock::2026-08-03T10:00:00--2026-08-03T10:15:00]',
		].join('\n')
		const result = consolidateTasks(content, ['Task A', 'Task B'], 'Task AB')
		expect(result.content.split('\n')).toEqual([
			'- [ ] Task AB #project',
			'      [clock::2026-08-03T09:00:00--2026-08-03T09:30:00]',
			'      [clock::2026-08-03T10:00:00--2026-08-03T10:15:00]',
			'- [ ] Notes in between',
		])
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
