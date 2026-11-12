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
	import { describeDay, type OvernightNote } from 'core/overnight'
	import { tagEmoji } from 'core/taskPicker'
	import { getStyleByTags } from 'core/tags'
	import { formatTimeOfDay } from 'core/timeline'
	import { formatHoursMinutes, getMinutesBetween } from 'core/time'
	import { taskChoice } from 'core/toggle'
	import {
		pausedByInterruption,
		startActions,
		trackerLayout,
	} from 'core/tracker'
	import type { Task } from 'types/tasks'
	import { icon } from 'ui/icon'
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

	function textStyle(task: Task) {
		return getStyleByTags(task.tags, plugin.settings.tagMappings)
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
		class:bold={textStyle(task).bold}
		class:italic={textStyle(task).italic}
		class:underline={textStyle(task).underline}
		title="Show in the note"
		onclick={() => reveal(task)}
	>
		{displayName(task)}
	</button>
{/snippet}

{#snippet checkbox(task: Task)}
	<input
		type="checkbox"
		class="task-list-item-checkbox"
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
					<span class="card-name">⏳ {clock.taskName}</span>
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
		{@const compact = layout.running.length > 1}
		<section class="section" aria-labelledby="now-title">
			<h2 id="now-title" class="section-title">
				Now
				{#if compact}
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
			<div class="cards">
				{#each layout.running as task (task.name)}
					{@const start = runningClockStart(task)}
					{#if task.name === unassigned}
						<div class="card interruption">
							<div class="card-name">Interruption</div>
							<div class="elapsed">{elapsed(task)}</div>
							{#if start}
								<div class="muted">Started {formatTimeOfDay(start)}</div>
							{/if}
							{#if paused.length > 0}
								<p class="paused">
									Paused: {paused.map(displayName).join(', ')}. They resume when
									you end the interruption, and you'll be asked what it was.
								</p>
							{/if}
							<div class="buttons">
								<button class="mod-cta" onclick={toggleInterruption}>
									End interruption
								</button>
							</div>
						</div>
					{:else}
						<div class="card" class:compact>
							<div class="card-name">
								<span class="dot"></span>{displayName(task)}
							</div>
							<div class="card-body">
								<div>
									<div class="elapsed">{elapsed(task)}</div>
									<div class="muted">
										{#if start}
											<button
												class="start-time"
												title="Change when it started"
												onclick={() => editStart(task, start)}
											>
												Started {formatTimeOfDay(start)}
											</button>
											·
										{/if}
										{formatHoursMinutes(taskMinutes(task, now))} today
									</div>
								</div>
								<div class="buttons">
									<button
										aria-label={`Done: stop and tick ${task.name}`}
										title="Done"
										onclick={() => stop([task.name], true)}
									>
										<span use:icon={'check'}></span>
										{#if !compact}Done{/if}
									</button>
									<button
										aria-label={`Stop ${task.name}`}
										title="Stop"
										onclick={() => stop([task.name], false)}
									>
										<span use:icon={'square'}></span>
										{#if !compact}Stop{/if}
									</button>
								</div>
							</div>
						</div>
					{/if}
				{/each}
			</div>
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
						<button
							class="row-button"
							aria-label={actions.primary === 'switch'
								? `Switch to ${task.name}`
								: `Start ${task.name}`}
							title={actions.primary === 'switch' ? 'Switch to this' : 'Start'}
							use:icon={'play'}
							onclick={() => start(task, actions.primary)}
						></button>
						{#if actions.alongside}
							<button
								class="row-button"
								aria-label={`Start ${task.name} alongside`}
								title="Start alongside"
								use:icon={'plus'}
								onclick={() => start(task, 'alongside')}
							></button>
						{/if}
					</li>
				{/each}
			</ul>
			{#if layout.done.length > 0}
				<details class="done">
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

	.start-time {
		all: unset;
		cursor: pointer;
		text-decoration: underline dotted;
		text-underline-offset: 3px;
	}

	.start-time:hover {
		color: var(--text-normal);
	}

	.start-time:focus-visible,
	.link-button:focus-visible,
	.task-name:focus-visible,
	.row-button:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	.cards {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 0.2em;
		padding: 0.7em 0.85em;
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-m);
		background: var(--background-secondary);
	}

	.card.interruption {
		border-color: var(--color-orange);
	}

	.card.interruption .card-name {
		color: var(--color-orange);
	}

	.card-name {
		display: flex;
		align-items: center;
		gap: 0.5em;
		font-weight: var(--font-semibold);
	}

	.dot {
		width: 0.5em;
		height: 0.5em;
		flex: none;
		border-radius: 50%;
		background: var(--color-green);
	}

	.card-body {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
	}

	.card.compact .card-body {
		flex-direction: row;
		align-items: flex-end;
		gap: 0.75em;
	}

	.card.compact .card-body > :first-child {
		flex: 1;
		min-width: 0;
	}

	.card.compact .buttons {
		flex-wrap: nowrap;
	}

	.elapsed {
		font-size: 1.9em;
		font-weight: var(--font-semibold);
		font-variant-numeric: tabular-nums;
		line-height: 1.15;
	}

	.card.compact .elapsed {
		font-size: 1.5em;
	}

	.paused {
		margin: 0.3em 0;
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
		min-height: 44px;
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

	.row-button {
		all: unset;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-s);
		color: var(--text-muted);
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
