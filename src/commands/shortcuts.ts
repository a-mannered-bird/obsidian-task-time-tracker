import { Platform } from 'obsidian'
import {
	CONTROL_COMMANDS,
	shortcutHint,
	type ViewControl,
} from 'core/shortcuts'
import { printHotkey } from 'ui/hotkeys'
import type TaskTimeTracker from '../main'

/**
 * The shortcut of one of the plugin's commands, `''` when none is set, or
 * null on mobile, which has no keyboard shortcuts, and when it cannot be
 * read. Read when asked, so a shortcut set meanwhile shows.
 */
function shortcutOf(plugin: TaskTimeTracker, commandId: string): string | null {
	if (Platform.isMobile) return null
	return printHotkey(plugin.app, `${plugin.manifest.id}:${commandId}`)
}

/** The tooltip line about a command's shortcut, or null for none. */
export function commandHint(
	plugin: TaskTimeTracker,
	commandId: string
): string | null {
	const name = plugin.commandNames.get(commandId)
	const shortcut = shortcutOf(plugin, commandId)
	return name === undefined || shortcut === null
		? null
		: shortcutHint(name, shortcut)
}

export function controlHint(
	plugin: TaskTimeTracker,
	control: ViewControl
): string | null {
	return commandHint(plugin, CONTROL_COMMANDS[control])
}

/**
 * A menu item's title with the command's shortcut after it, when one is
 * set; a menu has no tooltips, and an invitation on every item would
 * crowd it. A native menu (macOS) shows only the title's text, so the
 * brackets around the shortcut are in the text; Obsidian's own menu hides
 * them and sets the shortcut apart on the right instead.
 */
export function titleWithShortcut(
	plugin: TaskTimeTracker,
	title: string,
	control: ViewControl | undefined
): string | DocumentFragment {
	const shortcut = control && shortcutOf(plugin, CONTROL_COMMANDS[control])
	if (!shortcut) return title
	const fragment = new DocumentFragment()
	fragment.appendText(title)
	const bracket = (text: string) =>
		fragment.createSpan({ cls: 'task-time-tracker-native-only', text })
	bracket(' (')
	fragment.createSpan({
		cls: 'task-time-tracker-menu-shortcut',
		text: shortcut,
	})
	bracket(')')
	return fragment
}
