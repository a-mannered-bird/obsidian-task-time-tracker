import { describe, expect, it } from 'vitest'
import { fakeVault } from '../test/fakeVault'
import {
	describeTagGoals,
	filterTagInfos,
	sortTagInfos,
	tagInfos,
} from './tagManager'
import { VaultTaskIndex } from './vaultTaskIndex'

const NOTES: Record<string, string> = {
	'2026-08-01.md': [
		'- [ ] Deep work #work',
		'      [clock::2026-08-01T09:00:00--2026-08-01T10:00:00]',
		'- [ ] Review #work #focus',
		'      [clock::2026-08-01T09:30:00--2026-08-01T10:30:00]',
	].join('\n'),
	'2026-08-02.md': [
		'---',
		'tag_goals:',
		'  - "#sport 1h"',
		'  - "#work <6h"',
		'---',
		'- [ ] Deep work #work',
		'      [clock::2026-08-02T09:00:00--2026-08-02T09:20:00]',
	].join('\n'),
}

async function notes() {
	const index = new VaultTaskIndex(fakeVault(NOTES).source)
	await index.ensureBuilt()
	return index.notes()
}

describe('tagInfos', () => {
	it('aggregates tags from task lines, tag goals and the mappings', async () => {
		const infos = tagInfos(await notes(), ['#chores', '#work'], new Date())
		expect(infos).toEqual([
			{
				tag: '#work',
				taskCount: 2,
				noteCount: 2,
				lastUsed: new Date('2026-08-02T00:00:00'),
				// 9:00–10:30 covered once on the 1st (the two clocks overlap),
				// plus 20 minutes on the 2nd.
				totalMinutes: 90 + 20,
				goals: [{ metric: 'time', noteCount: 1 }],
			},
			{
				tag: '#focus',
				taskCount: 1,
				noteCount: 1,
				lastUsed: new Date('2026-08-01T00:00:00'),
				totalMinutes: 60,
				goals: [],
			},
			{
				tag: '#sport',
				taskCount: 0,
				noteCount: 1,
				lastUsed: new Date('2026-08-02T00:00:00'),
				totalMinutes: 0,
				goals: [{ metric: 'time', noteCount: 1 }],
			},
			{
				tag: '#chores',
				taskCount: 0,
				noteCount: 0,
				lastUsed: null,
				totalMinutes: 0,
				goals: [],
			},
		])
	})
})

describe('filterTagInfos and sortTagInfos', () => {
	it('filters case-insensitively and sorts by each key', async () => {
		const infos = tagInfos(await notes(), ['#chores'], new Date())
		expect(filterTagInfos(infos, 'O').map((i) => i.tag)).toEqual([
			'#work',
			'#focus',
			'#sport',
			'#chores',
		])
		expect(filterTagInfos(infos, '#wo').map((i) => i.tag)).toEqual(['#work'])
		expect(sortTagInfos(infos, 'tag').map((i) => i.tag)).toEqual([
			'#chores',
			'#focus',
			'#sport',
			'#work',
		])
		// Never used sorts last, newest first; ties by tag.
		expect(sortTagInfos(infos, 'lastUsed').map((i) => i.tag)).toEqual([
			'#sport',
			'#work',
			'#focus',
			'#chores',
		])
		expect(sortTagInfos(infos, 'tasks', true).map((i) => i.tag)).toEqual([
			'#chores',
			'#sport',
			'#focus',
			'#work',
		])
	})
})

describe('the goal: query on tags', () => {
	it('matches the tags with a goal of the metric, exactly or as typed', async () => {
		const infos = tagInfos(await notes(), [], new Date())
		const tags = (query: string) =>
			filterTagInfos(infos, query).map((info) => info.tag)
		expect(tags('goal:time')).toEqual(['#work', '#sport'])
		expect(tags('goal:TI')).toEqual(['#work', '#sport'])
		expect(tags('goal:distance')).toEqual([])
	})

	it('describes the goals of a tag', async () => {
		const infos = tagInfos(await notes(), [], new Date())
		expect(describeTagGoals(infos.find((info) => info.tag === '#work')!)).toBe(
			'Has a time goal on 1 note'
		)
	})
})
