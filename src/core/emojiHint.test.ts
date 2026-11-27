import { describe, expect, it } from 'vitest'
import { emojiPickerHint, type EmojiPlatform } from './emojiHint'

const none: EmojiPlatform = {
	isIosApp: false,
	isAndroidApp: false,
	isMacOS: false,
	isWin: false,
}

describe('emojiPickerHint', () => {
	it('points an iPad reporting macOS to its keyboard, not to a Mac shortcut', () => {
		expect(emojiPickerHint({ ...none, isIosApp: true, isMacOS: true })).toBe(
			emojiPickerHint({ ...none, isIosApp: true })
		)
	})

	it('gives a different hint on each system that has a picker', () => {
		const hints = [
			emojiPickerHint({ ...none, isIosApp: true }),
			emojiPickerHint({ ...none, isAndroidApp: true }),
			emojiPickerHint({ ...none, isMacOS: true }),
			emojiPickerHint({ ...none, isWin: true }),
		]
		expect(new Set(hints).size).toBe(4)
	})

	it('gives none on Linux, which has no shared picker', () => {
		expect(emojiPickerHint(none)).toBeNull()
	})
})
