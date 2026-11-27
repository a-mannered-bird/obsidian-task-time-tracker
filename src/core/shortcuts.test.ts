import { describe, expect, it } from 'vitest'
import { setShortcutHint, shortcutHint } from './shortcuts'

describe('shortcutHint', () => {
	it('gives the shortcut when one is set', () => {
		expect(shortcutHint('Toggle task', '⌘ ⇧ T')).toBe('Shortcut: ⌘ ⇧ T')
	})

	it('names the command to look up in the hotkeys when none is set', () => {
		expect(shortcutHint('Toggle task', '')).toContain('"Toggle task"')
	})
})

describe('setShortcutHint', () => {
	it('gives the shortcut when one is set', () => {
		expect(setShortcutHint('⌘ 1')).toBe('Shortcut: ⌘ 1')
	})

	it('gives nothing when none is set', () => {
		expect(setShortcutHint('')).toBeNull()
	})
})
