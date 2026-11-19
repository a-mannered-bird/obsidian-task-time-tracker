import { describe, expect, it } from 'vitest'
import { fakeVault } from '../test/fakeVault'
import {
	affectedPaths,
	consolidateInVault,
	deleteInVault,
	previewConsolidation,
	previewDeletion,
	previewRetag,
	retagInVault,
} from './taskOperations'
import { VaultTaskIndex } from './vaultTaskIndex'

const NOTES: Record<string, string> = {
	'2026-08-01.md': [
		'- [ ] Deep work #project',
		'      [clock::2026-08-01T09:00:00--2026-08-01T10:30:00]',
	].join('\n'),
	'2026-08-02.md': [
		'- [ ] Deep wok #project',
		'      [goal::1h]',
		'      [clock::2026-08-02T10:00:00--2026-08-02T10:20:00]',
		'- [ ] Task A #project',
		'      [goal::pages 3/10]',
		'      [clock::2026-08-02T11:00:00--2026-08-02T11:30:00]',
		'- [ ] Task B',
		'      [goal::pages 2/5]',
		'      [clock::2026-08-02T11:30:00--2026-08-02T12:00:00]',
	].join('\n'),
	'2026-08-03.md': [
		'- [ ] Task A #project',
		'      [goal::1h]',
		'      [clock::2026-08-03T09:00:00--2026-08-03T09:30:00]',
		'- [ ] Task B #project',
		'      [goal::30m]',
		'      [goal::calories 200 kcal]',
		'      [clock::2026-08-03T09:15:00--2026-08-03T09:45:00]',
		'- [ ] Email',
	].join('\n'),
}

async function setup() {
	const fake = fakeVault(NOTES)
	const index = new VaultTaskIndex(fake.source)
	await index.ensureBuilt()
	return { ...fake, index }
}

describe('previewConsolidation', () => {
	it('replays the per-note union from the index without reading files', async () => {
		const { index, getLoadCount } = await setup()
		const loadsAfterBuild = getLoadCount()
		// Pages on the 2nd and the time goals on the 3rd combine; calories
		// is on one side only and moves over.
		expect(previewConsolidation(index, ['Task B'], 'Task A')).toEqual({
			notes: 2,
			removedTaskLines: 2,
			removedClockLines: 2,
			combinedGoalLines: 4,
			notesCombiningGoals: 2,
		})
		expect(getLoadCount()).toBe(loadsAfterBuild)
	})

	it('counts a plain rename as touched notes with nothing removed', async () => {
		const { index } = await setup()
		expect(previewConsolidation(index, ['Deep wok'], 'Deep work')).toEqual({
			notes: 2,
			removedTaskLines: 0,
			removedClockLines: 0,
			combinedGoalLines: 0,
			notesCombiningGoals: 0,
		})
	})
})

describe('affectedPaths', () => {
	it('lists the notes holding any of the names, oldest first', async () => {
		const { index } = await setup()
		expect(affectedPaths(index, ['Deep wok', 'Deep work'])).toEqual([
			'2026-08-01.md',
			'2026-08-02.md',
		])
		expect(affectedPaths(index, ['Email', 'Nope'])).toEqual(['2026-08-03.md'])
	})
})

describe('consolidateInVault', () => {
	it('rewrites the affected notes and matches the preview', async () => {
		const { index, vault, read } = await setup()
		const preview = previewConsolidation(index, ['Task B'], 'Task A')
		const report = await consolidateInVault(vault, index, ['Task B'], 'Task A')

		expect(report.changedPaths).toEqual(['2026-08-02.md', '2026-08-03.md'])
		expect(report.failures).toEqual([])
		const removedTaskLines = report.results.reduce(
			(sum, result) => sum + result.removedTaskLines,
			0
		)
		const removedClockLines = report.results.reduce(
			(sum, result) => sum + result.removedClockLines,
			0
		)
		const combinedGoalLines = report.results.reduce(
			(sum, result) => sum + result.combinedGoalLines,
			0
		)
		expect({
			notes: report.changedPaths.length,
			removedTaskLines,
			removedClockLines,
			combinedGoalLines,
			notesCombiningGoals: report.results.filter(
				(result) => result.combinedGoalLines > 0
			).length,
		}).toEqual(preview)

		expect(read('2026-08-02.md')?.split('\n').slice(3)).toEqual([
			'- [ ] Task A #project',
			'      [goal::pages 5/15]',
			'      [clock::2026-08-02T11:00:00--2026-08-02T12:00:00]',
		])
		// Two minimum time goals add up: 1h + 30m.
		expect(read('2026-08-03.md')?.split('\n')).toEqual([
			'- [ ] Task A #project',
			'      [goal::1h30m]',
			'      [goal::calories 200 kcal]',
			'      [clock::2026-08-03T09:00:00--2026-08-03T09:45:00]',
			'- [ ] Email',
		])
		expect(read('2026-08-01.md')).toBe(NOTES['2026-08-01.md'])
	})

	it('leaves the index fresh through the store change events', async () => {
		const { index, vault } = await setup()
		await consolidateInVault(vault, index, ['Deep wok'], 'Deep work')
		const names = index.snapshot().map((info) => info.name)
		expect(names).not.toContain('Deep wok')
		expect(index.occurrences('Deep work')).toHaveLength(2)
	})
})

describe('previewDeletion / deleteInVault', () => {
	it('counts and removes every line of the task', async () => {
		const { index, vault, read } = await setup()
		expect(previewDeletion(index, ['Task A'])).toEqual({
			notes: 2,
			taskLines: 2,
			clockLines: 2,
		})
		const report = await deleteInVault(vault, index, ['Task A'])
		expect(report.changedPaths).toEqual(['2026-08-02.md', '2026-08-03.md'])
		expect(read('2026-08-03.md')?.split('\n')).toEqual([
			'- [ ] Task B #project',
			'      [goal::30m]',
			'      [goal::calories 200 kcal]',
			'      [clock::2026-08-03T09:15:00--2026-08-03T09:45:00]',
			'- [ ] Email',
		])
		expect(index.occurrences('Task A')).toEqual([])
	})
})

describe('previewRetag / retagInVault', () => {
	it('applies only where the change makes a difference', async () => {
		const { index, vault, read } = await setup()
		// Task B has #project on the 3rd only.
		const change = { add: ['#project'], remove: [] }
		expect(previewRetag(index, ['Task B'], change)).toEqual({
			notes: 1,
			taskLines: 1,
		})
		const report = await retagInVault(vault, index, ['Task B'], change)
		expect(report.changedPaths).toEqual(['2026-08-02.md'])
		expect(read('2026-08-02.md')?.split('\n').slice(6, 8)).toEqual([
			'- [ ] Task B #project',
			'      [goal::pages 2/5]',
		])
		expect(previewRetag(index, ['Task B'], change)).toEqual({
			notes: 0,
			taskLines: 0,
		})
	})
})
