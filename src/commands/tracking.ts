import { Notice, type IconName } from 'obsidian'
import { TaskNote } from 'core/note'
import { toggleTasks, type Prompts, type ToggleOptions } from 'core/toggle'
import { pickTask } from 'ui/TaskSuggestModal'
import { promptMinutes } from 'ui/MinutesPromptModal'
import type TaskTimeTracker from '../main'
import { NOTICE_DURATION, resolveTargetFileOrNotify } from './target'

type TrackingCommand = {
	id: string
	name: string
	/** Shown in the mobile toolbar and command list. */
	icon: IconName
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
		icon: 'play',
		name: 'Toggle task',
		steps: [{ placeholder: 'Which task to toggle?' }],
	},
	{
		id: 'toggle-task-from',
		icon: 'alarm-clock',
		name: 'Toggle task from…',
		steps: [{ placeholder: 'Which task to toggle?', timeTravel: true }],
	},
	{
		id: 'toggle-task-from-last',
		icon: 'step-forward',
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
		icon: 'check',
		name: 'Toggle and tick task',
		steps: [{ placeholder: 'Which task to toggle and tick?', tick: true }],
	},
	{
		id: 'toggle-tick-task-from',
		icon: 'badge-check',
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
		icon: 'arrow-left-right',
		name: 'Switch task',
		steps: [{ placeholder: 'Which task to switch to?', switch: true }],
	},
	{
		id: 'switch-task-from',
		icon: 'rewind',
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
		icon: 'list-checks',
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
		icon: 'clipboard-check',
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
		icon: 'undo-2',
		name: 'Switch to previous task(s)',
		steps: [{ switch: true, previous: true }],
	},
	{
		id: 'log-interruption-from',
		icon: 'bell-ring',
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
		icon: 'zap',
		name: 'Toggle quick interruption',
		steps: [{ switch: true, interruption: true }],
	},
	{
		id: 'migrate-current-task',
		icon: 'move',
		name: 'Migrate current task',
		steps: [{ migrate: true, placeholder: 'Which task to migrate to?' }],
	},
	{
		id: 'set-task-duration',
		icon: 'hourglass',
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
			icon: command.icon,
			callback: () => void runTrackingSteps(plugin, command.steps),
		})
	}
}

/** Run engine steps on the target daily note; also used by the tracker tab. */
export async function runTrackingSteps(
	plugin: TaskTimeTracker,
	steps: ToggleOptions[]
) {
	const { app, settings, vaultTasks } = plugin
	const file = resolveTargetFileOrNotify(plugin)
	if (!file) return

	const note = new TaskNote(await app.vault.read(file))

	const prompts: Prompts = {
		pickTask: async (tasks, placeholder, options) => {
			const includeVault = Boolean(
				options?.includeVault && settings.includeVaultTasks
			)
			const picked = await pickTask(app, tasks, {
				placeholder,
				tagMappings: settings.tagMappings,
				noteNames: note.tasks.map((task) => task.name),
				vaultEntries: includeVault
					? vaultTasks.ensureBuilt().then(() =>
							// Dedupe against the whole note, not just the offered
							// candidates (a switch excludes the running tasks).
							vaultTasks.snapshot().filter((info) => !note.findTask(info.name))
						)
					: undefined,
			})
			if (!picked) return null
			if (picked.kind === 'note') return picked.task
			return note.insertTask(picked.name, picked.tags)
		},
		promptMinutes: (promptOptions) => promptMinutes(app, promptOptions),
		notify: (message) => new Notice(message, NOTICE_DURATION),
	}
	let changed = false
	for (const options of steps) {
		changed =
			(await toggleTasks(note, options, {
				prompts,
				unassignedTaskName: settings.unassignedTaskName,
				vaultTasksAvailable: settings.includeVaultTasks,
				now: new Date(),
			})) || changed
	}
	if (changed) await app.vault.modify(file, note.toString())
}

/** Tick or untick one task without touching its clocks. */
export async function setTaskTicked(
	plugin: TaskTimeTracker,
	taskName: string,
	ticked: boolean
) {
	const file = resolveTargetFileOrNotify(plugin)
	if (!file) return
	const note = new TaskNote(await plugin.app.vault.read(file))
	const task = note.findTask(taskName)
	if (!task) return
	note.setTicked(task, ticked)
	await plugin.app.vault.modify(file, note.toString())
}
