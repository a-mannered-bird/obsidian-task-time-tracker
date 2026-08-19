import { describe, expect, it } from 'vitest'
import {
	minutesByTag,
	sortByMinutes,
	taskMinutes,
	totalMinutes,
} from './aggregate'
import { parseTasks } from './parser'

const now = new Date(2026, 7, 16, 15, 0, 0)
const tasks = parseTasks([
	'- [ ] Write plugin #project #selfDev',
	'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
	'      [clock::2026-08-16T14:30:00]',
	'- [ ] Walk the dog #routine',
	'      [clock::2026-08-16T08:00:00--2026-08-16T08:30:00]',
	'- [ ] Idle',
])

describe('taskMinutes', () => {
	it('sums closed clocks and counts a running clock up to now', () => {
		expect(taskMinutes(tasks[0]!, now)).toBe(90)
	})

	it('is zero for a task without clocks', () => {
		expect(taskMinutes(tasks[2]!, now)).toBe(0)
	})
})

describe('totalMinutes', () => {
	it('sums every task', () => {
		expect(totalMinutes(tasks, now)).toBe(120)
	})
})

describe('minutesByTag', () => {
	it('counts a task once per tag', () => {
		expect(minutesByTag(tasks, now)).toEqual({
			'#project': 90,
			'#selfDev': 90,
			'#routine': 30,
		})
	})
})

describe('sortByMinutes', () => {
	it('orders entries by descending minutes', () => {
		expect(sortByMinutes({ a: 5, b: 50, c: 10 })).toEqual([
			['b', 50],
			['c', 10],
			['a', 5],
		])
	})
})
