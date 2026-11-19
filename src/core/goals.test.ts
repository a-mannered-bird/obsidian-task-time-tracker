import { describe, expect, it } from 'vitest'
import type { Goal } from 'types/goals'
import {
	aggregate,
	BARE_NUMBER_PROBLEM,
	defaultAggregation,
	describeTaskGoals,
	formatGoal,
	parseGoal,
	planGoalMerge,
	targetOnly,
	type AggregationRuleOf,
	type GoalMergeOutput,
} from './goals'
import { parseTasks } from './parser'

describe('parseGoal', () => {
	it.each([
		['1h', { kind: 'time', minutes: 60, atMost: false }],
		['1h30m', { kind: 'time', minutes: 90, atMost: false }],
		['1h 30m', { kind: 'time', minutes: 90, atMost: false }],
		['90m', { kind: 'time', minutes: 90, atMost: false }],
		['1.5h', { kind: 'time', minutes: 90, atMost: false }],
		['1,5h', { kind: 'time', minutes: 90, atMost: false }],
		['<30m', { kind: 'time', minutes: 30, atMost: true }],
	])('reads the time goal %s', (text, goal) => {
		expect(parseGoal(text)).toEqual({ goal })
	})

	it.each([
		[
			'distance 8/10 km',
			{ metric: 'distance', achieved: 8, target: 10, unit: 'km' },
		],
		[
			'speed /12 km/h',
			{ metric: 'speed', achieved: null, target: 12, unit: 'km/h' },
		],
		[
			'calories 650 kcal',
			{ metric: 'calories', achieved: 650, target: null, unit: 'kcal' },
		],
		[
			'flash cards 140/200',
			{ metric: 'flash cards', achieved: 140, target: 200, unit: '' },
		],
		[
			'5k pace: 5,2/5 min/km',
			{
				metric: '5k pace',
				achieved: 5.2,
				target: 5,
				unit: 'min/km',
				decimalComma: true,
			},
		],
		['meditation', { metric: 'meditation', achieved: null, target: null }],
	])('reads the metric goal %s', (text, expected) => {
		expect(parseGoal(text)).toEqual({
			goal: {
				kind: 'metric',
				atMost: false,
				unit: '',
				decimalComma: false,
				...expected,
			},
		})
	})

	it('reads a target starting with < as at most', () => {
		expect(parseGoal('weight 81.4/<80 kg')).toMatchObject({
			goal: { metric: 'weight', achieved: 81.4, target: 80, atMost: true },
		})
	})

	it.each([
		['90', BARE_NUMBER_PROBLEM],
		['<90', BARE_NUMBER_PROBLEM],
		['1h30', BARE_NUMBER_PROBLEM],
		['8/10 km', 'Add a metric name before the numbers'],
		['screen <2 h', 'Put < after the /, as in /<10'],
		['distance 8 10', 'Write it as: metric achieved/target unit'],
		['distance 8/< km', 'Write it as: metric achieved/target unit'],
	])('explains what is wrong with %s', (text, problem) => {
		expect(parseGoal(text)).toEqual({ problem })
	})
})

describe('formatGoal', () => {
	it.each([
		'1h',
		'1h30m',
		'45m',
		'<30m',
		'distance 8/10 km',
		'speed /12 km/h',
		'calories 650 kcal',
		'weight 81.4/<80 kg',
		'5k pace: 5,2/5 min/km',
	])('writes %s back as read', (text) => {
		const parsed = parseGoal(text)
		expect('goal' in parsed && formatGoal(parsed.goal)).toBe(text)
	})

	it('writes durations in hours and minutes', () => {
		const parsed = parseGoal('1.5h')
		expect('goal' in parsed && formatGoal(parsed.goal)).toBe('1h30m')
	})

	it('keeps the slash when nothing is achieved nor targeted', () => {
		const parsed = parseGoal('calories 650 kcal')
		expect('goal' in parsed && formatGoal(targetOnly(parsed.goal))).toBe(
			'calories / kcal'
		)
	})
})

