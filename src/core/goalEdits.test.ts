import { describe, expect, it } from 'vitest'
import type { MetricGoal } from 'types/goals'
import {
	applyChange,
	achievedField,
	formatTargetField,
	targetField,
	typedFieldValue,
	goalStep,
	parseTypedChange,
	parseTypedNumber,
	parseTypedTarget,
	parseTypedTargetEdit,
	parseTypedTargetUnit,
	parseTypedTimeTarget,
	parseTypedTimeTargetEdit,
	removeGoal,
	setGoals,
	stepAchieved,
	stepTypedValue,
	timeTargetAfter,
	updateGoal,
} from './goalEdits'
import { parseGoal } from './goals'

const content = [
	'- [ ] Run #sport',
	'      [goal::1h]',
	'      [goal::distance 8/10 km]',
	'      [clock::2026-08-16T07:00:00--2026-08-16T07:50:00]',
	'- [ ] Anki',
	'  [goal::cards /200]',
	'',
].join('\n')

const distance = { taskName: 'Run', metric: 'distance', unit: 'km' }

const metric = (text: string): MetricGoal => {
	const parsed = parseGoal(text)
	if (!('goal' in parsed) || parsed.goal.kind !== 'metric') {
		throw new Error(text)
	}
	return parsed.goal
}

describe('updateGoal', () => {
	it('rewrites the goal line in place, keeping its indent', () => {
		const next = updateGoal(content, distance, (goal) =>
			goal.kind === 'metric' ? { ...goal, achieved: 9.5 } : goal
		)
		expect(next?.split('\n').slice(0, 4)).toEqual([
			'- [ ] Run #sport',
			'      [goal::1h]',
			'      [goal::distance 9.5/10 km]',
			'      [clock::2026-08-16T07:00:00--2026-08-16T07:50:00]',
		])
	})

	it('finds the time goal by its task', () => {
		const next = updateGoal(
			content,
			{ taskName: 'Run', metric: null, unit: '' },
			() => ({ kind: 'time', minutes: 90, atMost: false })
		)
		expect(next?.split('\n')[1]).toBe('      [goal::1h30m]')
	})

	it('is null when the goal is gone', () => {
		expect(
			updateGoal(content, { ...distance, unit: 'mi' }, (goal) => goal)
		).toBeNull()
	})
})

describe('removeGoal', () => {
	it('removes the goal line only', () => {
		expect(removeGoal(content, distance)?.split('\n').slice(0, 3)).toEqual([
			'- [ ] Run #sport',
			'      [goal::1h]',
			'      [clock::2026-08-16T07:00:00--2026-08-16T07:50:00]',
		])
	})
})

describe('setGoals', () => {
	it('adds a goal below the other goal lines, indented like them', () => {
		const next = setGoals(content, { name: 'Anki', tags: [], goals: [] }, [
			metric('reviews /50'),
		])
		expect(next.split('\n').slice(4)).toEqual([
			'- [ ] Anki',
			'  [goal::cards /200]',
			'  [goal::reviews /50]',
			'',
		])
	})

	it('replaces the target of a goal of that metric, keeping the result', () => {
		const next = setGoals(content, { name: 'Run', tags: [], goals: [] }, [
			metric('distance /12 km'),
		])
		expect(next.split('\n')[2]).toBe('      [goal::distance 8/12 km]')
	})

	it('adds a missing task with its carried goals, then the new one', () => {
		const next = setGoals(
			content,
			{ name: 'Read', tags: ['#learn'], goals: [metric('pages 30/40')] },
			[{ kind: 'time', minutes: 30, atMost: false }]
		)
		expect(next.split('\n').slice(6)).toEqual([
			'- [ ] Read #learn',
			'      [goal::pages /40]',
			'      [goal::30m]',
			'',
		])
	})
})

describe('typed values', () => {
	it('reads numbers with either decimal separator, empty as none', () => {
		expect(parseTypedNumber('5,2')).toEqual({ value: 5.2 })
		expect(parseTypedNumber(' ')).toEqual({ value: null })
		expect(parseTypedNumber('5 km')).toHaveProperty('error')
	})

	it('reads a target, < for at most', () => {
		expect(parseTypedTarget('<80')).toEqual({ target: 80, atMost: true })
		expect(parseTypedTarget('')).toEqual({ target: null, atMost: false })
		expect(parseTypedTarget('<')).toHaveProperty('error')
	})

	it('reads a time target as a duration or bare minutes', () => {
		expect(parseTypedTimeTarget('1h30m')).toEqual({
			minutes: 90,
			atMost: false,
		})
		expect(parseTypedTimeTarget('90')).toEqual({ minutes: 90, atMost: false })
		expect(parseTypedTimeTarget('<30')).toEqual({ minutes: 30, atMost: true })
		expect(parseTypedTimeTarget('soon')).toHaveProperty('error')
		expect(parseTypedTimeTarget('0m')).toHaveProperty('error')
	})

	it("reads a new metric's target with its unit", () => {
		expect(parseTypedTargetUnit('<80 kg')).toEqual({
			target: 80,
			atMost: true,
			unit: 'kg',
		})
		expect(parseTypedTargetUnit('12 km/h')).toMatchObject({ unit: 'km/h' })
		expect(parseTypedTargetUnit('km')).toHaveProperty('error')
	})

	it('shows a target as typed back', () => {
		expect(formatTargetField(metric('weight 81,4/<80,5 kg'))).toBe('<80,5')
		expect(formatTargetField({ kind: 'time', minutes: 30, atMost: true })).toBe(
			'<30m'
		)
	})
})

