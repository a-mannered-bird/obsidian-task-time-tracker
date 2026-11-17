import { describe, expect, it } from 'vitest'
import { recordWrites, rewriteNote, undoWrite } from './noteRewrite'
import type { NoteIo } from './trackingRun'

/** A note whose content `changes` replaces right after each of the first reads. */
function noteWithChanges(initial: string, changes: string[] = []) {
	let content = initial
	const io: NoteIo = {
		read: () => {
			const read = content
			content = changes.shift() ?? content
			return Promise.resolve(read)
		},
		replace: (expected, next) => {
			if (content !== expected) return Promise.resolve(false)
			content = next
			return Promise.resolve(true)
		},
	}
	return { io, content: () => content }
}

const upper = (text: string) => text.toUpperCase()

describe('rewriteNote', () => {
	it('writes the transformed note', async () => {
		const note = noteWithChanges('a')
		expect(await rewriteNote(note.io, upper)).toBe('written')
		expect(note.content()).toBe('A')
	})

	it('transforms again when the note changed after the read', async () => {
		const note = noteWithChanges('a', ['ab'])
		expect(await rewriteNote(note.io, upper)).toBe('written')
		expect(note.content()).toBe('AB')
	})

	it('writes nothing when what it edits is gone', async () => {
		const note = noteWithChanges('a')
		expect(await rewriteNote(note.io, () => null)).toBe('gone')
		expect(note.content()).toBe('a')
	})

	it('reports a transform that changes nothing', async () => {
		const note = noteWithChanges('A')
		expect(await rewriteNote(note.io, upper)).toBe('unchanged')
	})

	it('gives up when the note keeps changing', async () => {
		const note = noteWithChanges('a', ['b', 'c', 'd', 'e', 'f'])
		expect(await rewriteNote(note.io, upper)).toBe('busy')
		expect(note.content()).toBe('e')
	})
})

describe('recordWrites', () => {
	it('spans the writes from the first content replaced to the last written', async () => {
		const note = noteWithChanges('a')
		const recorder = recordWrites(note.io)
		expect(recorder.written()).toBeNull()
		await rewriteNote(recorder.io, (text) => `${text}b`)
		await rewriteNote(recorder.io, (text) => `${text}c`)
		expect(recorder.written()).toEqual({ before: 'a', after: 'abc' })
	})

	it('ignores writes that did not happen or came back to the start', async () => {
		const note = noteWithChanges('a')
		const recorder = recordWrites(note.io)
		await recorder.io.replace('x', 'y')
		expect(recorder.written()).toBeNull()
		await rewriteNote(recorder.io, upper)
		await rewriteNote(recorder.io, (text) => text.toLowerCase())
		expect(recorder.written()).toBeNull()
	})
})

describe('undoWrite', () => {
	const write = { before: 'a', after: 'ab' }

	it('puts the note back as it was', () => {
		expect(undoWrite(write)('ab')).toBe('a')
	})

	it('refuses once the note changed since', () => {
		expect(undoWrite(write)('abc')).toBeNull()
	})
})
