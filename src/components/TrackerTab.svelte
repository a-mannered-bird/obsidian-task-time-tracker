<script lang="ts">
	import { setIcon, type App, type IconName } from 'obsidian'
	import { onMount } from 'svelte'
	import { runTrackingSteps, setTaskTicked } from 'commands/tracking'
	import { resolveTargetFile } from 'core/dailyNotes'
	import type { DailyLog } from 'core/dailyLogs'
	import { taskMinutes } from 'core/aggregate'
	import { isRunning } from 'core/note'
	import { pickerLabel, sortForPicker } from 'core/taskPicker'
	import { getStyleByTags } from 'core/tags'
	import { formatHoursMinutes, getMinutesBetween } from 'core/time'
	import type { Task } from 'types/tasks'
	import type TaskTimeTracker from '../main'

	type Props = {
		app: App
		plugin: TaskTimeTracker
	}

	const { app, plugin }: Props = $props()

	let log = $state<DailyLog | null>(null)
	let loading = $state(true)
	let now = $state(new Date())

	const tasks = $derived(sortForPicker(log?.tasks ?? []))
	const running = $derived(tasks.filter(isRunning))
	const interruptionActive = $derived(
		running.some((task) => task.name === plugin.settings.unassignedTaskName)
	)

	function runningSince(task: Task): string {
		const clock = task.clocks.find((c) => c.end === null)
		if (!clock) return ''
		return formatHoursMinutes(Math.max(0, getMinutesBetween(clock.start, now)))
	}

	function rowStyle(task: Task) {
		return getStyleByTags(task.tags, plugin.settings.tagMappings)
	}

	async function run(steps: Parameters<typeof runTrackingSteps>[1]) {
		await runTrackingSteps(plugin, steps)
	}

	async function reload() {
		const file = resolveTargetFile(
			app,
			plugin.getDailyLogStoreConfig().dailyNotes
		)
		log = file ? await plugin.dailyLogs.loadFile(file) : null
		// Clock math compares against `now`; a stale value would make a clock
		// started after the last minute tick look negative.
		now = new Date()
		loading = false
	}

	onMount(() => {
		const unsubscribe = plugin.dailyLogs.onChange(() => void reload())
		const leafRef = app.workspace.on('active-leaf-change', () => void reload())
		const tick = window.setInterval(() => (now = new Date()), 60 * 1000)
		void reload()
		return () => {
			unsubscribe()
			app.workspace.offref(leafRef)
			window.clearInterval(tick)
		}
	})

	/** Renders an Obsidian (Lucide) icon inside the element. */
	function icon(el: HTMLElement, name: IconName) {
		setIcon(el, name)
		return {
			update(next: IconName) {
				setIcon(el, next)
			},
		}
	}
</script>

{#if loading}
	<p class="muted">Loading…</p>
{:else if !log}
	<p class="muted">No daily note to act on.</p>
{:else}
	<div class="now">
		{#if running.length === 0}
			<span class="muted">Nothing running.</span>
		{:else}
			{#each running as task (task.name)}
				<div class="now-task">
					<span class="now-name" class:bold={rowStyle(task).bold}
						>⏳ {task.name}</span
					>
					<span class="muted">{runningSince(task)}</span>
					<button
						class="icon-button"
						aria-label="Stop"
						use:icon={'square'}
						onclick={() => void run([{ taskName: task.name }])}
					></button>
				</div>
			{/each}
		{/if}
	</div>

	<div class="actions">
		<button
			onclick={() =>
				void run([{ switch: true, placeholder: 'Which task to switch to?' }])}
		>
			Switch…
		</button>
		<button onclick={() => void run([{ switch: true, interruption: true }])}>
			{interruptionActive ? 'End interruption' : 'Interruption'}
		</button>
	</div>

	<ul class="tasks">
		{#each tasks as task (task.name)}
			{@const minutes = taskMinutes(task, now)}
			<li class:running={isRunning(task)}>
				<button
					class="task-name"
					class:bold={rowStyle(task).bold}
					class:italic={rowStyle(task).italic}
					class:underline={rowStyle(task).underline}
					onclick={() => void run([{ taskName: task.name }])}
					aria-label={isRunning(task)
						? `Stop ${task.name}`
						: `Start ${task.name}`}
				>
					{pickerLabel(task, plugin.settings.tagMappings)}
				</button>
				{#if minutes > 0}
					<span class="muted">{formatHoursMinutes(minutes)}</span>
				{/if}
				<button
					class="icon-button"
					aria-label={task.ticked ? 'Untick' : 'Tick'}
					use:icon={task.ticked ? 'circle-check' : 'circle'}
					onclick={() => void setTaskTicked(plugin, task.name, !task.ticked)}
				></button>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.muted {
		color: var(--text-muted);
	}

	.now {
		margin-bottom: 0.75em;
	}

	.now-task {
		display: flex;
		align-items: center;
		gap: 0.5em;
	}

	.now-name {
		flex: 1;
	}

	.actions {
		display: flex;
		gap: 0.5em;
		margin-bottom: 0.75em;
	}

	.tasks {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.tasks li {
		display: flex;
		align-items: center;
		gap: 0.5em;
		padding: 0.15em 0;
	}

	.tasks li.running .task-name {
		color: var(--text-accent);
	}

	.task-name {
		all: unset;
		cursor: pointer;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.task-name:hover {
		color: var(--text-accent-hover);
	}

	.task-name:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	.icon-button {
		all: unset;
		cursor: pointer;
		display: inline-flex;
		color: var(--text-muted);
	}

	.icon-button:hover {
		color: var(--text-normal);
	}

	.icon-button:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	.bold {
		font-weight: bold;
	}

	.italic {
		font-style: italic;
	}

	.underline {
		text-decoration: underline;
	}
</style>
