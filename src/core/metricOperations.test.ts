import { describe, expect, it } from 'vitest'
import { fakeVault } from '../test/fakeVault'
import { defaultAggregationRuleOf } from './goals'
import { metricRuleOf } from './goalStyle'
import {
	editMetricsInNote,
	editMetricsInVault,
	metricNameProblem,
	previewMetricEdit,
	type MetricOperation,
} from './metricOperations'
import { VaultTaskIndex } from './vaultTaskIndex'

const NOTE = [
	'- [ ] Run',
	'      [goal::km 3/5 km]',
	'      [goal::pace 5,2/<6 min/km]',
	'      [goal::distance 5/10 km]',
	'      [clock::2026-08-01T07:00:00--2026-08-01T07:30:00]',
	'- [ ] Bike',
	'      [goal::km 20 km]',
	'- [ ] Swim',
	'      [goal::km 1/2 mi]',
	'      [goal::distance 1/2 km]',
].join('\n')

const mergeKm: MetricOperation = {
	kind: 'consolidate',
	sources: ['km'],
	target: 'distance',
	ruleOf: defaultAggregationRuleOf,
}

describe('editMetricsInNote', () => {
	it('merges a metric into another, combining the lines in the same unit', () => {
		const result = editMetricsInNote(NOTE, mergeKm)
		expect(result.content).toBe(
			[
				'- [ ] Run',
				'      [goal::pace 5,2/<6 min/km]',
				// The target's line stays in place and sums both: 5 + 3, 10 + 5.
				'      [goal::distance 8/15 km]',
				'      [clock::2026-08-01T07:00:00--2026-08-01T07:30:00]',
				'- [ ] Bike',
				'      [goal::distance 20 km]',
				'- [ ] Swim',
				// Miles and kilometres do not combine: both lines stay.
				'      [goal::distance 1/2 mi]',
				'      [goal::distance 1/2 km]',
			].join('\n')
		)
		expect(result).toMatchObject({ changedGoalLines: 4, combinedGoalLines: 2 })
		// Idempotent: nothing is left to merge.
		expect(editMetricsInNote(result.content, mergeKm).changed).toBe(false)
	})

	it("combines with the target metric's rule", () => {
		const { content } = editMetricsInNote(NOTE, {
			...mergeKm,
			ruleOf: metricRuleOf({ distance: { rule: 'max' }, km: { rule: 'sum' } }),
		})
		expect(content.split('\n')[2]).toBe('      [goal::distance 5/10 km]')
	})

	it('renames onto a name with a digit, keeping the decimal comma', () => {
		const { content } = editMetricsInNote(NOTE, {
			...mergeKm,
			sources: ['pace'],
			target: '5k pace',
		})
		expect(content.split('\n')[2]).toBe('      [goal::5k pace: 5,2/<6 min/km]')
	})

	it('deletes every goal line of the metrics', () => {
		const result = editMetricsInNote(NOTE, { kind: 'delete', metrics: ['km'] })
		expect(result.content).toBe(
			[
				'- [ ] Run',
				'      [goal::pace 5,2/<6 min/km]',
				'      [goal::distance 5/10 km]',
				'      [clock::2026-08-01T07:00:00--2026-08-01T07:30:00]',
				'- [ ] Bike',
				'- [ ] Swim',
				'      [goal::distance 1/2 km]',
			].join('\n')
		)
		expect(result.changedGoalLines).toBe(3)
	})

	it('changes the unit of the chosen units only, never the values', () => {
		const result = editMetricsInNote(NOTE, {
			kind: 'changeUnit',
			metric: 'km',
			fromUnits: ['mi'],
			toUnit: 'km',
		})
		expect(result.content.split('\n')[8]).toBe('      [goal::km 1/2 km]')
		expect(result.changedGoalLines).toBe(1)
	})
})

describe('metric operations across the vault', () => {
	async function setup() {
		const fake = fakeVault({
			'2026-08-01.md': NOTE,
			'2026-08-02.md': ['- [ ] Run', '      [goal::km /5 km]'].join('\n'),
			'2026-08-03.md': ['- [ ] Run', '      [goal::distance /10 km]'].join(
				'\n'
			),
		})
		const index = new VaultTaskIndex(fake.source)
		await index.ensureBuilt()
		return { ...fake, index }
	}

	it('previews from the index and runs over the notes holding a source', async () => {
		const { index, vault, read } = await setup()
		expect(previewMetricEdit(index, mergeKm)).toEqual({
			notes: 2,
			goalLines: 5,
			combinedGoalLines: 2,
			notesCombiningGoals: 1,
		})
		const report = await editMetricsInVault(vault, index, mergeKm)
		expect(report.changedPaths).toEqual(['2026-08-01.md', '2026-08-02.md'])
		expect(read('2026-08-02.md')).toBe(
			['- [ ] Run', '      [goal::distance /5 km]'].join('\n')
		)
	})
})

describe('metricNameProblem', () => {
	it('accepts the names a goal line reads back, digits included', () => {
		expect(metricNameProblem('distance')).toBeNull()
		expect(metricNameProblem('5k pace')).toBeNull()
	})

	it('refuses an empty name, the time goals’ name and what a line cannot hold', () => {
		for (const name of [' ', 'time', 'a:b', 'km/h', 'a]', 'b<']) {
			expect(metricNameProblem(name)).not.toBeNull()
		}
	})
})
