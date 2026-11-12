<script lang="ts">
	import { onMount } from 'svelte'
	import { completeJournal } from 'commands/completeJournal'
	import { promptOvernightStop, stopOvernightClock } from 'commands/overnight'
	import { runTimeCommand, TIME_COMMANDS } from 'commands/frontmatterTime'
	import { runQuickAction } from 'commands/quickActions'
	import { runTrackingSteps, setTaskTicked } from 'commands/tracking'
	import type { DailyLog } from 'core/dailyLogs'
	import { taskMinutes } from 'core/aggregate'
	import { isRunning } from 'core/note'
	import { describeDay, type OvernightNote } from 'core/overnight'
	import { pickerLabel, sortForPicker } from 'core/taskPicker'
	import { getStyleByTags } from 'core/tags'
	import { formatTimeOfDay } from 'core/timeline'
	import { formatHoursMinutes, getMinutesBetween } from 'core/time'
	import type { Task } from 'types/tasks'
	import { icon } from 'ui/icon'
	import { openTaskManager } from 'ui/TaskManagerModal'
	import type TaskTimeTracker from '../main'

	type Props = {
		plugin: TaskTimeTracker
		/** Null until the note's first write creates it. */
		log: DailyLog | null
		overnight: OvernightNote | null
		loading: boolean
	}

	const { plugin, log, overnight, loading }: Props = $props()

	let now = $state(new Date())
	/** When on, the action buttons ask how many minutes ago it happened. */
	let timeTravel = $state(false)

	const tasks = $derived(sortForPicker(log?.tasks ?? []))
	const running = $derived(tasks.filter(isRunning))
	const interruptionActive = $derived(
		running.some((task) => task.name === plugin.settings.unassignedTaskName)
	)
	const trackerActions = $derived(
		plugin.settings.quickActions.filter(
			(action) => action.showInTracker && action.name && action.taskName
		)
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

	// Clock math compares against `now`; a stale value would make a clock
	// started after the last minute tick look negative.
	$effect(() => {
		void log
		now = new Date()
	})

	onMount(() => {
		const tick = window.setInterval(() => (now = new Date()), 60 * 1000)
		return () => window.clearInterval(tick)
	})
</script>

{#if loading}
	<p class="muted">Loading…</p>
{:else}
	{#if overnight}
		{@const earlier = overnight.log}
		<section class="overnight" aria-labelledby="overnight-title">
			<h2 id="overnight-title" class="overnight-title">
				Still running from {describeDay(earlier.date, now)}
			</h2>
			{#each overnight.clocks as clock (`${clock.taskName} ${clock.start.valueOf()}`)}
				<div class="overnight-clock">
					<span class="now-name">⏳ {clock.taskName}</span>
					<span class="muted">since {formatTimeOfDay(clock.start)}</span>
				</div>
				<div class="actions">
					{#if clock.bedTime}
						{@const bedTime = clock.bedTime}
						<button
							class="mod-cta"
							onclick={() =>
								void stopOvernightClock(plugin, earlier.file, clock, bedTime)}
						>
							Stop at {formatTimeOfDay(bedTime)}
						</button>
					{/if}
					<button
						onclick={() =>
							void promptOvernightStop(plugin, earlier.file, clock)}
					>
						Stop at…
					</button>
				</div>
			{/each}
		</section>
	{/if}

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
						onclick={() => void run([{ taskName: task.name, timeTravel }])}
					></button>
				</div>
			{/each}
		{/if}
	</div>

	<div class="actions">
		<button
			onclick={() =>
				void run([
					{
						switch: true,
						placeholder: 'Which task to switch to?',
						timeTravel,
					},
				])}
		>
			Switch…
		</button>
		<button
			onclick={() =>
				void run([{ switch: true, interruption: true, timeTravel }])}
		>
			{interruptionActive ? 'End interruption' : 'Interruption'}
		</button>
		<label class="time-travel">
			<input type="checkbox" bind:checked={timeTravel} />
			Custom time
		</label>
	</div>

	{#if trackerActions.length}
		<div class="actions">
			{#each trackerActions as action (action.name)}
				<button onclick={() => void runQuickAction(plugin, action)}>
					⚡ {action.name}
				</button>
			{/each}
		</div>
	{/if}

	<ul class="tasks">
		{#each tasks as task (task.name)}
			{@const minutes = taskMinutes(task, now)}
			<li class:running={isRunning(task)}>
				<button
					class="task-name"
					class:bold={rowStyle(task).bold}
					class:italic={rowStyle(task).italic}
					class:underline={rowStyle(task).underline}
					onclick={() => void run([{ taskName: task.name, timeTravel }])}
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

	<div class="actions footer">
		{#each TIME_COMMANDS as command (command.id)}
			<button onclick={() => void runTimeCommand(plugin, command)}>
				{command.name}
			</button>
		{/each}
		<button onclick={() => void completeJournal(plugin)}>
			Complete journal
		</button>
		<button onclick={() => openTaskManager(plugin)}> Manage tasks </button>
	</div>
{/if}

<style>
	.muted {
		color: var(--text-muted);
	}

	.now {
		margin-bottom: 0.75em;
	}

	.overnight {
		margin-bottom: 1em;
		padding: 0.6em 0.75em;
		border: 1px solid var(--color-orange);
		border-radius: var(--radius-m);
	}

	.overnight-title {
		margin: 0 0 0.4em;
		font-size: var(--font-ui-small);
		font-weight: var(--font-semibold);
		color: var(--color-orange);
	}

	.overnight-clock {
		display: flex;
		align-items: center;
		gap: 0.5em;
		margin-bottom: 0.5em;
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
		flex-wrap: wrap;
		gap: 0.5em;
		margin-bottom: 0.75em;
	}

	.time-travel {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
		cursor: pointer;
	}

	.footer {
		margin-top: 1em;
		padding-top: 0.75em;
		border-top: 1px solid var(--background-modifier-border);
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
