import { describe, expect, it } from 'vitest'
import {
	deleteTaskLines,
	diffTags,
	isTag,
	retagTaskLines,
	tagChangeApplies,
} from './taskEdits'

const content = [
	'# Monday',
	'- [ ] Deep work #project #focus',
	'      [clock::2026-08-02T09:00:00--2026-08-02T10:00:00]',
	'      [clock::2026-08-02T11:00:00--2026-08-02T11:30:00]',
	'- [x] Email #projects',
	'- [ ] Deep work',
	'      [clock::2026-08-02T14:00:00--2026-08-02T14:30:00]',
].join('\n')

describe('deleteTaskLines', () => {
	it('removes every line of the task with its clocks and counts them', () => {
		const result = deleteTaskLines(content, ['Deep work'])
		expect(result.content.split('\n')).toEqual([
			'# Monday',
			'- [x] Email #projects',
		])
		expect(result).toMatchObject({
			changed: true,
			removedTaskLines: 2,
			removedClockLines: 3,
		})
	})

	it('deletes several tasks in one pass', () => {
		const result = deleteTaskLines(content, ['Deep work', 'Email'])
		expect(result.content).toBe('# Monday')
		expect(result.removedTaskLines).toBe(3)
	})

	it('leaves notes without the task untouched', () => {
		const result = deleteTaskLines(content, ['Nope'])
		expect(result.changed).toBe(false)
		expect(result.content).toBe(content)
	})
})

describe('retagTaskLines', () => {
	it('adds the missing tags and removes the exact ones in one pass', () => {
		const result = retagTaskLines(content, ['Deep work'], {
			add: ['#focus', '#deep'],
			remove: ['#project'],
		})
		const lines = result.content.split('\n')
		expect(lines[1]).toBe('- [ ] Deep work #focus #deep')
		expect(lines[5]).toBe('- [ ] Deep work #focus #deep')
		// "#projects" on another task is a different tag (and another task).
		expect(lines[4]).toBe('- [x] Email #projects')
		expect(result.changedTaskLines).toBe(2)
	})

	it('counts only the lines that actually change', () => {
		const result = retagTaskLines(content, ['Deep work'], {
			add: ['#focus'],
			remove: [],
		})
		expect(result.content.split('\n')[1]).toBe(
			'- [ ] Deep work #project #focus'
		)
		expect(result.content.split('\n')[5]).toBe('- [ ] Deep work #focus')
		expect(result.changedTaskLines).toBe(1)
	})

	it('reports no change when nothing applies', () => {
		const result = retagTaskLines(content, ['Email'], {
			add: ['#projects'],
			remove: ['#nope'],
		})
		expect(result.changed).toBe(false)
		expect(result.content).toBe(content)
	})
})

describe('diffTags / tagChangeApplies', () => {
	it('adds every wanted tag (normalizing drift) and removes the rest', () => {
		expect(diffTags(['#a', '#b'], ['#b', '#c'])).toEqual({
			add: ['#b', '#c'],
			remove: ['#a'],
		})
	})

	it('normalizes drifting lines to exactly the wanted tags', () => {
		const drifting = [
			'- [ ] Deep work #project',
			'- [ ] Deep work #focus',
			'- [ ] Deep work',
		].join('\n')
		const change = diffTags(['#project', '#focus'], ['#focus'])
		const result = retagTaskLines(drifting, ['Deep work'], change)
		expect(result.content.split('\n')).toEqual([
			'- [ ] Deep work #focus',
			'- [ ] Deep work #focus',
			'- [ ] Deep work #focus',
		])
		expect(result.changedTaskLines).toBe(2)
	})

	it('tells whether a line is affected', () => {
		const change = { add: ['#c'], remove: ['#a'] }
		expect(tagChangeApplies(['#a'], change)).toBe(true)
		expect(tagChangeApplies(['#b'], change)).toBe(true)
		expect(tagChangeApplies(['#b', '#c'], change)).toBe(false)
	})
})

describe('isTag', () => {
	it('accepts a single hash-prefixed token and nothing else', () => {
		expect(isTag('#project')).toBe(true)
		expect(isTag('#a/b_c-1')).toBe(true)
		expect(isTag('project')).toBe(false)
		expect(isTag('#two #tags')).toBe(false)
		expect(isTag('#with space')).toBe(false)
	})
})
