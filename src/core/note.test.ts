import { describe, expect, it } from 'vitest'
import { getLastEnd, isRunning, TaskNote } from './note'

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

	it('moves the last clock line to another task, upwards or downwards', () => {
		const down = new TaskNote(content)
		down.moveLastClock(
			down.findTask('Write plugin')!,
			down.findTask('Unassigned')!
		)
		expect(down.toString().split('\n').slice(0, 5)).toEqual([
			'- [ ] Write plugin #project',
			'- [ ] Walk the dog #routine',
			'- [ ] Unassigned',
			'      [clock::2026-08-16T11:00:00]',
			'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
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
