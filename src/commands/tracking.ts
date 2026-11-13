import { Notice, type IconName } from 'obsidian'
import { getDailyNoteDate } from 'core/dailyNotes'
import { TaskNote } from 'core/note'
import { noteDayHeading } from 'core/overnight'
import type {
	PickTaskRequest,
	Prompts,
	TaskChoice,
	ToggleOptions,
} from 'core/toggle'
import type { VaultPickerEntries } from 'core/taskPicker'
import { applyTrackingSteps } from 'core/trackingRun'
import { pickTask, type PickerNote } from 'ui/TaskSuggestModal'
import { promptMinutes } from 'ui/MinutesPromptModal'
import type TaskTimeTracker from '../main'
import { addToPlan } from './plan'
import {
	currentTarget,
	NOTICE_DURATION,
	readTaskNote,
	targetIo,
} from './target'

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

/**
 * Run engine steps on the target daily note; also used by the tracker tab.
 * A `choice` answers the steps' task picker without showing it: the task
 * the user already chose in the tab, added to the note when it is new.
 * `notify` receives the run's notices instead of showing them.
 */
export async function runTrackingSteps(
	plugin: TaskTimeTracker,
	steps: ToggleOptions[],
	options: { choice?: TaskChoice; notify?: (message: string) => void } = {}
) {
	const { choice, notify } = options
	const target = currentTarget(plugin)
	const interactive = interactivePrompts(plugin, target.path)
	const prompts: Prompts = {
		...interactive,
		pickTask: choice
			? async () => choice
			: (note, request) => interactive.pickTask(note, request),
		notify: notify ?? ((message) => interactive.notify(message)),
	}
	await applyTrackingSteps(targetIo(plugin, target), steps, {
		prompts,
		now: new Date(),
	})
}

function interactivePrompts(plugin: TaskTimeTracker, path: string): Prompts {
	const { app } = plugin
	return {
		pickTask: (note, request) => pickNoteTask(plugin, path, note, request),
		promptMinutes: (promptOptions) => promptMinutes(app, promptOptions),
		notify: (message) => new Notice(message, NOTICE_DURATION),
	}
}

/**
 * The task picker over the request's choices of the note, kept current
 * while the note changes, followed (when asked)
 * by the vault's other tasks, and creating one from the typed text.
 */
export function pickNoteTask(
	plugin: TaskTimeTracker,
	path: string,
	note: TaskNote,
	request: PickTaskRequest
): Promise<TaskChoice | null> {
	const { app, settings } = plugin
	const shown = (version: TaskNote): PickerNote => ({
		tasks: request.choices(version),
		names: version.tasks.map((task) => task.name),
	})
	return pickTask(app, {
		placeholder: request.placeholder,
		tagMappings: settings.tagMappings,
		note: shown(note),
		watch: (update) =>
			watchNote(plugin, path, (version) => update(shown(version))),
		vaultEntries: request.includeVault ? loadVaultEntries(plugin) : undefined,
		noteHeading: noteDayHeading(
			getDailyNoteDate(plugin.getDailyNotesConfig(), path) ?? new Date(),
			new Date()
		),
		onAddToPlan: request.offersPlan
			? (name, tags) => void addToPlan(plugin, name, tags)
			: undefined,
	})
}

/** The vault's tasks for a picker, split by the hide flags. */
export async function loadVaultEntries(
	plugin: TaskTimeTracker
): Promise<VaultPickerEntries> {
	const { settings, vaultTasks } = plugin
	await vaultTasks.ensureBuilt()
	const hidden = new Set(settings.hiddenTasks)
	const infos = vaultTasks.snapshot()
	return {
		visible: infos.filter((info) => !hidden.has(info.name)),
		hidden: infos.filter((info) => hidden.has(info.name)),
	}
}

/**
 * Call `onNote` with each new version of the note until unsubscribed. Reads
 * can resolve out of order, so only the newest one is passed on.
 */
function watchNote(
	plugin: TaskTimeTracker,
	path: string,
	onNote: (note: TaskNote) => void
): () => void {
	let latest = 0
	return plugin.dailyLogs.onChange((change) => {
		if (change && change.path !== path) return
		// Looked up on each change: the note may only be created meanwhile.
		const file = plugin.app.vault.getFileByPath(path)
		if (!file) return
		const read = ++latest
		plugin.app.vault.cachedRead(file).then(
			(content) => {
				if (read === latest) onNote(new TaskNote(content))
			},
			// Deleted or renamed meanwhile: the picker keeps the last version.
			() => {}
		)
	})
}

/** Tick or untick one task without touching its clocks. */
export async function setTaskTicked(
	plugin: TaskTimeTracker,
	taskName: string,
	ticked: boolean
) {
	const { file } = currentTarget(plugin)
	if (!file) return
	const note = await readTaskNote(plugin, file)
	const task = note.findTask(taskName)
	if (!task) return
	note.setTicked(task, ticked)
	await plugin.app.vault.modify(file, note.toString())
}
