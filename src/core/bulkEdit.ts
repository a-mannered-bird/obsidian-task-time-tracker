import type { TFile, Vault } from 'obsidian'

/** What the runner needs from the vault; the real Vault satisfies it. */
export type BulkEditVault = Pick<Vault, 'getFileByPath' | 'process'>

/** Pure rewrite of one note; `changed` false skips the write entirely. */
export type BulkTransform<Result extends BulkTransformResult> = (
	content: string,
	path: string
) => Result

export type BulkTransformResult = { content: string; changed: boolean }

export type BulkEditReport<Result extends BulkTransformResult> = {
	/** Paths whose content changed, in processing order. */
	changedPaths: string[]
	/** Transform results of the changed files, for aggregating counts. */
	results: Result[]
	/** Files that could not be processed; the run continues past them. */
	failures: { path: string; message: string }[]
}

/**
 * Apply a transform to every path, sequentially, through `vault.process`
 * (atomic read-modify-write that cannot clobber concurrent edits). A failing
 * file is reported and skipped, never aborting the run: every transform is
 * a no-op on already-processed content, so re-running is the recovery.
 */
export async function runBulkEdit<Result extends BulkTransformResult>(
	vault: BulkEditVault,
	paths: string[],
	transform: BulkTransform<Result>,
	onProgress?: (done: number, total: number) => void
): Promise<BulkEditReport<Result>> {
	const report: BulkEditReport<Result> = {
		changedPaths: [],
		results: [],
		failures: [],
	}
	let done = 0
	for (const path of paths) {
		try {
			const file = vault.getFileByPath(path)
			if (!file) throw new Error('File not found')
			const result = await processFile(vault, file, transform)
			if (result.changed) {
				report.changedPaths.push(path)
				report.results.push(result)
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			report.failures.push({ path, message })
		}
		done++
		onProgress?.(done, paths.length)
	}
	return report
}

async function processFile<Result extends BulkTransformResult>(
	vault: BulkEditVault,
	file: TFile,
	transform: BulkTransform<Result>
): Promise<Result> {
	let result: Result | undefined
	await vault.process(file, (content) => {
		result = transform(content, file.path)
		return result.content
	})
	if (!result) throw new Error('The vault did not run the transform')
	return result
}
