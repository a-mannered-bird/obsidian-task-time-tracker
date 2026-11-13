import { describe, expect, it } from 'vitest'
import {
	chronologicalClockLines,
	getLastEnd,
	isRunning,
	TaskNote,
} from './note'
import { parseTasks } from './parser'

const at = (h: number, m = 0) => new Date(2026, 7, 16, h, m, 0)

const content = [
	'- [ ] Write plugin #project',
	'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
	'- [ ] Walk the dog #routine',
	'- [ ] Unassigned',
	'      [clock::2026-08-16T11:00:00]',
	'',
	'Notes',
].join('\n')

describe('TaskNote', () => {
	it('starts a clock below the existing clocks, reusing their indent', () => {
		const note = new TaskNote(content)
		note.startClock(note.findTask('Write plugin')!, at(12))
		expect(note.toString().split('\n').slice(0, 3)).toEqual([
			'- [ ] Write plugin #project',
			'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
			'      [clock::2026-08-16T12:00:00]',
		])
		expect(isRunning(note.findTask('Write plugin')!)).toBe(true)
	})

	it('starts a clock right below a task without clocks using the default indent', () => {
		const note = new TaskNote(content)
		note.startClock(note.findTask('Walk the dog')!, at(12, 30))
		expect(note.toString().split('\n')[3]).toBe(
			'      [clock::2026-08-16T12:30:00]'
		)
	})

	it('refuses to start a task that is already running', () => {
		const note = new TaskNote(content)
		expect(() =>
			note.startClock(note.findTask('Unassigned')!, at(12))
		).toThrow()
	})

	it('closes the running clock in place', () => {
		const note = new TaskNote(content)
		note.stopClock(note.findTask('Unassigned')!, at(11, 45))
		expect(note.toString().split('\n')[4]).toBe(
			'      [clock::2026-08-16T11:00:00--2026-08-16T11:45:00]'
		)
		expect(isRunning(note.findTask('Unassigned')!)).toBe(false)
	})

	it('reports the end of the most recently closed clock', () => {
		const note = new TaskNote(content)
		expect(getLastEnd(note.findTask('Write plugin')!)).toEqual(at(10))
		expect(getLastEnd(note.findTask('Walk the dog')!)).toBeNull()
		expect(getLastEnd(note.findTask('Unassigned')!)).toBeNull()
	})

	it('ticks and unticks a task without touching the rest of the line', () => {
		const note = new TaskNote(content)
		note.setTicked(note.findTask('Write plugin')!, true)
		expect(note.toString().split('\n')[0]).toBe('- [x] Write plugin #project')
		note.setTicked(note.findTask('Write plugin')!, false)
		expect(note.toString().split('\n')[0]).toBe('- [ ] Write plugin #project')
	})

	it('moves the last clock line to another task, upwards or downwards, in time order', () => {
		const down = new TaskNote(content)
		down.moveLastClock(
			down.findTask('Write plugin')!,
			down.findTask('Unassigned')!
		)
		expect(down.toString().split('\n').slice(0, 5)).toEqual([
			'- [ ] Write plugin #project',
			'- [ ] Walk the dog #routine',
			'- [ ] Unassigned',
			'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
			'      [clock::2026-08-16T11:00:00]',
		])

		const up = new TaskNote(content)
		up.moveLastClock(up.findTask('Unassigned')!, up.findTask('Write plugin')!)
		expect(up.toString().split('\n').slice(0, 5)).toEqual([
			'- [ ] Write plugin #project',
			'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
			'      [clock::2026-08-16T11:00:00]',
			'- [ ] Walk the dog #routine',
			'- [ ] Unassigned',
		])
	})

	it('removes a task together with its clocks and keeps everything else', () => {
		const note = new TaskNote(content)
		note.removeTask(note.findTask('Write plugin')!)
		note.removeTask(note.findTask('Unassigned')!)
		expect(note.toString()).toBe(
			['- [ ] Walk the dog #routine', '', 'Notes'].join('\n')
		)
	})

	it('reports running tasks', () => {
		const note = new TaskNote(content)
		expect(note.getRunningTasks().map((t) => t.name)).toEqual(['Unassigned'])
	})
})

