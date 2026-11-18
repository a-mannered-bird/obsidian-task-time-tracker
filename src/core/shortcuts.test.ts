import { describe, expect, it } from 'vitest'
import { shortcutHint } from './shortcuts'

describe('shortcutHint', () => {
	it('gives the shortcut when one is set', () => {
		expect(shortcutHint('Toggle task', '⌘ ⇧ T')).toBe('Shortcut: ⌘ ⇧ T')
	})

	it('names the command to look up in the hotkeys when none is set', () => {
		expect(shortcutHint('Toggle task', '')).toContain('"Toggle task"')
	})
})
