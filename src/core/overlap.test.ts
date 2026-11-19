import { describe, expect, it } from 'vitest'
import {
	addOverlap,
	computeOverlap,
	emptyOverlap,
	type TaskSpan,
} from './overlap'

const at = (h: number, m = 0, s = 0) => new Date(2026, 7, 16, h, m, s)

function span(
	task: string,
	from: [number, number],
	to: [number, number],
	keys = [task]
): TaskSpan {
	return { task, keys, interval: { start: at(...from), end: at(...to) } }
}

describe('computeOverlap', () => {
	it('counts covered, concurrent, shared minutes and partners', () => {
		// Deep work 9:00–11:00, Email 10:30–11:30: 30 minutes together.
		const stats = computeOverlap([
			span('Deep work', [9, 0], [11, 0]),
			span('Email', [10, 30], [11, 30]),
		])
		expect(stats.covered).toBe(150)
		expect(stats.concurrent).toBe(30)
		expect(stats.byTask).toEqual({
			'Deep work': { minutes: 120, shared: 30, partners: { Email: 30 } },
			Email: { minutes: 60, shared: 30, partners: { 'Deep work': 30 } },
		})
	})

	it('counts two overlapping clocks of the same task once', () => {
		const stats = computeOverlap([
			span('Write', [9, 0], [10, 0]),
			span('Write', [9, 30], [10, 30]),
		])
		expect(stats.covered).toBe(90)
		expect(stats.concurrent).toBe(0)
		expect(stats.byTask.Write).toEqual({ minutes: 90, shared: 0, partners: {} })
	})

	it('gives every partner of a three-way overlap its minutes', () => {
		// A 9–10, B 9:30–10, C 9:45–10:15: 9:45–10 has all three running.
		const stats = computeOverlap([
			span('A', [9, 0], [10, 0]),
			span('B', [9, 30], [10, 0]),
			span('C', [9, 45], [10, 15]),
		])
		expect(stats.covered).toBe(75)
		expect(stats.concurrent).toBe(60 + 30 + 30 - 75)
		// A shares 30 minutes in all, yet its partners add up to 45.
		expect(stats.byTask.A).toEqual({
			minutes: 60,
			shared: 30,
			partners: { B: 30, C: 15 },
		})
	})

	it('treats touching clocks as consecutive, not concurrent', () => {
		const stats = computeOverlap([
			span('A', [9, 0], [10, 0]),
			span('B', [10, 0], [11, 0]),
		])
		expect(stats.concurrent).toBe(0)
		expect(stats.byTask.A?.shared).toBe(0)
	})

	it('credits a key once per minute, however many of its tasks run', () => {
		const stats = computeOverlap([
			span('A', [9, 0], [10, 0], ['#work']),
			span('B', [9, 30], [10, 30], ['#work', '#calls']),
		])
		expect(stats.byKey).toEqual({ '#work': 90, '#calls': 60 })
	})

	it('counts whole minutes and skips empty clocks', () => {
		const stats = computeOverlap([
			{
				task: 'A',
				keys: ['A'],
				interval: { start: at(9, 0, 40), end: at(9, 10, 20) },
			},
			span('B', [9, 5], [9, 5]),
		])
		expect(stats.covered).toBe(10)
		expect(stats.byTask.B).toBeUndefined()
	})
})

describe('addOverlap', () => {
	it('sums days, partners included', () => {
		const total = emptyOverlap()
		const day = computeOverlap([
			span('A', [9, 0], [10, 0]),
			span('B', [9, 30], [10, 30]),
		])
		addOverlap(total, day)
		addOverlap(total, day)
		expect(total.covered).toBe(180)
		expect(total.concurrent).toBe(60)
		expect(total.byKey).toEqual({ A: 120, B: 120 })
		expect(total.byTask.A).toEqual({
			minutes: 120,
			shared: 60,
			partners: { B: 60 },
		})
	})
})
