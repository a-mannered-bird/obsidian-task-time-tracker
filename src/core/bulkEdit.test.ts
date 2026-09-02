import { describe, expect, it } from 'vitest'
import { fakeVault } from '../test/fakeVault'
import { runBulkEdit, type BulkEditVault } from './bulkEdit'

const NOTES = {
	'2026-08-01.md': 'alpha',
	'2026-08-02.md': 'beta',
	'2026-08-03.md': 'omicron',
}

/** Upper-cases content containing the letter `a`; other notes unchanged. */
const upperA = (content: string) => ({
	content: content.includes('a') ? content.toUpperCase() : content,
	changed: content.includes('a'),
})

describe('runBulkEdit', () => {
	it('writes only the changed files and reports them in order', async () => {
		const { vault, read } = fakeVault(NOTES)
		const report = await runBulkEdit(vault, Object.keys(NOTES), upperA)

		expect(report.changedPaths).toEqual(['2026-08-01.md', '2026-08-02.md'])
		expect(report.results.map((result) => result.content)).toEqual([
			'ALPHA',
			'BETA',
		])
		expect(read('2026-08-03.md')).toBe('omicron')
		expect(report.failures).toEqual([])
	})

	it('reports progress after every file, changed or not', async () => {
		const { vault } = fakeVault(NOTES)
		const progress: [number, number][] = []
		await runBulkEdit(vault, Object.keys(NOTES), upperA, (done, total) =>
			progress.push([done, total])
		)
		expect(progress).toEqual([
			[1, 3],
			[2, 3],
			[3, 3],
		])
	})

	it('keeps going past a failing file and reports it', async () => {
		const { vault, read } = fakeVault(NOTES)
		const flaky: BulkEditVault = {
			getFileByPath: (path) => vault.getFileByPath(path),
			process: (file, fn) =>
				file.path === '2026-08-01.md'
					? Promise.reject(new Error('disk on fire'))
					: vault.process(file, fn),
		}
		const report = await runBulkEdit(flaky, Object.keys(NOTES), upperA)

		expect(report.failures).toEqual([
			{ path: '2026-08-01.md', message: 'disk on fire' },
		])
		expect(report.changedPaths).toEqual(['2026-08-02.md'])
		expect(read('2026-08-01.md')).toBe('alpha')
	})

	it('reports a missing file as a failure', async () => {
		const { vault } = fakeVault(NOTES)
		const report = await runBulkEdit(vault, ['nope.md'], upperA)
		expect(report.failures).toEqual([
			{ path: 'nope.md', message: 'File not found' },
		])
	})
})
