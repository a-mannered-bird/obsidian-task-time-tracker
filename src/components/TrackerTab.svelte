<script lang="ts">
	import { onMount } from 'svelte'
	import { endDay } from 'commands/completeJournal'
	import { promptOvernightStop, stopOvernightClock } from 'commands/overnight'
	import { runQuickAction } from 'commands/quickActions'
	import { openNoteAtLine } from 'commands/taskActions'
	import {
		changeStart,
		startTask,
		stopTasks,
		type StartMode,
	} from 'commands/trackerActions'
	import { runTrackingSteps, setTaskTicked } from 'commands/tracking'
	import type { DailyLog } from 'core/dailyLogs'
	import { taskMinutes } from 'core/aggregate'
	import {
		describeDay,
		noteDayHeading,
		type OvernightNote,
	} from 'core/overnight'
	import { tagEmoji } from 'core/taskPicker'
	import { formatTimeOfDay } from 'core/timeline'
	import { formatHoursMinutes, getMinutesBetween } from 'core/time'
	import { taskChoice } from 'core/toggle'
	import {
		pausedByInterruption,
		primaryStartIcon,
		startActions,
		trackerLayout,
	} from 'core/tracker'
	import type { Task } from 'types/tasks'
	import { icon } from 'ui/icon'
	import { instantTooltip } from 'ui/tooltip'
	import type TaskTimeTracker from '../main'
	import TaskBar from './TaskBar.svelte'

	type Props = {
		plugin: TaskTimeTracker
		/** Null until the note's first write creates it. */
		log: DailyLog | null
		overnight: OvernightNote | null
		/** How the note's day is called when it is not today, else null. */
		otherDay: string | null
		loading: boolean
	}

	const { plugin, log, overnight, otherDay, loading }: Props = $props()

	let now = $state(new Date())

	const tasks = $derived(log?.tasks ?? [])
	const unassigned = $derived(plugin.settings.unassignedTaskName)
	const layout = $derived(trackerLayout(tasks, unassigned))
	const actions = $derived(startActions(layout.running))
	const paused = $derived(pausedByInterruption(tasks, unassigned))
	const interruptionActive = $derived(
		layout.running.some((task) => task.name === unassigned)
	)
	const quickActions = $derived(
		plugin.settings.quickActions.filter(
			(action) => action.showInTracker && action.name && action.taskName
		)
	)

	function runningClockStart(task: Task): Date | null {
		return task.clocks.find((clock) => clock.end === null)?.start ?? null
	}

	function elapsed(task: Task): string {
		const start = runningClockStart(task)
		if (!start) return ''
		return formatHoursMinutes(Math.max(0, getMinutesBetween(start, now)))
	}

	function editStart(task: Task, start: Date) {
		if (log) void changeStart(plugin, log.file, task.name, start)
	}

	function displayName(task: Task): string {
		const emoji = tagEmoji(task.tags, plugin.settings.tagMappings)
		return emoji ? `${emoji} ${task.name}` : task.name
	}

	function start(task: Task, mode: StartMode) {
		void startTask(plugin, taskChoice(task), mode)
	}

	function stop(names: string[], done: boolean) {
		void stopTasks(plugin, names, done)
	}

	function toggleInterruption() {
		void runTrackingSteps(plugin, [{ switch: true, interruption: true }])
	}

	function reveal(task: Task) {
		if (log) void openNoteAtLine(plugin, log.file.path, task.lineIndex)
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

{#snippet taskName(task: Task)}
	<button
		class="task-name"
		title="Show in the note"
		onclick={() => reveal(task)}
	>
		{displayName(task)}
	</button>
{/snippet}

{#snippet elapsedTime(task: Task)}
	{@const start = runningClockStart(task)}
	{#if start}
		<button
			class="elapsed"
			use:instantTooltip
			aria-label={`Started ${formatTimeOfDay(start)} · ${formatHoursMinutes(taskMinutes(task, now))} today. Click to change when ${task.name} started.`}
			onclick={() => editStart(task, start)}
		>
			{elapsed(task)}
		</button>
	{/if}
{/snippet}

{#snippet checkbox(task: Task)}
	<input
		type="checkbox"
		class="task-list-item-checkbox"
		use:instantTooltip
		aria-label={task.ticked
			? `Mark ${task.name} not done`
			: `Mark ${task.name} done`}
		checked={task.ticked}
		onchange={() => void setTaskTicked(plugin, task.name, !task.ticked)}
	/>
{/snippet}

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
					<span class="overnight-name">{clock.taskName}</span>
					<span class="muted">since {formatTimeOfDay(clock.start)}</span>
				</div>
				<div class="buttons">
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

	<div class="doing">
		<TaskBar
			{plugin}
			{tasks}
			placeholder={otherDay
				? `Add a task to ${otherDay}`
				: 'What are you working on?'}
			noteHeading={noteDayHeading(log?.date ?? now, now)}
		/>
		<div class="buttons">
			<button
				class="interruption-button"
				class:is-active={interruptionActive}
				aria-pressed={interruptionActive}
				onclick={toggleInterruption}
			>
				<span use:icon={'pause'}></span>
				Interruption
			</button>
			{#each quickActions as action (action.name)}
				<button
					class="chip"
					onclick={() => void runQuickAction(plugin, action)}
				>
					<span use:icon={'zap'}></span>
					{action.name}
				</button>
			{/each}
		</div>
	</div>

	{#if layout.running.length > 0}
		{@const several = layout.running.length > 1}
		<section class="section" aria-labelledby="now-title">
			<h2 id="now-title" class="section-title">
				Now
				{#if several}
					<span class="muted">· {layout.running.length} running</span>
					<button
						class="link-button"
						onclick={() =>
							stop(
								layout.running.map((task) => task.name),
								false
							)}
					>
						Stop all
					</button>
				{/if}
			</h2>
			<ul class="rows">
				{#each layout.running as task (task.name)}
					{#if task.name === unassigned}
						<li class="row running interruption">
							<span class="row-icon" use:icon={'pause'}></span>
							<span
								class="task-name interruption-name"
								title={paused.length > 0
									? `Paused: ${paused.map(displayName).join(', ')}. They resume when you end the interruption.`
									: undefined}
							>
								Interruption
							</span>
							{@render elapsedTime(task)}
							<button
								class="mod-cta end-button"
								aria-label="End interruption"
								use:instantTooltip
								onclick={toggleInterruption}
							>
								End
							</button>
						</li>
					{:else}
						<li class="row running">
							{@render taskName(task)}
							{@render elapsedTime(task)}
							<span class="row-actions">
								<button
									class="row-button"
									use:instantTooltip
									aria-label={`Done: stop and tick ${task.name}`}
									use:icon={'check'}
									onclick={() => stop([task.name], true)}
								></button>
								<button
									class="row-button"
									use:instantTooltip
									aria-label={`Stop ${task.name}`}
									use:icon={'square'}
									onclick={() => stop([task.name], false)}
								></button>
							</span>
						</li>
					{/if}
				{/each}
			</ul>
		</section>
	{/if}

	{#if layout.open.length > 0 || layout.done.length > 0}
		<section class="section" aria-labelledby="plan-title">
			<h2 id="plan-title" class="section-title">
				{otherDay ? `Plan for ${otherDay}` : "Today's plan"}
			</h2>
			<ul class="rows">
				{#each layout.open as task (task.name)}
					{@const minutes = taskMinutes(task, now)}
					<li class="row">
						{@render checkbox(task)}
						{@render taskName(task)}
						{#if paused.includes(task)}
							<span class="paused-label">paused</span>
						{/if}
						{#if minutes > 0}
							<span class="muted total">{formatHoursMinutes(minutes)}</span>
						{/if}
						<span class="row-actions">
							<button
								class="row-button"
								use:instantTooltip
								aria-label={actions.primary === 'switch'
									? `Switch to ${task.name}`
									: `Start ${task.name}`}
								use:icon={primaryStartIcon(actions.primary)}
								onclick={() => start(task, actions.primary)}
							></button>
							{#if actions.alongside}
								<button
									class="row-button"
									use:instantTooltip
									aria-label={`Start ${task.name} alongside`}
									use:icon={'plus'}
									onclick={() => start(task, 'alongside')}
								></button>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
			{#if layout.done.length > 0}
				<details class="done" open={layout.doneUnfolded}>
					<summary>Done ({layout.done.length})</summary>
					<ul class="rows">
						{#each layout.done as task (task.name)}
							{@const minutes = taskMinutes(task, now)}
							<li class="row is-done">
								{@render checkbox(task)}
								{@render taskName(task)}
								{#if minutes > 0}
									<span class="muted total">{formatHoursMinutes(minutes)}</span>
								{/if}
							</li>
						{/each}
					</ul>
				</details>
			{/if}
		</section>
	{:else if layout.running.length === 0}
		<div class="empty">
			<p class="empty-title">Nothing tracked yet</p>
			<p>Type what you're working on and press Start.</p>
			<p>
				Tasks are saved as <code>- [ ]</code> lines in the daily note, so you can
				also write your plan there.
			</p>
		</div>
	{/if}

	{#if tasks.length > 0}
		<div class="footer">
			<button class="end-day" onclick={() => void endDay(plugin)}>
				<span use:icon={'moon'}></span>
				End day
			</button>
		</div>
	{/if}
{/if}

<style>
	.muted {
		color: var(--text-muted);
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5em;
	}

	.buttons button,
	.end-day,
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35em;
	}

	.doing {
		display: flex;
		flex-direction: column;
		gap: 0.6em;
		margin-bottom: 1.2em;
	}

	.chip {
		border-radius: var(--radius-l);
	}

	.interruption-button.is-active {
		color: var(--color-orange);
		box-shadow: inset 0 0 0 1px var(--color-orange);
	}

	.section {
		margin-bottom: 1.2em;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 0.4em;
		margin: 0 0 0.5em;
		font-size: var(--font-ui-smaller);
		font-weight: var(--font-semibold);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.link-button {
		all: unset;
		cursor: pointer;
		margin-left: auto;
		text-transform: none;
		letter-spacing: normal;
		color: var(--text-accent);
	}

	.elapsed {
		all: unset;
		cursor: pointer;
		font-weight: var(--font-semibold);
		font-variant-numeric: tabular-nums;
		text-decoration: underline dotted var(--text-faint);
		text-underline-offset: 4px;
	}

	.elapsed:hover {
		text-decoration-color: var(--text-muted);
	}

	.elapsed:focus-visible,
	.link-button:focus-visible,
	.task-name:focus-visible,
	.row-button:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	/* Running rows keep the plan rows' height, set apart by a background. */
	.row.running {
		padding: 0 0.25em 0 0.6em;
		border-radius: var(--radius-s);
		background: var(--background-secondary);
	}

	.row.running + .row.running {
		margin-top: 2px;
	}

	/* Accent and weight mark a running task, here and in the pickers. */
	.row.running .task-name {
		font-weight: var(--font-semibold);
		color: var(--text-accent);
	}

	.row.interruption {
		background: rgba(var(--color-orange-rgb), 0.12);
	}

	.row-icon {
		display: inline-flex;
		color: var(--color-orange);
	}

	.interruption-name {
		cursor: default;
		color: var(--color-orange);
	}

	/* Orange like the rest of the interruption, not the accent. */
	.end-button.mod-cta {
		margin-left: 0.25em;
		background: var(--color-orange);
		color: var(--text-on-accent);
	}

	.overnight-name {
		font-weight: var(--font-semibold);
		color: var(--text-accent);
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

	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.6em;
		/* Dense with a mouse; finger-sized on mobile, below. */
		min-height: 32px;
	}

	.row .task-list-item-checkbox {
		margin: 0;
		flex: none;
	}

	.task-name {
		all: unset;
		cursor: pointer;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.task-name:hover {
		color: var(--text-accent-hover);
	}

	.is-done .task-name {
		color: var(--text-muted);
		text-decoration: line-through;
	}

	.total {
		font-size: var(--font-ui-smaller);
		font-variant-numeric: tabular-nums;
	}

	.paused-label {
		font-size: var(--font-ui-smaller);
		color: var(--color-orange);
	}

	/* The row's gap spaces the text; the buttons' own boxes already space
	   their icons. */
	.row-actions {
		display: flex;
		flex: none;
	}

	.row-button {
		all: unset;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-s);
		color: var(--text-muted);
	}

	:global(body.is-mobile) .row {
		min-height: 44px;
	}

	:global(body.is-mobile) .row-button {
		width: 36px;
		height: 36px;
	}

	.row-button:hover {
		background: var(--background-modifier-hover);
		color: var(--text-normal);
	}

	.done summary {
		cursor: pointer;
		padding: 0.5em 0;
		color: var(--text-muted);
	}

	.empty {
		padding: 1em;
		border: 1px dashed var(--background-modifier-border);
		border-radius: var(--radius-m);
		color: var(--text-muted);
	}

	.empty p {
		margin: 0.3em 0;
	}

	.empty-title {
		font-weight: var(--font-semibold);
		color: var(--text-normal);
	}

	.footer {
		margin-top: 1em;
		padding-top: 0.75em;
		border-top: 1px solid var(--background-modifier-border);
	}

	.end-day {
		width: 100%;
		justify-content: center;
	}
</style>
