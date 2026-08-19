import { describe, expect, it } from 'vitest'
import type { TagMapping } from 'types/tags'
import { getStyleByTags } from './tags'

const mappings: TagMapping[] = [
	{ tag: '#project', emoji: '⭐️', bold: true, italic: false, underline: true },
	{ tag: '#routine', emoji: '🔂', bold: false, italic: true, underline: false },
]

describe('getStyleByTags', () => {
	it('returns no style when no tag matches a mapping', () => {
		expect(getStyleByTags(['#other'], mappings)).toEqual({
			bold: false,
			italic: false,
			underline: false,
		})
	})

	it('returns the style of the matching mapping', () => {
		expect(getStyleByTags(['#routine'], mappings)).toEqual({
			bold: false,
			italic: true,
			underline: false,
		})
	})

	it('combines styles when several tags match', () => {
		expect(getStyleByTags(['#project', '#routine'], mappings)).toEqual({
			bold: true,
			italic: true,
			underline: true,
		})
	})
})
