import { describe, expect, it } from 'vitest'
import { diffLines } from './lineDiff'

describe('diffLines', () => {
	it('marks removed and added lines around the common ones, removals first in a hunk', () => {
		const before = [
			'- [ ] Deep work #focus',
			'      [clock::2026-08-03T09:00:00--2026-08-03T10:00:00]',
			'      [clock::2026-08-03T09:30:00--2026-08-03T10:30:00]',
			'- [ ] Deep work',
			'      [clock::2026-08-03T14:00:00--2026-08-03T14:30:00]',
		]
		const after = [
			'- [ ] Deep work #focus',
			'      [clock::2026-08-03T09:00:00--2026-08-03T10:30:00]',
			'      [clock::2026-08-03T14:00:00--2026-08-03T14:30:00]',
		]
		expect(diffLines(before, after)).toEqual([
			{ kind: 'same', text: '- [ ] Deep work #focus' },
			{
				kind: 'removed',
				text: '      [clock::2026-08-03T09:00:00--2026-08-03T10:00:00]',
			},
			{
				kind: 'removed',
				text: '      [clock::2026-08-03T09:30:00--2026-08-03T10:30:00]',
			},
			{ kind: 'removed', text: '- [ ] Deep work' },
			{
				kind: 'added',
				text: '      [clock::2026-08-03T09:00:00--2026-08-03T10:30:00]',
			},
			{
				kind: 'same',
				text: '      [clock::2026-08-03T14:00:00--2026-08-03T14:30:00]',
			},
		])
	})

	it('handles identical and empty inputs', () => {
		expect(diffLines(['a'], ['a'])).toEqual([{ kind: 'same', text: 'a' }])
		expect(diffLines([], ['a'])).toEqual([{ kind: 'added', text: 'a' }])
		expect(diffLines(['a'], [])).toEqual([{ kind: 'removed', text: 'a' }])
	})
})
