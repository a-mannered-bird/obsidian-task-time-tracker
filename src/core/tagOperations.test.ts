import { describe, expect, it } from 'vitest'
import { fakeVault } from '../test/fakeVault'
import {
	combineTagGoals,
	consolidateTagsInNote,
	consolidateTagsInVault,
	deleteTagsInNote,
	deleteTagsInVault,
	previewTagConsolidation,
	previewTagDeletion,
} from './tagOperations'
import { VaultTaskIndex } from './vaultTaskIndex'

describe('consolidateTagsInNote', () => {
	it('renames the tag in place, keeping it once per line', () => {
		const note = [
			'- [ ] Emails #job',
			'      [clock::2026-08-01T09:00:00--2026-08-01T09:30:00]',
			'- [ ] Review PR #work #job',
			'- [x] Plan #job #focus',
			'- [ ] Meeting #work/meeting #jobs',
			'Text #job outside any task',
		].join('\n')
		const result = consolidateTagsInNote(note, ['#job'], '#work')
		expect(result.content).toBe(
			[
				'- [ ] Emails #work',
				'      [clock::2026-08-01T09:00:00--2026-08-01T09:30:00]',
				'- [ ] Review PR #work',
				'- [x] Plan #work #focus',
				'- [ ] Meeting #work/meeting #jobs',
				'Text #job outside any task',
			].join('\n')
		)
		expect(result.changedTaskLines).toBe(3)
	})

	it('folds the sources into the first of them when the target is absent', () => {
		const result = consolidateTagsInNote(
			'- [ ] Call #b #a #c',
			['#a', '#b'],
			'#c'
		)
		expect(result.content).toBe('- [ ] Call #c')
	})

	it('adds tag goals comparing the same way and keeps the target otherwise', () => {
		const note = [
			'---',
			'tag_goals:',
			'  - "#sport 1h"',
			'  - "#job 2h"',
			'  - "#leisure <1h"',
			'  - "#work 6h"',
			'---',
			'- [ ] Email #job',
		].join('\n')
		const merged = consolidateTagsInNote(note, ['#job'], '#work')
		expect(merged.content).toBe(
			[
				'---',
				'tag_goals:',
				'  - "#sport 1h"',
				'  - "#work 8h"',
				'  - "#leisure <1h"',
				'---',
				'- [ ] Email #work',
			].join('\n')
		)
		expect(merged.changedGoals).toBe(1)

		// "<1h" is a limit, "1h" a minimum: they cannot add up.
		const mixed = consolidateTagsInNote(note, ['#leisure'], '#sport')
		expect(mixed.content.split('\n').slice(1, 5)).toEqual([
			'tag_goals:',
			'  - "#sport 1h"',
			'  - "#job 2h"',
			'  - "#work 6h"',
		])
	})

	it('leaves a note without the sources unchanged', () => {
		const note = '- [ ] Email #work'
		expect(consolidateTagsInNote(note, ['#job'], '#work')).toEqual({
			content: note,
			changed: false,
			changedTaskLines: 0,
			changedGoals: 0,
		})
	})
})

describe('combineTagGoals', () => {
	it("starts from the target's own goal, whatever the order", () => {
		expect(
			combineTagGoals(
				[
					{ tag: '#job', minutes: 60, atMost: true },
					{ tag: '#work', minutes: 120, atMost: false },
					{ tag: '#side', minutes: 30, atMost: false },
				],
				'#work'
			)
		).toEqual({ tag: '#work', minutes: 150, atMost: false })
	})
})

describe('deleteTagsInNote', () => {
	it('strips the tags from task lines and drops their goals', () => {
		const note = [
			'---',
			'tag_goals:',
			'  - "#job 2h"',
			'  - "#work 6h"',
			'---',
			'- [ ] Email #job #work',
			'- [ ] Call #job',
			'- [ ] Plan #jobs',
		].join('\n')
		const result = deleteTagsInNote(note, ['#job'])
		expect(result.content).toBe(
			[
				'---',
				'tag_goals:',
				'  - "#work 6h"',
				'---',
				'- [ ] Email #work',
				'- [ ] Call',
				'- [ ] Plan #jobs',
			].join('\n')
		)
		expect(result).toMatchObject({ changedTaskLines: 2, changedGoals: 1 })
	})
})

const NOTES: Record<string, string> = {
	'2026-08-01.md': ['- [ ] Email #job', '- [ ] Review #work #job'].join('\n'),
	'2026-08-02.md': [
		'---',
		'tag_goals:',
		'  - "#job 1h"',
		'  - "#work 2h"',
		'---',
		'- [ ] Plan #focus',
	].join('\n'),
	'2026-08-03.md': '- [ ] Standup #work',
}

async function setup() {
	const fake = fakeVault(NOTES)
	const index = new VaultTaskIndex(fake.source)
	await index.ensureBuilt()
	return { ...fake, index }
}

describe('tag operations across the vault', () => {
	it('previews and runs a merge over the notes holding a source', async () => {
		const { index, vault, read } = await setup()
		expect(previewTagConsolidation(index, ['#job'], '#work')).toEqual({
			notes: 2,
			taskLines: 2,
			goals: 1,
			notesCombiningGoals: 1,
		})
		const report = await consolidateTagsInVault(vault, index, ['#job'], '#work')
		expect(report.changedPaths).toEqual(['2026-08-01.md', '2026-08-02.md'])
		expect(read('2026-08-01.md')).toBe(
			['- [ ] Email #work', '- [ ] Review #work'].join('\n')
		)
		expect(read('2026-08-02.md')).toBe(
			['---', 'tag_goals:', '  - "#work 3h"', '---', '- [ ] Plan #focus'].join(
				'\n'
			)
		)
		// Idempotent: a second run finds nothing left to do.
		const again = await consolidateTagsInVault(vault, index, ['#job'], '#work')
		expect(again.changedPaths).toEqual([])
	})

	it('previews and runs a deletion', async () => {
		const { index, vault, read } = await setup()
		expect(previewTagDeletion(index, ['#work'])).toEqual({
			notes: 3,
			taskLines: 2,
			goals: 1,
			notesCombiningGoals: 0,
		})
		const report = await deleteTagsInVault(vault, index, ['#work'])
		expect(report.changedPaths).toHaveLength(3)
		expect(read('2026-08-03.md')).toBe('- [ ] Standup')
	})
})