describe('TaskNote.insertTask', () => {
	it('inserts an unticked line after the last task clock block', () => {
		const note = new TaskNote(content)
		const task = note.insertTask('Deep work', ['#project', '#focus'])
		expect(note.toString().split('\n')[5]).toBe(
			'- [ ] Deep work #project #focus'
		)
		expect(task).toMatchObject({
			name: 'Deep work',
			tags: ['#project', '#focus'],
			ticked: false,
			clocks: [],
		})
	})

	it('inserts before trailing blank lines when the note has no task', () => {
		const note = new TaskNote('# Monday\n\n')
		note.insertTask('Solo', [])
		expect(note.toString()).toBe('# Monday\n- [ ] Solo\n\n')
	})

	it('appends to an empty note', () => {
		const note = new TaskNote('')
		note.insertTask('Solo', [])
		expect(note.toString()).toBe('- [ ] Solo\n')
	})
})

describe('chronologicalClockLines', () => {
	const sorted = (lines: string[]) =>
		chronologicalClockLines(lines, parseTasks(lines)[0]!)

	it('is null when the clocks are already in order', () => {
		expect(
			sorted([
				'- [ ] Write plugin',
				'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
				'      [clock::2026-08-16T11:00:00]',
			])
		).toBeNull()
	})

	it('sorts by start, a running clock included, keeping each line as written', () => {
		expect(
			sorted([
				'- [ ] Write plugin',
				'      [clock::2026-08-16T13:00:00]',
				'  [clock::2026-08-16T11:00:00--2026-08-16T12:00:00]',
				'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
			])
		).toEqual([
			'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
			'  [clock::2026-08-16T11:00:00--2026-08-16T12:00:00]',
			'      [clock::2026-08-16T13:00:00]',
		])
	})

	it('keeps clocks starting at the same time in their order', () => {
		expect(
			sorted([
				'- [ ] Write plugin',
				'      [clock::2026-08-16T11:00:00--2026-08-16T11:30:00]',
				'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
				'      [clock::2026-08-16T09:00:00--2026-08-16T09:15:00]',
			])
		).toEqual([
			'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
			'      [clock::2026-08-16T09:00:00--2026-08-16T09:15:00]',
			'      [clock::2026-08-16T11:00:00--2026-08-16T11:30:00]',
		])
	})
})

describe("TaskNote keeps the edited task's clocks in time order", () => {
	const day = [
		'- [ ] Write plugin',
		'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
		'      [clock::2026-08-16T11:00:00--2026-08-16T12:00:00]',
		'- [ ] Review',
		'      [clock::2026-08-16T14:00:00--2026-08-16T14:30:00]',
		'      [clock::2026-08-16T10:00:00--2026-08-16T10:30:00]',
	].join('\n')

	it('moves a retimed clock to its place', () => {
		const note = new TaskNote(day)
		const clock = note.findTask('Write plugin')!.clocks[1]!
		note.setClockTimes(clock, { start: at(8), end: at(8, 30) })
		expect(note.toString()).toBe(
			[
				'- [ ] Write plugin',
				'      [clock::2026-08-16T08:00:00--2026-08-16T08:30:00]',
				'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
				'- [ ] Review',
				'      [clock::2026-08-16T14:00:00--2026-08-16T14:30:00]',
				'      [clock::2026-08-16T10:00:00--2026-08-16T10:30:00]',
			].join('\n')
		)
	})

	it('places an added clock that started earlier among the others', () => {
		const note = new TaskNote(day)
		note.addClock(note.findTask('Write plugin')!, at(10, 15), at(10, 45))
		expect(note.toString().split('\n').slice(0, 4)).toEqual([
			'- [ ] Write plugin',
			'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
			'      [clock::2026-08-16T10:15:00--2026-08-16T10:45:00]',
			'      [clock::2026-08-16T11:00:00--2026-08-16T12:00:00]',
		])
	})

	it('sorts the edited task only, other tasks stay as written', () => {
		const note = new TaskNote(day)
		const clock = note.findTask('Review')!.clocks[1]!
		note.setClockTimes(clock, { start: at(15), end: at(16) })
		expect(note.toString()).toBe(
			[
				'- [ ] Write plugin',
				'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
				'      [clock::2026-08-16T11:00:00--2026-08-16T12:00:00]',
				'- [ ] Review',
				'      [clock::2026-08-16T14:00:00--2026-08-16T14:30:00]',
				'      [clock::2026-08-16T15:00:00--2026-08-16T16:00:00]',
			].join('\n')
		)
		const other = new TaskNote(day)
		const first = other.findTask('Write plugin')!.clocks[0]!
		other.setClockTimes(first, { start: at(9), end: at(9, 45) })
		expect(other.toString().split('\n').slice(3)).toEqual([
			'- [ ] Review',
			'      [clock::2026-08-16T14:00:00--2026-08-16T14:30:00]',
			'      [clock::2026-08-16T10:00:00--2026-08-16T10:30:00]',
		])
	})
})
