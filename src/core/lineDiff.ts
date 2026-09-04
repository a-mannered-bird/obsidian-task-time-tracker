export type DiffLine = { kind: 'same' | 'removed' | 'added'; text: string }

/**
 * Line diff of two small texts (longest common subsequence), for showing a
 * rewrite as removed and added lines. Sizes here are a task's lines in one
 * note, so the quadratic table is fine.
 */
export function diffLines(before: string[], after: string[]): DiffLine[] {
	const rows = before.length
	const cols = after.length
	// lcs[i][j] = length of the LCS of before[i..] and after[j..]
	const lcs: number[][] = Array.from({ length: rows + 1 }, () =>
		Array<number>(cols + 1).fill(0)
	)
	for (let i = rows - 1; i >= 0; i--) {
		for (let j = cols - 1; j >= 0; j--) {
			lcs[i]![j] =
				before[i] === after[j]
					? lcs[i + 1]![j + 1]! + 1
					: Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
		}
	}
	const diff: DiffLine[] = []
	let i = 0
	let j = 0
	while (i < rows && j < cols) {
		if (before[i] === after[j]) {
			diff.push({ kind: 'same', text: before[i]! })
			i++
			j++
		} else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
			diff.push({ kind: 'removed', text: before[i]! })
			i++
		} else {
			diff.push({ kind: 'added', text: after[j]! })
			j++
		}
	}
	for (; i < rows; i++) diff.push({ kind: 'removed', text: before[i]! })
	for (; j < cols; j++) diff.push({ kind: 'added', text: after[j]! })
	return diff
}
