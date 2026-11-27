import { describe, expect, it } from 'vitest'
import { fakeVault } from '../test/fakeVault'
import { metricRuleOf } from './goalStyle'
import {
	describeMetricTags,
	describeMetricTotal,
	filterMetricInfos,
	metricInfos,
	sortMetricInfos,
	type MetricInfo,
} from './metricManager'
import { VaultTaskIndex } from './vaultTaskIndex'

const NOTES: Record<string, string> = {
	'2026-08-03.md': [
		'---',
		'tag_goals:',
		'  - "#sport 1h"',
		'---',
		'- [ ] Run',
		'      [goal::distance 8/10 km]',
		'      [goal::pace 5.2/<6 min/km]',
		'- [ ] Deep work',
		'      [goal::2h]',
		'      [clock::2026-08-03T09:00:00--2026-08-03T09:45:00]',
	].join('\n'),
	'2026-08-01.md': [
		'- [ ] Run',
		'      [goal::distance 3/5 mi]',
		'- [ ] Deep work',
		'      [goal::2h]',
		'      [clock::2026-08-01T09:00:00--2026-08-01T10:00:00]',
	].join('\n'),
	'2026-08-02.md': [
		'---',
		'tag_goals:',
		'  - "#work <6h"',
		'  - "#sport 1h"',
		'---',
		'- [ ] Run',
		'      [goal::distance 5/10 km]',
		'      [goal::pace 5.5/<6 min/km]',
		'- [ ] Bike',
		'      [goal::distance /20 km]',
	].join('\n'),
}

async function notes() {
	const index = new VaultTaskIndex(fakeVault(NOTES).source)
	await index.ensureBuilt()
	return index.notes()
}

const names = (infos: MetricInfo[]) => infos.map((info) => info.metric)

describe('metricInfos', () => {
	it('aggregates the time goals, each metric and the metrics with settings', async () => {
		const infos = metricInfos(
			await notes(),
			['steps', 'distance'],
			metricRuleOf({})
		)
		expect(infos).toEqual([
			{
				kind: 'time',
				metric: 'time',
				taskCount: 1,
				noteCount: 2,
				lastUsed: new Date('2026-08-03T00:00:00'),
				// Counted apart: tag goals do not add to the task notes.
				tags: ['#sport', '#work'],
				tagNoteCount: 2,
				total: null,
			},
			{
				kind: 'metric',
				metric: 'distance',
				taskCount: 2,
				noteCount: 3,
				lastUsed: new Date('2026-08-03T00:00:00'),
				tags: [],
				tagNoteCount: 0,
				unit: 'km',
				units: [
					{ unit: 'km', count: 3 },
					{ unit: 'mi', count: 1 },
				],
				// Summed in km only: Bike has no result, the 3 mi are left out.
				total: 5 + 8,
				leftOut: 1,
			},
			{
				kind: 'metric',
				metric: 'pace',
				taskCount: 1,
				noteCount: 2,
				lastUsed: new Date('2026-08-03T00:00:00'),
				tags: [],
				tagNoteCount: 0,
				unit: 'min/km',
				units: [{ unit: 'min/km', count: 2 }],
				// A rate averages by default: (5.5 + 5.2) / 2.
				total: 5.35,
				leftOut: 0,
			},
			{
				kind: 'metric',
				metric: 'steps',
				taskCount: 0,
				noteCount: 0,
				lastUsed: null,
				tags: [],
				tagNoteCount: 0,
				unit: '',
				units: [],
				total: null,
				leftOut: 0,
			},
		])
	})

	it("combines a metric's results with the rule set for it, in date order", async () => {
		const totalOf = async (rule: 'last' | 'min') => {
			const infos = metricInfos(
				await notes(),
				[],
				metricRuleOf({ distance: { rule } })
			)
			return infos.find((info) => info.metric === 'distance')?.total
		}
		// The notes are listed out of order; `last` still takes the 3rd's 8.
		expect(await totalOf('last')).toBe(8)
		expect(await totalOf('min')).toBe(5)
	})
})

describe('filterMetricInfos and sortMetricInfos', () => {
	it('filters case-insensitively', async () => {
		const infos = metricInfos(await notes(), ['steps'], metricRuleOf({}))
		expect(names(filterMetricInfos(infos, 'ST'))).toEqual(['distance', 'steps'])
		expect(filterMetricInfos(infos, ' ')).toEqual(infos)
	})

	it('keeps the time row first and the metrics without a total last', async () => {
		const infos = metricInfos(await notes(), ['steps'], metricRuleOf({}))
		expect(names(sortMetricInfos(infos, 'metric', false))).toEqual([
			'time',
			'steps',
			'pace',
			'distance',
		])
		expect(names(sortMetricInfos(infos, 'total'))).toEqual([
			'time',
			'distance',
			'pace',
			'steps',
		])
		expect(names(sortMetricInfos(infos, 'total', true))).toEqual([
			'time',
			'pace',
			'distance',
			'steps',
		])
	})
})

describe('describeMetricTotal', () => {
	it('gives the total its unit and names the results left out', async () => {
		const infos = metricInfos(await notes(), ['steps'], metricRuleOf({}))
		const total = (metric: string) =>
			describeMetricTotal(infos.find((info) => info.metric === metric)!)
		expect(total('time')).toEqual({ text: '—', title: null })
		expect(total('distance')).toEqual({
			text: '13 km',
			title: 'Leaves out 1 value in mi',
		})
		expect(total('steps')).toEqual({ text: '—', title: null })
	})
})

describe('describeMetricTags', () => {
	it('counts the tags and the notes setting their goals', async () => {
		const infos = metricInfos(await notes(), [], metricRuleOf({}))
		expect(describeMetricTags(infos[0]!)).toBe(
			'2 tags with a time goal, on 2 notes: #sport, #work'
		)
	})
})
