import { describe, expect, it } from 'vitest'
import { filterTaskInfos, sortTaskInfos } from './taskManager'
import type { VaultTaskInfo } from './vaultTaskIndex'

const info = (
	name: string,
	overrides: Partial<VaultTaskInfo> = {}
): VaultTaskInfo => ({
	name,
	tags: [],
	noteCount: 1,
	lastUsed: new Date(2026, 7, 1),
	totalMinutes: 0,
	...overrides,
})

const infos = [
	info('Deep work', { tags: ['#focus'], noteCount: 3, totalMinutes: 120 }),
	info('Email', {
		noteCount: 2,
		lastUsed: new Date(2026, 7, 20),
		totalMinutes: 45,
	}),
	info('Workout', { tags: ['#routine'], noteCount: 2, totalMinutes: 300 }),
]

describe('filterTaskInfos', () => {
	it('matches the name or a tag, case-insensitively', () => {
		expect(filterTaskInfos(infos, 'WORK').map((i) => i.name)).toEqual([
			'Deep work',
			'Workout',
		])
		expect(filterTaskInfos(infos, '#rout').map((i) => i.name)).toEqual([
			'Workout',
		])
	})

	it('returns everything for a blank query', () => {
		expect(filterTaskInfos(infos, '  ')).toEqual(infos)
	})
})

describe('sortTaskInfos', () => {
	it('defaults to the natural direction of each key', () => {
		expect(sortTaskInfos(infos, 'usage').map((i) => i.name)).toEqual([
			'Deep work',
			'Email',
			'Workout',
		])
		expect(sortTaskInfos(infos, 'name').map((i) => i.name)).toEqual([
			'Deep work',
			'Email',
			'Workout',
		])
		expect(sortTaskInfos(infos, 'lastUsed').map((i) => i.name)).toEqual([
			'Email',
			'Deep work',
			'Workout',
		])
		expect(sortTaskInfos(infos, 'total').map((i) => i.name)).toEqual([
			'Workout',
			'Deep work',
			'Email',
		])
	})

	it('flips with the ascending flag and keeps ties in input order', () => {
		expect(sortTaskInfos(infos, 'usage', true).map((i) => i.name)).toEqual([
			'Email',
			'Workout',
			'Deep work',
		])
		expect(sortTaskInfos(infos, 'name', false).map((i) => i.name)).toEqual([
			'Workout',
			'Email',
			'Deep work',
		])
	})
})
