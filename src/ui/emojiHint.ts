import { Platform } from 'obsidian'
import { emojiPickerHint } from 'core/emojiHint'

/** The hint under an emoji input, for the device the plugin runs on. */
export function deviceEmojiHint(): string | undefined {
	return emojiPickerHint(Platform) ?? undefined
}
