import { describe, expect, it } from 'vitest'
import { fakeVault } from '../test/fakeVault'
import { VaultTaskIndex } from './vaultTaskIndex'

const NOTES: Record<string, string> = {
	'Journal/2026-08-01.md': [
		'- [ ] Deep work #project',
		'      [clock::2026-08-01T09:00:00--2026-08-01T10:00:00]',
		'- [ ] Email',
		'      [clock::2026-08-01T10:00:00--2026-08-01T10:30:00]',
	].join('\n'),
	'Journal/2026-08-02.md': [
		'- [ ] Deep work #focus',
		'      [clock::2026-08-02T09:00:00--2026-08-02T09:45:00]',
		'- [ ] Workout #routine',
	].join('\n'),
	'Journal/2026-08-03.md': [
		'- [ ] Deep work #focus',
		'- [ ] Deep work #dup',
		'      [clock::2026-08-03T09:00:00--2026-08-03T09:10:00]',
		'- [ ] Workout #routine',
	].join('\n'),
}

async function makeBuiltIndex(notes: Record<string, string>) {
	const fake = fakeVault(notes)
	const index = new VaultTaskIndex(fake.source)
	await index.ensureBuilt()
	return { ...fake, index }
}

describe('VaultTaskIndex.snapshot', () => {
	it('aggregates note count, minutes, last-used date and tags', async () => {
		const { index } = await makeBuiltIndex(NOTES)
		const byName = new Map(index.snapshot().map((info) => [info.name, info]))

		const deepWork = byName.get('Deep work')!
		// Two lines in the same note count as one note.
		expect(deepWork.noteCount).toBe(3)
		expect(deepWork.totalMinutes).toBe(60 + 45 + 10)
		expect(deepWork.lastUsed).toEqual(new Date('2026-08-03T00:00:00'))
		// Tags come from the first matching line of the most recent note.
		expect(deepWork.tags).toEqual(['#focus'])

		expect(byName.get('Workout')).toMatchObject({
			noteCount: 2,
			totalMinutes: 0,
			tags: ['#routine'],
		})
	})

	it('orders by note count, then last used, then name', async () => {
		const { index } = await makeBuiltIndex({
			'Journal/2026-08-01.md': [
				'- [ ] Most used',
				'- [ ] Recent pair',
				'- [ ] Stale pair',
			].join('\n'),
			'Journal/2026-08-02.md': ['- [ ] Most used', '- [ ] Stale pair'].join(
				'\n'
			),
			'Journal/2026-08-03.md': [
				'- [ ] Most used',
				'- [ ] Recent pair',
				'- [ ] Zeta',
				'- [ ] Alpha',
			].join('\n'),
		})
		expect(index.snapshot().map((info) => info.name)).toEqual([
			'Most used',
			'Recent pair',
			'Stale pair',
			'Alpha',
			'Zeta',
		])
	})

	it('counts a running clock up to now', async () => {
		const { index } = await makeBuiltIndex({
			'Journal/2026-08-01.md': [
				'- [ ] Running',
				'      [clock::2026-08-01T09:00:00]',
			].join('\n'),
		})
		const [info] = index.snapshot(new Date('2026-08-01T09:30:00'))
		expect(info?.totalMinutes).toBe(30)
	})
})

describe('VaultTaskIndex change handling', () => {
	it('updates aggregates when a note changes', async () => {
		const { index, setNote } = await makeBuiltIndex(NOTES)
		setNote('Journal/2026-08-03.md', '- [ ] Email #late')

		const byName = new Map(index.snapshot().map((info) => [info.name, info]))
		expect(byName.get('Deep work')?.noteCount).toBe(2)
		expect(byName.get('Deep work')?.tags).toEqual(['#focus'])
		expect(byName.get('Email')).toMatchObject({
			noteCount: 2,
			tags: ['#late'],
		})
	})

	it('forgets tasks whose only note is dropped', async () => {
		const { index, dropNote } = await makeBuiltIndex(NOTES)
		dropNote('Journal/2026-08-01.md')
		const names = index.snapshot().map((info) => info.name)
		expect(names).not.toContain('Email')
	})

	it('rescans on next use after a bulk invalidation', async () => {
		const built = await makeBuiltIndex(NOTES)
		built.setNote('Journal/2026-08-04.md', '- [ ] New task')
		built.invalidate()
		expect(built.index.isReady).toBe(false)

		await built.index.ensureBuilt()
		const names = built.index.snapshot().map((info) => info.name)
		expect(names).toContain('New task')
		expect(names).toContain('Deep work')
	})
})

describe('VaultTaskIndex.ensureBuilt', () => {
	it('scans each file once across concurrent and repeated calls', async () => {
		const fake = fakeVault(NOTES)
		const index = new VaultTaskIndex(fake.source)
		await Promise.all([index.ensureBuilt(), index.ensureBuilt()])
		await index.ensureBuilt()
		expect(fake.getLoadCount()).toBe(3)
		expect(index.isReady).toBe(true)
	})
})

describe('VaultTaskIndex.allTags', () => {
	it('lists every tag once, sorted', async () => {
		const { index } = await makeBuiltIndex(NOTES)
		expect(index.allTags()).toEqual(['#dup', '#focus', '#project', '#routine'])
	})
})

describe('VaultTaskIndex.occurrences', () => {
	it('lists every line of the name, oldest note first', async () => {
		const { index } = await makeBuiltIndex(NOTES)
		const occurrences = index.occurrences('Deep work')
		expect(
			occurrences.map(({ path, task }) => [path, task.tags.join(',')])
		).toEqual([
			['Journal/2026-08-01.md', '#project'],
			['Journal/2026-08-02.md', '#focus'],
			['Journal/2026-08-03.md', '#focus'],
			['Journal/2026-08-03.md', '#dup'],
		])
	})
})
