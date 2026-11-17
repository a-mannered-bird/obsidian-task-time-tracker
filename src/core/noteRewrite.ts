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

/** What a run turned the note from and into. */
export type NoteWrite = { before: string; after: string }

/**
 * The io, keeping track of what its writes did: from the content the first
 * one replaced to the last one written. `written` is null until a write
 * changed the note.
 */
export function recordWrites(io: NoteIo): {
	io: NoteIo
	written: () => NoteWrite | null
} {
	let before: string | null = null
	let after: string | null = null
	return {
		io: {
			read: () => io.read(),
			replace: async (expected, next) => {
				const replaced = await io.replace(expected, next)
				if (replaced) {
					before ??= expected
					after = next
				}
				return replaced
			},
		},
		written: () =>
			before === null || after === null || before === after
				? null
				: { before, after },
	}
}

/**
 * The transform putting a note back as it was before `write`, as long as it
 * still holds what the write left: any later change could be lost otherwise.
 */
export function undoWrite(write: NoteWrite) {
	return (content: string): string | null =>
		content === write.after ? write.before : null
}
