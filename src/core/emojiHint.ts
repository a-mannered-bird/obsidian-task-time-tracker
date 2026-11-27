/** The fields of Obsidian's `Platform` that decide which emoji picker the system offers. */
export type EmojiPlatform = {
	isIosApp: boolean
	isAndroidApp: boolean
	isMacOS: boolean
	isWin: boolean
}

/**
 * How to open the system's emoji picker in a text field, written the way
 * Obsidian prints shortcuts on that system, or null where there is no
 * picker to point at (Linux has none that every desktop shares). The
 * mobile apps are checked first: an iPad can report macOS.
 */
export function emojiPickerHint(platform: EmojiPlatform): string | null {
	if (platform.isIosApp) {
		return 'Tap the emoji key or the globe key on the keyboard to type an emoji.'
	}
	if (platform.isAndroidApp) {
		return 'Tap the emoji key on the keyboard to type an emoji; some keyboards keep it on a long press of the comma or Enter key.'
	}
	if (platform.isMacOS)
		return 'Press fn E or ⌃ ⌘ Space to open the emoji picker.'
	if (platform.isWin) return 'Press Win + . to open the emoji picker.'
	return null
}
