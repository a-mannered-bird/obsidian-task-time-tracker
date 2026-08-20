import { Notice, type Hotkey, type Modifier } from 'obsidian'
import { resolveTargetFile } from 'core/dailyNotes'
import { TaskNote } from 'core/note'
import { toggleTasks, type Prompts, type ToggleOptions } from 'core/toggle'
import { pickTask } from 'ui/TaskSuggestModal'
import { promptMinutes } from 'ui/MinutesPromptModal'
import type TaskTimeTracker from '../main'

const NOTICE_DURATION = 5000

type TrackingCommand = {
	id: string
	name: string
	/** Modifiers of the default hotkey; no default hotkey when omitted. */
	modifiers?: Modifier[]
	/** Key of the default hotkey; the configurable main key when omitted. */
	key?: string
	/** Engine runs applied in order on the same note (most commands have one). */
	steps: ToggleOptions[]
}

/**
 * One command per option combination; thin wrappers over the toggle engine.
 * Mirrors the QuickAdd macros the plugin replaces (see README).
 */
const TRACKING_COMMANDS: TrackingCommand[] = [
	{
		id: 'toggle-task',
		modifiers: ['Alt'],
		name: 'Toggle task',
		steps: [{ placeholder: 'Which task to toggle?' }],
	},
	{
		id: 'toggle-task-from',
		modifiers: ['Ctrl', 'Alt'],
		name: 'Toggle task from…',
		steps: [{ placeholder: 'Which task to toggle?', timeTravel: true }],
	},
	{
		id: 'toggle-task-from-last',
		modifiers: ['Meta', 'Alt'],
		name: 'Toggle task from last',
		steps: [
			{
				placeholder: 'Which task starts when the last one ended?',
				fromLastTask: true,
			},
		],
	},
	{
		id: 'toggle-tick-task',
		modifiers: ['Alt', 'Shift'],
		name: 'Toggle and tick task',
		steps: [{ placeholder: 'Which task to toggle and tick?', tick: true }],
	},
	{
		id: 'toggle-tick-task-from',
		modifiers: ['Ctrl', 'Alt', 'Shift'],
		name: 'Toggle and tick task from…',
		steps: [
			{
				placeholder: 'Which task to toggle and tick?',
				tick: true,
				timeTravel: true,
			},
		],
	},
	{
		id: 'switch-task',
		modifiers: ['Meta'],
		name: 'Switch task',
		steps: [{ placeholder: 'Which task to switch to?', switch: true }],
	},
	{
		id: 'switch-task-from',
		modifiers: ['Ctrl', 'Meta'],
		name: 'Switch task from…',
		steps: [
			{
				placeholder: 'Which task to switch to?',
				switch: true,
				timeTravel: true,
			},
		],
	},
	{
		id: 'switch-tick-task',
		modifiers: ['Meta', 'Shift'],
		name: 'Switch and tick task',
		steps: [
			{
				placeholder: 'Tick current task and switch to?',
				switch: true,
				tick: true,
			},
		],
	},
	{
		id: 'switch-tick-task-from',
		modifiers: ['Ctrl', 'Meta', 'Shift'],
		name: 'Switch and tick task from…',
		steps: [
			{
				placeholder: 'Tick current task and switch to?',
				switch: true,
				tick: true,
				timeTravel: true,
			},
		],
	},
	{
		id: 'switch-to-previous',
		modifiers: ['Ctrl', 'Shift'],
		name: 'Switch to previous task(s)',
		steps: [{ switch: true, previous: true }],
	},
	{
		id: 'log-interruption-from',
		modifiers: ['Ctrl', 'Alt', 'Meta', 'Shift'],
		name: 'Log interruption from…',
		// Two runs, like the QuickAdd macro: switch to the interruption at a
		// past time, then switch back to what was running before it.
		steps: [
			{
				placeholder: 'Which task was the interruption?',
				switch: true,
				timeTravel: true,
			},
			{ switch: true, previous: true },
		],
	},
	{
		id: 'toggle-quick-interruption',
		name: 'Toggle quick interruption',
		steps: [{ switch: true, interruption: true }],
	},
	{
		id: 'migrate-current-task',
		modifiers: ['Meta', 'Alt'],
		key: 'M',
		name: 'Migrate current task',
		steps: [{ migrate: true, placeholder: 'Which task to migrate to?' }],
	},
	{
		id: 'set-task-duration',
		modifiers: ['Ctrl', 'Alt', 'Meta'],
		name: 'Set task duration',
		steps: [
			{ setDuration: true, placeholder: 'Which task to set duration to?' },
		],
	},
]

export function registerTrackingCommands(plugin: TaskTimeTracker) {
	for (const command of TRACKING_COMMANDS) {
		plugin.addCommand({
			id: command.id,
			name: command.name,
			// Deliberate product choice: a coherent hotkey scheme around one
			// configurable key; every binding stays overridable in the Hotkeys
			// settings. Revisit before a community-plugin submission.
			// eslint-disable-next-line obsidianmd/commands/no-default-hotkeys
			hotkeys: defaultHotkeys(command, plugin.settings.defaultToggleHotkey),
			callback: () => void runTrackingCommand(plugin, command.steps),
		})
	}
}

/**
 * One default hotkey per configured character (a command with a fixed key gets
 * exactly one). Several characters cover keyboard layouts where Alt/Shift
 * change the character the key produces: Obsidian matches the produced
 * character, so e.g. Alt+@ may need "•" as an alternative on a Mac layout.
 */
function defaultHotkeys(command: TrackingCommand, mainKeys: string): Hotkey[] {
	const { modifiers } = command
	if (!modifiers) return []
	const keys = command.key ? [command.key] : [...mainKeys.replace(/\s/g, '')]
	return keys.map((key) => ({ modifiers, key }))
}

async function runTrackingCommand(
	plugin: TaskTimeTracker,
	steps: ToggleOptions[]
) {
	const { app, settings } = plugin
	const file = resolveTargetFile(
		app,
		plugin.getDailyLogStoreConfig().dailyNotes
	)
	if (!file) {
		new Notice(
			"No daily note to act on: the active file is not a daily note, and today's daily note does not exist.",
			NOTICE_DURATION
		)
		return
	}

	const prompts: Prompts = {
		pickTask: (tasks, placeholder) =>
			pickTask(app, tasks, { placeholder, tagMappings: settings.tagMappings }),
		promptMinutes: (promptOptions) => promptMinutes(app, promptOptions),
		notify: (message) => new Notice(message, NOTICE_DURATION),
	}

	const note = new TaskNote(await app.vault.read(file))
	let changed = false
	for (const options of steps) {
		changed =
			(await toggleTasks(note, options, {
				prompts,
				unassignedTaskName: settings.unassignedTaskName,
				now: new Date(),
			})) || changed
	}
	if (changed) await app.vault.modify(file, note.toString())
}
