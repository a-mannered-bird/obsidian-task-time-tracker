import type { App } from 'obsidian'

/**
 * Obsidian's hotkey manager is not part of the public API. Verified on
 * 1.15.1: `printHotkeyForCommand(id)` prints the first hotkey set by the
 * user, else the default one (`⌘ ⇧ T`), and `''` when there is none.
 */
type HotkeyPrinter = { printHotkeyForCommand(commandId: string): string }

function hasHotkeyPrinter(
	app: App
): app is App & { hotkeyManager: HotkeyPrinter } {
	if (!('hotkeyManager' in app)) return false
	const manager = app.hotkeyManager
	return (
		typeof manager === 'object' &&
		manager !== null &&
		'printHotkeyForCommand' in manager &&
		typeof manager.printHotkeyForCommand === 'function'
	)
}

/**
 * The command's shortcut as Obsidian shows it, `''` when none is set, or
 * null when this version of Obsidian cannot tell.
 */
export function printHotkey(app: App, fullCommandId: string): string | null {
	return hasHotkeyPrinter(app)
		? app.hotkeyManager.printHotkeyForCommand(fullCommandId)
		: null
}
