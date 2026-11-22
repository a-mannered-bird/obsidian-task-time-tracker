<script lang="ts">
	import { Menu } from 'obsidian'
	import { onMount } from 'svelte'
	import { endDay } from 'commands/completeJournal'
	import { promptOvernightStop, stopOvernightClock } from 'commands/overnight'
	import { controlHint, titleWithShortcut } from 'commands/shortcuts'
	import { openNoteAtLine } from 'commands/taskActions'
	import { deleteClockLine } from 'commands/timelineEdits'
	import {
		changeStart,
		deleteTaskFromNote,
		migrateLastClock,
		moveTask,
		setDuration,
		setInterruptionDuration,
		setInterruptionStop,
		setStop,
		startTask,
		startTaskAt,
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
	import { goalCards, isDayOver } from 'core/goalCards'
	import { tagSlot } from 'core/rowTags'
	import type { ViewControl } from 'core/shortcuts'
	import { formatTimeOfDay } from 'core/timeline'
	import { formatHoursMinutes, getMinutesBetween } from 'core/time'
	import { INTERRUPTION_TASK, taskChoice } from 'core/toggle'
	import {
		dropMove,
		INITIAL_BAR_MODE,
		dayButtons,
		dropSlot,
		pausedByInterruption,
		rowActions,
		rowClock,
		rowStart,
		startActions,
		startIcon,
		trackerLayout,
		describeDuplicateTask,
		findDuplicateTask,
		type BarMode,
		type RowAction,
		type RowStart,
		type TaskMove,
	} from 'core/tracker'
	import type { Task } from 'types/tasks'
	import { START_AT_ICON, STOP_AT_ICON } from 'ui/customIcons'
	import { icon } from 'ui/icon'
	import { openTaskManager } from 'ui/TaskManagerModal'
	import { rowMotion } from 'ui/rowMotion'
	import { instantTooltip } from 'ui/tooltip'
	import { showActionNotice } from 'ui/undoNotice'
	import type TaskTimeTracker from '../main'
	import GoalBars from './GoalBars.svelte'
	import TagEditor from './TagEditor.svelte'
	import TaskBar from './TaskBar.svelte'

	type Props = {
		plugin: TaskTimeTracker
		/** Null until the note's first write creates it. */
		log: DailyLog | null
		overnight: OvernightNote | null
		/** How the note's day is called when it is not today, else null. */
		otherDay: string | null
		loading: boolean
		/** Edit a goal (by id) in the Goals tab, from its bar. */
		oneditgoal: (goalId: string) => void
	}

	const { plugin, log, overnight, otherDay, loading, oneditgoal }: Props =
		$props()

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
	const duplicate = $derived(findDuplicateTask(tasks))
	const layout = $derived(trackerLayout(tasks))
	let barMode = $state<BarMode>(INITIAL_BAR_MODE)
	const rowStarts = $derived(rowStart(barMode, startActions(layout.running)))
	const paused = $derived(pausedByInterruption(tasks))
	const interruptionActive = $derived(
		layout.running.some((task) => task.name === INTERRUPTION_TASK)
	)
	const unavailable = $derived(dayButtons(tasks, log?.dayStart ?? null))
	function interruptionHint() {
		if (unavailable.interruption) return [unavailable.interruption]
		return [
			interruptionActive
				? 'End it: say what interrupted you, its time goes there, and the paused tasks resume'
				: 'Pause the running tasks and count the time until you say what interrupted you',
			controlHint(plugin, 'interruption'),
		]
	}
	function endDayHint() {
		if (unavailable.endDay) return [unavailable.endDay]
		return [
			'Set the end of day, stop the running clocks at it, tick the tasks with time and remove the ones without',
			controlHint(plugin, 'endDay'),
		]
	}

	// Every note change reloads the log: warn once per duplicate line, not
	// on each keystroke while the user is fixing it.
	let warnedDuplicate: string | null = null
	$effect(() => {
		const key =
			duplicate && log
				? `${log.file.path}:${duplicate.lineIndex}:${duplicate.name}`
				: null
		if (key === warnedDuplicate) return
		warnedDuplicate = key
		if (!duplicate) return
		const task = duplicate
		showActionNotice(describeDuplicateTask(task.name), [
			{ label: 'Go to task', run: () => reveal(task) },
		])
	})

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

	function stopAt(task: Task) {
		const start = runningClockStart(task)
		if (log && start) void setStop(plugin, log.file, task.name, start)
	}

	/** The task whose tag editor is open, if any: one at a time. */
	let editingTags = $state<string | null>(null)
	const notePath = $derived(log?.file.path ?? null)
	$effect.pre(() => {
		void notePath
		editingTags = null
	})

	function toggleTagEditor(name: string) {
		editingTags = editingTags === name ? null : name
	}

	const tagSlots = new Map<string, HTMLElement>()
	function registerTagSlot(node: HTMLElement, name: string) {
		tagSlots.set(name, node)
		return {
			update(next: string) {
				tagSlots.delete(name)
				name = next
				tagSlots.set(name, node)
			},
			destroy() {
				if (tagSlots.get(name) === node) tagSlots.delete(name)
			},
		}
	}

	/** Closed from inside the editor: the focus goes back to its slot. */
	function closeTagEditor() {
		const name = editingTags
		editingTags = null
		if (name) tagSlots.get(name)?.focus()
	}

	function start(task: Task, mode: StartMode) {
		void startTask(plugin, taskChoice(task), mode)
	}

	const START_LABELS: Record<RowStart, (name: string) => string> = {
		start: (name) => `Start ${name}`,
		switch: (name) => `Switch to ${name}`,
		alongside: (name) => `Start ${name} alongside`,
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
		editingTags = null
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
		{ title: string; icon: string; group: MenuGroup; control?: ViewControl }
	> = {
		'switch-to': {
			title: 'Switch to this task',
			icon: startIcon('switch'),
			group: 'track',
			control: 'switch',
		},
		'start-alongside': {
			title: 'Start alongside',
			icon: startIcon('alongside'),
			group: 'track',
			control: 'alongside',
		},
		'stop-from-last-end': {
			title: 'Stop from last task end',
			icon: 'step-forward',
			group: 'track',
			control: 'fromLastEnd',
		},
		'change-start': {
			title: 'Change clock start time',
			icon: 'clock',
			group: 'track',
		},
		'set-stop': {
			title: 'Set clock stop time',
			icon: STOP_AT_ICON,
			group: 'track',
		},
		'migrate-clock': {
			title: 'Migrate clock to another task',
			icon: 'move',
			group: 'track',
			control: 'migrateClock',
		},
		'start-from-last-end': {
			title: 'Start from last task end',
			icon: 'step-forward',
			group: 'track',
			control: 'fromLastEnd',
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
		for (const action of rowActions(task, tasks, rowStarts)) {
			const item = ROW_ITEMS[action]
			if (group && item.group !== group) menu.addSeparator()
			group = item.group
			menu.addItem((menuItem) =>
				menuItem
					.setTitle(titleWithShortcut(plugin, item.title, item.control))
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
			case 'switch-to':
				return start(task, 'switch')
			case 'start-alongside':
				return start(task, 'alongside')
			case 'stop-from-last-end':
				return void stopFromLastEnd(plugin, name)
			case 'change-start':
				if (clock) editStart(task, clock.start)
				return
			case 'set-stop':
				if (clock) void setStop(plugin, file, name, clock.start)
				return
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
		{task.name}
	</span>
{/snippet}

{#snippet tags(task: Task)}
	{@const slot = tagSlot(task.tags, plugin.settings.tagMappings)}
	{@const open = editingTags === task.name}
	<button
		class="tag-slot"
		class:is-untagged={!slot.tagged}
		class:is-open={open}
		use:instantTooltip
		aria-label={slot.label}
		aria-expanded={open}
		use:registerTagSlot={task.name}
		onclick={() => toggleTagEditor(task.name)}
	>
		{#if slot.emoji === null}
			<span class="tag-hash" aria-hidden="true" use:icon={'hash'}></span>
		{:else}
			<span class="tag-emoji">
				{slot.emoji}
				{#if slot.badge > 0}
					<span class="tag-badge" aria-hidden="true">+{slot.badge}</span>
				{/if}
			</span>
		{/if}
	</button>
{/snippet}

{#snippet bars(task: Task)}
	{#if task.goals.length > 0 && log}
		<GoalBars
			cards={goalCards([task], now, isDayOver(log, now))}
			metricSettings={plugin.settings.metricSettings}
			onedit={oneditgoal}
		/>
	{/if}
{/snippet}

{#snippet tagEditor(task: Task)}
	{#if log && editingTags === task.name}
		<TagEditor
			{plugin}
			file={log.file}
			{task}
			noteTasks={tasks}
			onclose={closeTagEditor}
		/>
	{/if}
{/snippet}

{#snippet elapsedTime(task: Task)}
	{@const start = runningClockStart(task)}
	{#if start}
		{@const interruption = task.name === INTERRUPTION_TASK}
		<button
			class="elapsed"
			use:instantTooltip={() => [
				`Started ${formatTimeOfDay(start)} · ${formatHoursMinutes(taskMinutes(task, now))} today`,
				interruption
					? 'Click to set how long the interruption lasted'
					: 'Click to set how long the clock lasted',
				interruption ? null : controlHint(plugin, 'setDuration'),
			]}
			aria-label={interruption
				? 'Set duration of the interruption'
				: `Set clock duration of ${task.name}`}
			onclick={() =>
				void (interruption
					? setInterruptionDuration(plugin)
					: setDuration(plugin, task.name))}
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

{#snippet idleActions(task: Task)}
	<span class="row-actions">
		<button
			class="row-button"
			use:instantTooltip={() => [controlHint(plugin, rowStarts)]}
			aria-label={START_LABELS[rowStarts](task.name)}
			use:icon={startIcon(rowStarts)}
			onclick={() => start(task, rowStarts)}
		></button>
		<button
			class="row-button"
			use:instantTooltip={() => [
				controlHint(plugin, rowStarts === 'switch' ? 'switchAt' : 'startAt'),
			]}
			aria-label={`${START_LABELS[rowStarts](task.name)} at…`}
			use:icon={START_AT_ICON}
			onclick={() => void startTaskAt(plugin, taskChoice(task), rowStarts)}
		></button>
		{@render moreButton(task)}
	</span>
{/snippet}

<!-- A running task's checkbox stops it as it ticks it (Done). -->
{#snippet checkbox(task: Task, running = false)}
	{@const color = plugin.settings.taskColors[task.name]}
	<input
		type="checkbox"
		class="task-list-item-checkbox"
		class:has-task-color={color !== undefined}
		style:--task-color={color}
		use:instantTooltip={running
			? () => [controlHint(plugin, 'done')]
			: undefined}
		aria-label={running
			? `Done: stop and tick ${task.name}`
			: task.ticked
				? `Mark ${task.name} not done`
				: `Mark ${task.name} done`}
		checked={task.ticked}
		onchange={() =>
			running
				? stop([task.name], true)
				: void setTaskTicked(plugin, task.name, !task.ticked)}
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
			<ul class="overnight-clocks">
				{#each overnight.clocks as clock (`${clock.taskName} ${clock.start.valueOf()}`)}
					<li class="overnight-clock">
						<span class="overnight-what">
							<span class="overnight-name">{clock.taskName}</span>
							<span class="muted">since {formatTimeOfDay(clock.start)}</span>
						</span>
						<span class="overnight-actions">
							{#if clock.dayEnd}
								{@const dayEnd = clock.dayEnd}
								<button
									class="mod-cta"
									onclick={() =>
										void stopOvernightClock(
											plugin,
											earlier.file,
											clock,
											dayEnd
										)}
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
						</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<div class="doing">
		<TaskBar
			{plugin}
			{tasks}
			bind:mode={barMode}
			placeholders={otherDay
				? {
						start: `Add a task to ${otherDay}`,
						switch: `Add a task to ${otherDay}`,
						alongside: `Add a task running alongside to ${otherDay}`,
						plan: `Plan a task for ${otherDay}`,
					}
				: {
						start: 'Start a task…',
						switch: 'Switch to…',
						alongside: 'Start alongside…',
						plan: 'Plan a task…',
					}}
			noteHeading={noteDayHeading(log?.date ?? now, now)}
		/>
		<div class="buttons">
			<button
				class="interruption-button"
				class:is-active={interruptionActive}
				aria-pressed={interruptionActive}
				disabled={unavailable.interruption !== null}
				use:instantTooltip={interruptionHint}
				onclick={() => void toggleInterruption(plugin)}
			>
				<span use:icon={'pause'}></span>
				Interruption
			</button>
			<button
				disabled={unavailable.endDay !== null}
				use:instantTooltip={endDayHint}
				onclick={() => void endDay(plugin)}
			>
				<span use:icon={'sunset'}></span>
				End day
			</button>
		</div>
	</div>

	{#if duplicate}
		{@const task = duplicate}
		<div class="duplicate" role="alert">
			<p>
				<strong>{task.name}</strong> is listed twice in this note. Merge the two lines
				or rename one to track it again.
			</p>
			<button class="mod-cta" onclick={() => reveal(task)}>Go to task</button>
		</div>
	{:else if layout.running.length > 0}
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
						class:has-tag-editor={editingTags === task.name}
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
									? `Paused: ${paused.map((task) => task.name).join(', ')}. They resume when you end the interruption.`
									: undefined}
							>
								Interruption
							</span>
							{@render elapsedTime(task)}
							<span class="row-actions">
								<button
									class="row-button"
									aria-label="End interruption"
									use:instantTooltip={() => [
										controlHint(plugin, 'interruption'),
									]}
									use:icon={'square'}
									onclick={() => void toggleInterruption(plugin)}
								></button>
								<button
									class="row-button"
									aria-label="End interruption at…"
									use:instantTooltip
									use:icon={STOP_AT_ICON}
									onclick={() => void setInterruptionStop(plugin)}
								></button>
								{@render moreButton(task)}
							</span>
						{:else}
							{@render checkbox(task, true)}
							{@render tags(task)}
							{@render taskName(task)}
							{@render elapsedTime(task)}
							<span class="row-actions">
								<button
									class="row-button"
									aria-label={`Stop ${task.name}`}
									use:instantTooltip={() => [controlHint(plugin, 'stop')]}
									use:icon={'square'}
									onclick={() => stop([task.name], false)}
								></button>
								<button
									class="row-button"
									aria-label={`Stop ${task.name} at…`}
									use:instantTooltip={() => [controlHint(plugin, 'stopAt')]}
									use:icon={STOP_AT_ICON}
									onclick={() => stopAt(task)}
								></button>
								{@render moreButton(task)}
							</span>
							{@render tagEditor(task)}
							{@render bars(task)}
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if duplicate}
		<!-- The rows are keyed by name: listing a duplicate would crash. -->
	{:else if layout.open.length > 0 || layout.done.length > 0}
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
						class:has-tag-editor={editingTags === task.name}
						class:is-dragged={rowDrag?.name === task.name}
						class:drop-before={dropSide(task) === 'before'}
						class:drop-after={dropSide(task) === 'after'}
						in:motion.receive|global={{ key: task.name }}
						out:motion.send|global={{ key: task.name }}
						animate:motion.slide
					>
						{@render checkbox(task)}
						{@render tags(task)}
						{@render taskName(task, layout.open)}
						{#if paused.includes(task)}
							<span class="paused-label">paused</span>
						{/if}
						{#if minutes > 0}
							<span class="muted total">{formatHoursMinutes(minutes)}</span>
						{/if}
						{@render idleActions(task)}
						{@render tagEditor(task)}
						{@render bars(task)}
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
								class:has-tag-editor={editingTags === task.name}
								class:is-dragged={rowDrag?.name === task.name}
								class:drop-before={dropSide(task) === 'before'}
								class:drop-after={dropSide(task) === 'after'}
								in:motion.receive|global={{ key: task.name }}
								out:motion.send|global={{ key: task.name }}
								animate:motion.slide
							>
								{@render checkbox(task)}
								{@render tags(task)}
								{@render taskName(task, layout.done)}
								{#if minutes > 0}
									<span class="muted total">{formatHoursMinutes(minutes)}</span>
								{/if}
								{@render idleActions(task)}
								{@render tagEditor(task)}
								{@render bars(task)}
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

	.buttons button {
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

	/* Obsidian's own button hover barely shifts the background (white to
	   #fafafa in the light theme). An overlay darkens or lightens whatever
	   background the theme gives the button. */
	@media (hover: hover) {
		.buttons button:hover:enabled {
			cursor: pointer;
			background-image: linear-gradient(
				var(--background-modifier-hover),
				var(--background-modifier-hover)
			);
		}
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

	/*
	 * Running rows keep the plan rows' height, set apart by a background
	 * that reaches past the column: the negative margin cancels the padding,
	 * so the checkbox and the ⋯ button line up with the plan rows'.
	 */
	.row.running {
		--running-inset-start: 0.6em;
		--running-inset-end: 0.25em;
		padding: 0 var(--running-inset-end) 0 var(--running-inset-start);
		margin-inline: calc(-1 * var(--running-inset-start))
			calc(-1 * var(--running-inset-end));
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

	.overnight-clocks {
		display: flex;
		flex-direction: column;
		gap: 0.9em;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	/* Name on the left, its buttons on the right; in a narrow pane they wrap
	   under the name, closer to it than to the next clock. */
	.overnight-clock {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.3em 0.75em;
	}

	.overnight-what {
		display: flex;
		align-items: baseline;
		gap: 0.5em;
		min-width: 0;
	}

	.overnight-actions {
		display: flex;
		gap: 0.5em;
	}

	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 0.6em;
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

	/* Only while open, so the dragged row's copy keeps its fixed position. */
	.row.has-tag-editor {
		position: relative;
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

	/* Wide enough for one emoji, so names line up whatever the tags. */
	.tag-slot {
		all: unset;
		position: relative;
		cursor: pointer;
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 24px;
		border-radius: var(--radius-s);
		font-size: var(--font-ui-small);
	}

	.tag-slot:hover,
	.tag-slot.is-open {
		background: var(--background-modifier-hover);
	}

	.tag-slot:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	.tag-hash {
		display: inline-flex;
	}

	.tag-hash :global(svg) {
		width: 13px;
		height: 13px;
		stroke-width: 1.5;
	}

	/* Tagged without emojis reads normal; untagged is only an offer. */
	.tag-slot.is-untagged {
		color: var(--text-muted);
	}

	/* The badge anchors to the glyph, not the slot: the slot grows to a
	   finger-sized target on mobile and would carry the badge away from it. */
	.tag-emoji {
		position: relative;
		display: inline-flex;
		line-height: 1;
	}

	/* Over the emojis' corner, so the slot keeps one emoji's width. */
	.tag-badge {
		position: absolute;
		top: -8px;
		right: -7px;
		min-width: 12px;
		padding: 0 2px;
		border-radius: 6px;
		background: var(--background-modifier-border);
		color: var(--text-normal);
		font-size: 9px;
		font-weight: var(--font-semibold);
		line-height: 12px;
		text-align: center;
		pointer-events: none;
	}

	/* Thin with a mouse, finger-sized on mobile. */
	:global(body.is-mobile) .tag-slot {
		width: 36px;
		height: 36px;
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

	.duplicate {
		padding: 0.6em 0.75em;
		border: 1px solid rgba(var(--color-red-rgb), 0.5);
		border-radius: var(--radius-m);
		background: rgba(var(--color-red-rgb), 0.1);
	}

	.duplicate p {
		margin: 0 0 0.5em;
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
</style>
