import { describe, expect, it } from 'vitest'
import { shortcutHint } from './shortcuts'

describe('shortcutHint', () => {
	it('gives the shortcut when one is set', () => {
		expect(shortcutHint('Toggle task', '⌘ ⇧ T')).toEqual({
			text: 'Shortcut: ⌘ ⇧ T',
			aside: false,
		})
	})

	it('names the command to look up in the hotkeys when none is set, aside', () => {
		const hint = shortcutHint('Toggle task', '')
		expect(hint.text).toContain('"Toggle task"')
		expect(hint.aside).toBe(true)
	})
})
