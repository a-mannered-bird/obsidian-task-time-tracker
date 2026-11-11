import type { NoteIo } from './trackingRun'

export type RewriteOutcome = 'written' | 'unchanged' | 'gone' | 'busy'

const MAX_ATTEMPTS = 4

/**
 * Apply `transform` to the note and write the result only if the note still
 * holds what was read; when it changed meanwhile (sync), read and transform
 * again. `transform` returns null when what it edits is no longer there.
 */
export async function rewriteNote(
	io: NoteIo,
	transform: (content: string) => string | null
): Promise<RewriteOutcome> {
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const content = await io.read()
		const next = transform(content)
		if (next === null) return 'gone'
		if (next === content) return 'unchanged'
		if (await io.replace(content, next)) return 'written'
	}
	return 'busy'
}