describe('describeTaskGoals', () => {
	it('lists the goal lines in note order, malformed ones as written', () => {
		const [task] = parseTasks([
			'- [ ] Run #sport',
			'      [goal::1h]',
			'      [goal::90]',
			'      [goal::distance 8/10 km]',
		])
		expect(describeTaskGoals(task!)).toBe('Run · 1h, 90, distance 8/10 km')
	})
})

describe('aggregate', () => {
	it.each([
		['sum', [0.1, 0.2], 0.3],
		['average', [5, 6], 5.5],
		['average', [5.2, 5.1, 5.15], 5.15],
		['last', [3, 1, 2], 2],
		['min', [3, 1, 2], 1],
		['max', [3, 1, 2], 3],
	] as const)('%s of %j is %s', (rule, values, result) => {
		expect(aggregate(rule, [...values])).toBe(result)
	})

	it('is null without values', () => {
		expect(aggregate('sum', [])).toBeNull()
	})

	it('averages rates by default, adds up the rest', () => {
		expect(defaultAggregation('km/h')).toBe('average')
		expect(defaultAggregation('km')).toBe('sum')
	})
})

describe('planGoalMerge', () => {
	const goal = (text: string): Goal => {
		const parsed = parseGoal(text)
		if (!('goal' in parsed)) throw new Error(parsed.problem)
		return parsed.goal
	}
	/** Each line's goals as written; malformed ones as `!text`. */
	const plan = (groups: string[][], survivor = 0, ruleOf?: AggregationRuleOf) =>
		planGoalMerge(
			groups,
			survivor,
			(text) => (text.startsWith('!') ? null : goal(text)),
			ruleOf
		).map((output: GoalMergeOutput<string>) =>
			output.kind === 'keep' ? output.item : formatGoal(output.goal)
		)

	it('moves a metric found on one side only, unchanged', () => {
		expect(plan([['distance 8/10 km'], ['calories 650 kcal']])).toEqual([
			'distance 8/10 km',
			'calories 650 kcal',
		])
	})

	it('combines the same metric with its rule, achieved and targets alike', () => {
		expect(plan([['distance 3/5 km'], ['distance 5/5 km']])).toEqual([
			'distance 8/10 km',
		])
		// A rate averages: (10 + 12) / 2.
		expect(plan([['speed 10/12 km/h'], ['speed 12/12 km/h']])).toEqual([
			'speed 11/12 km/h',
		])
		expect(plan([['distance /5 km'], ['distance 4 km']])).toEqual([
			'distance 4/5 km',
		])
	})

	it('keeps both lines when the units differ', () => {
		expect(plan([['distance 3/5 km'], ['distance 2/3 mi']])).toEqual([
			'distance 3/5 km',
			'distance 2/3 mi',
		])
	})

	it('adds up two minimum time goals', () => {
		expect(plan([['1h'], ['30m']])).toEqual(['1h30m'])
	})

	it("keeps the survivor's time goal when a limit is involved", () => {
		expect(plan([['1h'], ['<30m']], 1)).toEqual(['<30m'])
		expect(plan([['<30m'], ['1h']])).toEqual(['<30m'])
	})

	it("keeps the survivor's target when the directions differ", () => {
		expect(
			plan([['weight 82/<80 kg'], ['weight 81/85 kg']], 1, () => 'last')
		).toEqual(['weight 81/85 kg'])
	})

	it('lists the survivor first, the others in note order, malformed lines kept', () => {
		expect(
			plan(
				[
					['!90', 'pages 2/5'],
					['1h', 'pages 1/5'],
				],
				1
			)
		).toEqual(['1h', 'pages 3/10', '!90'])
	})

	it('leaves duplicates within one line alone', () => {
		expect(plan([['pages 1/5', 'pages 2/5'], []])).toEqual([
			'pages 1/5',
			'pages 2/5',
		])
	})
})
