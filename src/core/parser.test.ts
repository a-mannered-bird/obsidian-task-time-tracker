import { describe, expect, it } from 'vitest'
import { BARE_NUMBER_PROBLEM } from './goals'
import {
	formatClockLine,
	getTaskLabel,
	goalLineIndexes,
	parseTaskInput,
	parseTasks,
	taskBlockEnd,
} from './parser'

const note = [
	'---',
	'day_start: 2026-08-16T07:00:00',
	'---',
	'',
	'- [ ] Write plugin #project #selfDev',
	'      [clock::2026-08-16T09:00:00--2026-08-16T10:15:00]',
	'      [clock::2026-08-16T14:00:00]',
	'- [x] Walk the dog #routine',
	'      [clock::2026-08-16T08:00:00--2026-08-16T08:30:00]',
	'Some paragraph',
	'      [clock::2026-08-16T20:00:00--2026-08-16T20:30:00]',
	'- [ ] Unassigned',
]

describe('parseTasks', () => {
	const tasks = parseTasks(note)

	it('finds every checkbox line with its label, tags and ticked state', () => {
		expect(tasks.map((t) => [t.name, t.tags, t.ticked, t.lineIndex])).toEqual([
			['Write plugin', ['#project', '#selfDev'], false, 4],
			['Walk the dog', ['#routine'], true, 7],
			['Unassigned', [], false, 11],
		])
	})

	it('attaches the clock lines directly below a task, open or closed', () => {
		const [firstTask] = tasks
		expect(firstTask!.clocks).toEqual([
			{
				start: new Date(2026, 7, 16, 9, 0, 0),
				end: new Date(2026, 7, 16, 10, 15, 0),
				lineIndex: 5,
			},
			{ start: new Date(2026, 7, 16, 14, 0, 0), end: null, lineIndex: 6 },
		])
	})

	it('ignores clock lines that are not directly below a task', () => {
		const [, dogTask, unassignedTask] = tasks
		expect(dogTask!.clocks).toHaveLength(1)
		expect(unassignedTask!.clocks).toHaveLength(0)
	})

	it('accepts tags anywhere in the line and strips them from the name', () => {
		const [task] = parseTasks(['- [ ] #chores Clean the   kitchen #routine'])
		expect(task!.name).toBe('Clean the kitchen')
		expect(task!.tags).toEqual(['#chores', '#routine'])
	})

	it('drops clock lines whose timestamps do not parse', () => {
		const [task] = parseTasks(['- [ ] A', '      [clock::not-a-date]'])
		expect(task!.clocks).toEqual([])
	})
})

describe('parseTasks: goal lines', () => {
	const lines = [
		'- [ ] Run #sport',
		'      [goal::1h]',
		'      [goal::distance 8/10 km]',
		'      [clock::2026-08-16T07:00:00--2026-08-16T07:50:00]',
		'      [goal::90]',
		'      [goal::speed /12 km/h]',
		'- [ ] Email',
		'Some paragraph',
		'      [goal::pages /20]',
	]
	const [run, email] = parseTasks(lines)

	it('attaches the goal lines below a task, before or after its clocks', () => {
		expect(run!.goals.map((goal) => goal.lineIndex)).toEqual([1, 2, 5])
		expect(run!.goals[1]).toMatchObject({
			kind: 'metric',
			metric: 'distance',
			achieved: 8,
			target: 10,
		})
		expect(run!.clocks).toHaveLength(1)
		expect(taskBlockEnd(run!)).toBe(6)
	})

	it('keeps a goal line that does not read as a goal, with the problem', () => {
		expect(run!.malformedGoals).toEqual([
			{ lineIndex: 4, text: '90', problem: BARE_NUMBER_PROBLEM },
		])
		expect(goalLineIndexes(run!)).toEqual([1, 2, 4, 5])
	})

	it('ignores goal lines that are not directly below a task', () => {
		expect(email!.goals).toEqual([])
		expect(taskBlockEnd(email!)).toBe(7)
	})

	it('leaves other field lines out of the task', () => {
		const [task] = parseTasks([
			'- [ ] Run',
			'      [goal::1h]',
			'      [mood::good]',
			'      [goal::30m]',
		])
		expect(task!.goals).toHaveLength(1)
		expect(taskBlockEnd(task!)).toBe(2)
	})
})

describe('getTaskLabel', () => {
	it('returns the same label whether the task is ticked or not', () => {
		expect(getTaskLabel('- [x] Read #learn')).toBe('Read')
		expect(getTaskLabel('- [ ] Read #learn')).toBe('Read')
	})
})

describe('formatClockLine', () => {
	it('round-trips through the parser', () => {
		const start = new Date(2026, 7, 16, 9, 5, 7)
		const end = new Date(2026, 7, 16, 10, 0, 0)
		const [task] = parseTasks([
			'- [ ] A',
			formatClockLine(start, null),
			formatClockLine(start, end, '  '),
		])
		expect(task!.clocks.map((c) => [c.start, c.end])).toEqual([
			[start, null],
			[start, end],
		])
	})
})

describe('parseTaskInput', () => {
	it('splits free text into label and tags like a task line', () => {
		expect(parseTaskInput('  Write   blog post #project #writing ')).toEqual({
			name: 'Write blog post',
			tags: ['#project', '#writing'],
		})
		expect(parseTaskInput('#only-tags')).toEqual({
			name: '',
			tags: ['#only-tags'],
		})
	})
})
