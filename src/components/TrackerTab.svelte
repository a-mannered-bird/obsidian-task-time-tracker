<script lang="ts">
	import { Menu } from 'obsidian'
	import { onMount } from 'svelte'
	import { endDay } from 'commands/completeJournal'
	import { promptOvernightStop, stopOvernightClock } from 'commands/overnight'
	import { runQuickAction } from 'commands/quickActions'
	import { openNoteAtLine } from 'commands/taskActions'
	import { deleteClockLine } from 'commands/timelineEdits'
	import {
		changeStart,
		deleteTaskFromNote,
		migrateLastClock,
		moveTask,
		setDuration,
		setStop,
		startTask,
		stopFromLastEnd,
		stopTasks,
		toggleInterruption,
		type StartMode,
	} from 'commands/trackerActions'
	import { setTaskTicked } from 'commands/tracking'
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
	import { INTERRUPTION_TASK, taskChoice } from 'core/toggle'
	import {
		dropMove,
		dropSlot,
		pausedByInterruption,
		primaryStartIcon,
		rowActions,
		rowClock,
		startActions,
		trackerLayout,
		type RowAction,
		type TaskMove,
	} from 'core/tracker'
	import type { Task } from 'types/tasks'
	import { icon } from 'ui/icon'
	import { openTaskManager } from 'ui/TaskManagerModal'
	import { rowMotion } from 'ui/rowMotion'
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

	const motion = rowMotion()
	$effect.pre(() => {
		motion.show(log?.file.path ?? null)
	})

	/**
	 * Call before switching to another tab: the rows' transitions are global
	 * (they must play when a section opens or closes), so removing the tab
	 * would otherwise play them too and keep it on screen meanwhile.
	 */
	export function leave() {
		motion.stop()
	}

	const tasks = $derived(log?.tasks ?? [])
	const layout = $derived(trackerLayout(tasks))
	const actions = $derived(startActions(layout.running))
	const paused = $derived(pausedByInterruption(tasks))
	const interruptionActive = $derived(
		layout.running.some((task) => task.name === INTERRUPTION_TASK)
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

	function reveal(task: Task) {
		if (log) void openNoteAtLine(plugin, log.file.path, task.lineIndex)
	}

	// ----- reordering by dragging a name -----

	/** Movement before a press becomes a drag, so a click stays a click. */
	const DRAG_THRESHOLD_PX = 4
	/** Finger movement before the long press that means "scroll" instead. */
	const SCROLL_SLOP_PX = 8
	const LONG_PRESS_MS = 400

	type RowPress = {
		name: string
		/** The names of the dragged row's section, in order. */
		names: string[]
		list: HTMLElement
		row: HTMLElement
		/** The copy of the row following the pointer, once the drag is on. */
		ghost: HTMLElement | null
		/** Where in the row it was grabbed, so the ghost keeps that hold. */
		grabOffset: number
		pointerId: number
		x0: number
		y0: number
		touch: boolean
		/** Movement now drags: a mouse, or a finger after the long press. */
		armed: boolean
		timer: number
	}
	let rowPress: RowPress | null = null
	/** The row being dragged and where it would land, while a drag is on. */
	let rowDrag = $state<{ name: string; move: TaskMove | null } | null>(null)

	function onNamePointerDown(
		event: PointerEvent,
		name: string,
		names: string[]
	) {
		if (event.button !== 0 || !log) return
		const target = event.currentTarget
		const row = target instanceof HTMLElement ? target.closest('li') : null
		const list = row?.closest('ul')
		if (!row || !list) return
		const touch = event.pointerType === 'touch'
		const press: RowPress = {
			name,
			names,
			list,
			row,
			ghost: null,
			grabOffset: event.clientY - row.getBoundingClientRect().top,
			pointerId: event.pointerId,
			x0: event.clientX,
			y0: event.clientY,
			touch,
			armed: !touch,
			timer: 0,
		}
		if (touch) {
			press.timer = window.setTimeout(() => {
				press.armed = true
				rowDrag = { name, move: null }
				showGhost(press, press.y0)
				navigator.vibrate?.(15)
			}, LONG_PRESS_MS)
		}
		rowPress = press
	}

	function onRowPointerMove(event: PointerEvent) {
		const press = rowPress
		if (!press || event.pointerId !== press.pointerId) return
		if (!rowDrag) {
			const distance = Math.hypot(
				event.clientX - press.x0,
				event.clientY - press.y0
			)
			if (!press.armed) {
				if (distance > SCROLL_SLOP_PX) endRowPress()
				return
			}
			if (distance < DRAG_THRESHOLD_PX) return
		}
		showGhost(press, event.clientY)
		const middles = Array.from(press.list.children).map((row) => {
			const rect = row.getBoundingClientRect()
			return rect.top + rect.height / 2
		})
		rowDrag = {
			name: press.name,
			move: dropMove(press.names, press.name, dropSlot(middles, event.clientY)),
		}
	}

	function onRowPointerUp(event: PointerEvent) {
		const press = rowPress
		if (!press || event.pointerId !== press.pointerId) return
		const move = rowDrag?.move
		endRowPress()
		if (move && log) void moveTask(plugin, log.file, press.name, move)
	}

	function endRowPress() {
		if (rowPress) {
			window.clearTimeout(rowPress.timer)
			rowPress.ghost?.remove()
		}
		rowPress = null
		rowDrag = null
	}

	/**
	 * A copy of the row, made on the drag's first move, that follows the
	 * pointer up and down while the row itself stays in place, faded.
	 */
	function showGhost(press: RowPress, y: number) {
		if (!press.ghost) {
			const ghost = press.row.cloneNode(true)
			if (!(ghost instanceof HTMLElement)) return
			const rect = press.row.getBoundingClientRect()
			ghost.classList.remove('is-dragged', 'drop-before', 'drop-after')
			ghost.classList.add('task-time-tracker-drag-ghost')
			ghost.inert = true
			ghost.setAttribute('aria-hidden', 'true')
			ghost.setCssStyles({ left: `${rect.left}px`, width: `${rect.width}px` })
			press.row.ownerDocument.body.appendChild(ghost)
			press.ghost = ghost
		}
		press.ghost.setCssStyles({ top: `${y - press.grabOffset}px` })
	}

	function onRowTouchMove(event: TouchEvent) {
		// Once a finger holds a name, its moves drag instead of scrolling.
		if (rowPress?.touch && rowPress.armed && event.cancelable) {
			event.preventDefault()
		}
	}

	/** A held finger would otherwise also open the system's long-press menu. */
	function onRowContextMenu(event: MouseEvent) {
		if (rowPress?.touch) event.preventDefault()
	}

	function onRowKeyUp(event: KeyboardEvent) {
		if (event.key === 'Escape' && rowDrag) endRowPress()
	}

	function dropSide(task: Task): 'before' | 'after' | null {
		const move = rowDrag?.move
		return move && typeof move === 'object' && move.next === task.name
			? move.side
			: null
	}

	// ----- row menu -----

	type MenuGroup = 'track' | 'move' | 'show' | 'delete'

	const ROW_ITEMS: Record<
		RowAction,
		{ title: string; icon: string; group: MenuGroup }
	> = {
		'stop-from-last-end': {
			title: 'Stop from last task end',
			icon: 'step-forward',
			group: 'track',
		},
		'change-start': {
			title: 'Change clock start time',
			icon: 'clock',
			group: 'track',
		},
		'set-stop': {
			title: 'Set clock stop time',
			icon: 'timer-off',
			group: 'track',
		},
		'set-duration': {
			title: 'Set clock duration',
			icon: 'hourglass',
			group: 'track',
		},
		'migrate-clock': {
			title: 'Migrate clock to another task',
			icon: 'move',
			group: 'track',
		},
		'start-from-last-end': {
			title: 'Start from last task end',
			icon: 'step-forward',
			group: 'track',
		},
		'migrate-last-clock': {
			title: 'Migrate last clock to another task',
			icon: 'move',
			group: 'track',
		},
		'move-up': { title: 'Move up', icon: 'arrow-up', group: 'move' },
		'move-down': { title: 'Move down', icon: 'arrow-down', group: 'move' },
		'move-to-bottom': {
			title: 'Move to the bottom',
			icon: 'arrow-down-to-line',
			group: 'move',
		},
		'move-to-top': {
			title: 'Move to the top',
			icon: 'arrow-up-to-line',
			group: 'move',
		},
		'show-task': {
			title: 'Show task in daily note',
			icon: 'file-text',
			group: 'show',
		},
		'show-clock': {
			title: 'Show clock in daily note',
			icon: 'file-clock',
			group: 'show',
		},
		'show-last-clock': {
			title: 'Show last clock in daily note',
			icon: 'file-clock',
			group: 'show',
		},
		'show-in-manager': {
			title: 'Show in task manager',
			icon: 'list-todo',
			group: 'show',
		},
		'delete-clock': {
			title: 'Delete clock',
			icon: 'trash-2',
			group: 'delete',
		},
		'delete-last-clock': {
			title: 'Delete last clock',
			icon: 'trash-2',
			group: 'delete',
		},
		'delete-task': {
			title: 'Delete task and all clocks',
			icon: 'trash-2',
			group: 'delete',
		},
	}

	function openRowMenu(event: MouseEvent, task: Task) {
		const menu = new Menu()
		let group: MenuGroup | null = null
		for (const action of rowActions(task, tasks)) {
			const item = ROW_ITEMS[action]
			if (group && item.group !== group) menu.addSeparator()
			group = item.group
			menu.addItem((menuItem) =>
				menuItem
					.setTitle(item.title)
					.setIcon(item.icon)
					.setWarning(item.group === 'delete')
					.onClick(() => runRowAction(action, task))
			)
		}
		// Under the button, whether opened by a click or the keyboard.
		const rect =
			event.currentTarget instanceof HTMLElement
				? event.currentTarget.getBoundingClientRect()
				: { left: event.clientX, bottom: event.clientY }
		menu.showAtPosition({ x: rect.left, y: rect.bottom })
	}

	function runRowAction(action: RowAction, task: Task) {
		if (!log) return
		const { file } = log
		const name = task.name
		const clock = rowClock(task)
		switch (action) {
			case 'stop-from-last-end':
				return void stopFromLastEnd(plugin, name)
			case 'change-start':
				if (clock) editStart(task, clock.start)
				return
			case 'set-stop':
				if (clock) void setStop(plugin, file, name, clock.start)
				return
			case 'set-duration':
				return void setDuration(plugin, name)
			case 'migrate-clock':
			case 'migrate-last-clock':
				return void migrateLastClock(plugin, name)
			case 'start-from-last-end':
				return start(task, 'fromLastEnd')
			case 'move-up':
				return void moveTask(plugin, file, name, 'up')
			case 'move-down':
				return void moveTask(plugin, file, name, 'down')
			case 'move-to-bottom':
				return void moveTask(plugin, file, name, 'bottom')
			case 'move-to-top':
				return void moveTask(plugin, file, name, 'top')
			case 'show-task':
				return reveal(task)
			case 'show-clock':
			case 'show-last-clock':
				if (clock) void openNoteAtLine(plugin, file.path, clock.lineIndex)
				return
			case 'delete-clock':
			case 'delete-last-clock':
				if (clock) {
					const key = { taskName: name, start: clock.start, end: clock.end }
					void deleteClockLine(plugin, file, key, task.tags)
				}
				return
			case 'show-in-manager':
				return openTaskManager(plugin, name)
			case 'delete-task':
				return void deleteTaskFromNote(plugin, file, name, task.clocks.length)
		}
	}

	// Clock math compares against `now`; a stale value would make a clock
	// started after the last minute tick look negative.
	$effect(() => {
		void log
		now = new Date()
	})

	onMount(() => {
		const tick = window.setInterval(() => (now = new Date()), 60 * 1000)
		window.addEventListener('pointermove', onRowPointerMove)
		window.addEventListener('pointerup', onRowPointerUp)
		window.addEventListener('pointercancel', endRowPress)
		window.addEventListener('keyup', onRowKeyUp)
		window.addEventListener('contextmenu', onRowContextMenu)
		// Not through Svelte attributes: those make touchmove passive.
		window.addEventListener('touchmove', onRowTouchMove, { passive: false })
		return () => {
			window.clearInterval(tick)
			window.removeEventListener('pointermove', onRowPointerMove)
			window.removeEventListener('pointerup', onRowPointerUp)
			window.removeEventListener('pointercancel', endRowPress)
			window.removeEventListener('keyup', onRowKeyUp)
			window.removeEventListener('contextmenu', onRowContextMenu)
			window.removeEventListener('touchmove', onRowTouchMove)
			endRowPress()
		}
	})
</script>

{#snippet taskName(task: Task, section?: Task[])}
	<span
		class="task-name"
		class:is-draggable={section !== undefined}
		onpointerdown={section
			? (event) =>
					onNamePointerDown(
						event,
						task.name,
						section.map((other) => other.name)
					)
			: undefined}
	>
		{displayName(task)}
	</span>
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

{#snippet moreButton(task: Task)}
	<button
		class="row-button"
		use:instantTooltip
		aria-label={`More actions for ${task.name}`}
		use:icon={'more-horizontal'}
		onclick={(event) => openRowMenu(event, task)}
	></button>
{/snippet}

{#snippet checkbox(task: Task)}
	{@const color = plugin.settings.taskColors[task.name]}
	<input
		type="checkbox"
		class="task-list-item-checkbox"
		class:has-task-color={color !== undefined}
		style:--task-color={color}
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
					{#if clock.dayEnd}
						{@const dayEnd = clock.dayEnd}
						<button
							class="mod-cta"
							onclick={() =>
								void stopOvernightClock(plugin, earlier.file, clock, dayEnd)}
						>
							Stop at {formatTimeOfDay(dayEnd)}
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
				: 'What task will you focus on?'}
			planPlaceholder={otherDay
				? `Plan a task for ${otherDay}`
				: "Add a task to today's plan"}
			alongsidePlaceholder={otherDay
				? `Add a task running alongside to ${otherDay}`
				: 'Are you multi-tasking?'}
			noteHeading={noteDayHeading(log?.date ?? now, now)}
		/>
		<div class="buttons">
			<button
				class="interruption-button"
				class:is-active={interruptionActive}
				aria-pressed={interruptionActive}
				onclick={() => void toggleInterruption(plugin)}
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
		<section
			class="section"
			aria-labelledby="now-title"
			transition:motion.section|global
		>
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
					<li
						class="row running"
						class:interruption={task.name === INTERRUPTION_TASK}
						in:motion.receive|global={{ key: task.name }}
						out:motion.send|global={{ key: task.name }}
						animate:motion.slide
					>
						{#if task.name === INTERRUPTION_TASK}
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
								onclick={() => void toggleInterruption(plugin)}
							>
								End
							</button>
							<span class="row-actions">
								{@render moreButton(task)}
							</span>
						{:else}
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
								{@render moreButton(task)}
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if layout.open.length > 0 || layout.done.length > 0}
		<section
			class="section"
			aria-labelledby="plan-title"
			transition:motion.section|global
		>
			<h2 id="plan-title" class="section-title">
				{otherDay ? `Plan for ${otherDay}` : "Today's plan"}
			</h2>
			<ul class="rows">
				{#each layout.open as task (task.name)}
					{@const minutes = taskMinutes(task, now)}
					<li
						class="row"
						class:is-dragged={rowDrag?.name === task.name}
						class:drop-before={dropSide(task) === 'before'}
						class:drop-after={dropSide(task) === 'after'}
						in:motion.receive|global={{ key: task.name }}
						out:motion.send|global={{ key: task.name }}
						animate:motion.slide
					>
						{@render checkbox(task)}
						{@render taskName(task, layout.open)}
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
							{@render moreButton(task)}
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
							<li
								class="row is-done"
								class:is-dragged={rowDrag?.name === task.name}
								class:drop-before={dropSide(task) === 'before'}
								class:drop-after={dropSide(task) === 'after'}
								in:motion.receive|global={{ key: task.name }}
								out:motion.send|global={{ key: task.name }}
								animate:motion.slide
							>
								{@render checkbox(task)}
								{@render taskName(task, layout.done)}
								{#if minutes > 0}
									<span class="muted total">{formatHoursMinutes(minutes)}</span>
								{/if}
								<span class="row-actions">
									{@render moreButton(task)}
								</span>
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
				<span use:icon={'sunset'}></span>
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

	.row .task-list-item-checkbox.has-task-color {
		--checkbox-color: var(--task-color);
		--checkbox-color-hover: color-mix(
			in srgb,
			var(--task-color) 80%,
			var(--text-normal)
		);
		--checkbox-border-color: var(--task-color);
		--checkbox-border-color-hover: var(--checkbox-color-hover);
	}

	.task-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.task-name.is-draggable {
		cursor: grab;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
	}

	.row.is-dragged {
		opacity: 0.5;
	}

	.row.drop-before {
		box-shadow: inset 0 2px 0 var(--interactive-accent);
	}

	.row.drop-after {
		box-shadow: inset 0 -2px 0 var(--interactive-accent);
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
