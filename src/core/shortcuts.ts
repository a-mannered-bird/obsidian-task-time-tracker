/**
 * The plugin command doing what a control of the daily view does, by its id
 * within the plugin: the control's tooltip teaches that command's shortcut,
 * so the user can skip the view next time.
 */
export const CONTROL_COMMANDS = {
	start: 'toggle-task',
	switch: 'switch-task',
	alongside: 'toggle-task',
	stop: 'toggle-task',
	done: 'toggle-tick-task',
	fromLastEnd: 'toggle-task-from-last',
	interruption: 'toggle-interruption',
	plan: 'plan-task',
	setDuration: 'set-task-duration',
	migrateClock: 'migrate-current-task',
	dayStart: 'set-day-start',
	dayEnd: 'set-day-end',
	endDay: 'complete-journal-entry',
	manageTasks: 'manage-tasks',
} as const

export type ViewControl = keyof typeof CONTROL_COMMANDS

/**
 * The tooltip line about a command's shortcut, as Obsidian prints it: the
 * shortcut, or an invitation naming the command to look up in the Hotkeys
 * settings when none is set (`''`).
 */
export function shortcutHint(commandName: string, shortcut: string): string {
	return shortcut
		? `Shortcut: ${shortcut}`
		: `No shortcut yet: set one for "${commandName}" in Settings → Hotkeys`
}