describe('relative changes', () => {
	it('reads +n and -n as changes, anything else as a value', () => {
		expect(parseTypedChange('+2')).toEqual({ add: 2 })
		expect(parseTypedChange(' - 1,5 ')).toEqual({ add: -1.5 })
		expect(parseTypedChange('7')).toEqual({ set: 7 })
		expect(parseTypedChange('')).toEqual({ set: null })
		expect(parseTypedChange('+')).toHaveProperty('error')
		expect(parseTypedChange('+x')).toHaveProperty('error')
	})

	it('adds to the current value, never below the floor', () => {
		expect(applyChange(8, { add: 2 })).toBe(10)
		// 0.1 + 0.2 kept to the finest decimal of its terms.
		expect(applyChange(0.1, { add: 0.2 })).toBe(0.3)
		expect(applyChange(null, { add: 3 })).toBe(3)
		expect(applyChange(2, { add: -5 })).toBe(0)
		expect(applyChange(8, { set: null })).toBe(null)
	})

	it('changes a target, keeping or setting its at most', () => {
		expect(parseTypedTargetEdit('<+5')).toEqual({
			change: { add: 5 },
			atMost: true,
		})
		expect(parseTypedTargetEdit('-1')).toEqual({
			change: { add: -1 },
			atMost: false,
		})
		expect(parseTypedTargetEdit('+')).toEqual({
			error: 'Type a number after + or -, like +2',
		})
		// A new goal has nothing to add to.
		expect(parseTypedTarget('+5')).toHaveProperty('error')
	})

	it('changes a time target, keeping its at most unless < is typed', () => {
		const limit = { minutes: 30, atMost: true }
		const plus = parseTypedTimeTargetEdit('+1h')
		if ('error' in plus) throw new Error(plus.error)
		expect(timeTargetAfter(limit, plus)).toEqual({ minutes: 90, atMost: true })
		const minus = parseTypedTimeTargetEdit('-45')
		if ('error' in minus) throw new Error(minus.error)
		// Never under a minute.
		expect(timeTargetAfter(limit, minus)).toEqual({ minutes: 1, atMost: true })
		const set = parseTypedTimeTargetEdit('2h')
		if ('error' in set) throw new Error(set.error)
		expect(timeTargetAfter(limit, set)).toEqual({ minutes: 120, atMost: false })
		expect(parseTypedTimeTargetEdit('+<1h')).toHaveProperty('error')
	})
})

describe('card fields', () => {
	it('edits a result as a number, 0 until one is recorded', () => {
		expect(achievedField(metric('cards /200')).value).toBe('0')
		expect(achievedField(metric('weight 81,4/<80 kg')).value).toBe('81.4')
	})

	it('edits a metric target as a number, keeping it at most', () => {
		const field = targetField(metric('weight 81,4/<80,5 kg'))
		expect(field).toEqual({ type: 'number', value: '80.5', atMost: true })
		expect(typedFieldValue(field, '79')).toBe('<79')
		expect(typedFieldValue(field, '')).toBe('')
	})

	it('edits a time target as text', () => {
		const parsed = parseGoal('<1h30m')
		if (!('goal' in parsed)) throw new Error('<1h30m')
		const field = targetField(parsed.goal)
		expect(field).toEqual({ type: 'text', value: '<1h30m' })
		expect(typedFieldValue(field, ' 90 ')).toBe('90')
	})
})

describe('stepping', () => {
	it('steps by 1, or by the finest decimal shown', () => {
		expect(goalStep(metric('distance 8/10 km'))).toBe(1)
		expect(goalStep(metric('speed 10.5/12 km/h'))).toBe(0.1)
		expect(stepAchieved(metric('speed 10.5/12 km/h'), 1)).toBe(10.6)
	})

	it('starts from zero without a result and never goes below it', () => {
		expect(stepAchieved(metric('cards /200'), 1)).toBe(1)
		expect(stepAchieved(metric('cards 0/200'), -1)).toBe(0)
	})

	it('steps a typed result by its finest decimal, else from the recorded one', () => {
		const weight = metric('weight 81,4/<80 kg')
		const step = (typed: string, direction: 1 | -1) =>
			stepTypedValue(weight, 'achieved', typed, direction)
		expect(step('80.95', -1)).toBe('80.94')
		expect(step('80.9', 1)).toBe('81')
		expect(step('abc', 1)).toBe('81.5')
		expect(step('+1', 1)).toBe('82.5')
		expect(step('80,9', -1)).toBe('80,8')
	})

	it('steps a typed target the same way, never below zero', () => {
		const cards = metric('cards 120/200')
		expect(stepTypedValue(cards, 'target', '200', 1)).toBe('201')
		expect(stepTypedValue(cards, 'target', '0', -1)).toBe('0')
		expect(stepTypedValue(cards, 'target', '', 1)).toBe('1')
	})
})
