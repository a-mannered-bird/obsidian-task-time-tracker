<script lang="ts">
	import { onMount, tick } from 'svelte'
	import { openNoteAtLine } from 'commands/taskActions'
	import { retimeClockLine } from 'commands/timelineEdits'
	import type { DailyLog } from 'core/dailyLogs'
	import { tagEmoji } from 'core/taskPicker'
	import {
		blockId,
		blockLabel,
		canDrag,
		clampZoom,
		dragTimes,
		fitRange,
		formatTimeOfDay,
		initialScrollTime,
		layoutBlocks,
		magnetsFor,
		nudgeTimes,
		sameTaskOverlaps,
		sameTimes,
		snapStepMinutes,
		timelineAxis,
		timelineBlocks,
		ZOOM_MAX,
		ZOOM_MIN,
		type DragEdge,
		type TimelineBlock,
	} from 'core/timeline'
	import type { ClockKey, ClockTimes } from 'types/tasks'
	import { icon } from 'ui/icon'
	import type TaskTimeTracker from '../main'

	type Props = {
		plugin: TaskTimeTracker
		log: DailyLog | null
		loading: boolean
	}

	const { plugin, log, loading }: Props = $props()

	const HOUR = 60 * 60 * 1000
	/** Movement before a press becomes a drag, so a click stays a click. */
	const DRAG_THRESHOLD_PX = 4
	/** Finger movement before the long press that means "scroll" instead. */
	const SCROLL_SLOP_PX = 8
	const LONG_PRESS_MS = 400
	const MAGNET_PX = 8
	const ZOOM_BUTTON_FACTOR = 1.5
	const NUDGE_SETTLE_MS = 600
	const ZOOM_SAVE_MS = 500

	let now = $state(new Date())
	// svelte-ignore state_referenced_locally -- deliberately only the initial value
	let zoom = $state(clampZoom(plugin.settings.timelineZoom))
	/** Times shown for a block whose write is under way, until the note reloads. */
	let pending = $state<{ id: string; times: ClockTimes } | null>(null)
	/** Where the block being dragged would land. */
	let ghost = $state<{ id: string; times: ClockTimes } | null>(null)
	/** Block chosen by a long press on touch screens; its edges grow. */
	let selectedId = $state<string | null>(null)

	let canvas = $state<HTMLElement>()
	let toolbar = $state<HTMLElement>()
	let scroller: HTMLElement | null = null
	let scrolledFor: string | null = null
	let focusAfterReload: string | null = null
	let zoomSaveTimer = 0

	type Press = {
		block: TimelineBlock
		edge: DragEdge
		pointerId: number
		x0: number
		y0: number
		touch: boolean
		/** Movement now drags: a mouse, or a finger after the long press. */
		armed: boolean
		longPressed: boolean
		active: boolean
		timer: number
	}
	let press: Press | null = null

	type Nudge = { id: string; key: ClockKey; times: ClockTimes; timer: number }
	let nudge: Nudge | null = null

	const blocks = $derived(log ? timelineBlocks(log.tasks, now) : [])
	const shown = $derived(
		blocks.map((block) =>
			pending?.id === block.id
				? {
						...block,
						start: pending.times.start,
						end: pending.times.end ?? now,
					}
				: block
		)
	)
	const layout = $derived(layoutBlocks(shown))
	const overlapping = $derived(sameTaskOverlaps(shown))
	const axis = $derived(
		log
			? timelineAxis(log.date, [
					...shown.flatMap((block) => [block.start, block.end]),
					...[log.wakeTime, log.bedTime].filter((date) => date !== null),
				])
			: null
	)
	const hours = $derived.by(() => {
		if (!axis) return []
		const list: Date[] = []
		for (let t = axis.start.valueOf(); t <= axis.end.valueOf(); t += HOUR) {
			list.push(new Date(t))
		}
		return list
	})

	// Only colors chosen in settings: the stats cycle assigns colors by rank of
	// time worked, so a block would change color while its clock is dragged.
	function blockColor(taskName: string): string {
		return plugin.settings.taskColors[taskName] ?? 'var(--interactive-accent)'
	}

	function y(date: Date): number {
		return axis ? ((date.valueOf() - axis.start.valueOf()) / HOUR) * zoom : 0
	}

	function inAxis(date: Date) {
		return Boolean(axis && date >= axis.start && date <= axis.end)
	}

	function timesOf(block: TimelineBlock): ClockTimes {
		return pending?.id === block.id
			? pending.times
			: { start: block.key.start, end: block.key.end }
	}

	function keyOf(block: TimelineBlock): ClockKey {
		return { taskName: block.key.taskName, ...timesOf(block) }
	}

	function nameOf(block: TimelineBlock): string {
		const emoji = tagEmoji(block.tags, plugin.settings.tagMappings)
		return emoji ? `${emoji} ${block.key.taskName}` : block.key.taskName
	}

	function ariaLabel(block: TimelineBlock): string {
		const end = block.running ? 'now' : formatTimeOfDay(block.end)
		return `${block.key.taskName}, ${formatTimeOfDay(block.start)} to ${end}`
	}

	function tooltip(block: TimelineBlock): string {
		const { range, duration } = blockLabel(block)
		return `${nameOf(block)}\n${range} · ${duration}`
	}

	/** Position on the axis, pinned to its ends for times beyond them. */
	function yOnAxis(date: Date): number {
		return axis ? Math.min(Math.max(y(date), 0), y(axis.end)) : 0
	}

	/**
	 * A running clock of an older note ends far past the axis; only its
	 * start, the edge being edited, has to stay on it.
	 */
	function fitsInAxis(times: ClockTimes): boolean {
		if (!axis || times.start < axis.start) return false
		return times.end ? times.end <= axis.end : times.start <= axis.end
	}

	// ----- writing -----

	async function write(id: string, key: ClockKey, times: ClockTimes) {
		if (!log || sameTimes(key, times)) {
			if (pending?.id === id) pending = null
			return
		}
		pending = { id, times }
		const written = await retimeClockLine(plugin, log.file, key, times)
		if (!written && pending?.id === id) pending = null
	}

	// ----- pointer -----

	function onPointerDown(
		event: PointerEvent,
		block: TimelineBlock,
		edge: DragEdge
	) {
		if (event.button !== 0 || !log) return
		event.stopPropagation()
		flushNudge()
		const touch = event.pointerType === 'touch'
		const current: Press = {
			block,
			edge,
			pointerId: event.pointerId,
			x0: event.clientX,
			y0: event.clientY,
			touch,
			armed: !touch || selectedId === block.id,
			longPressed: false,
			active: false,
			timer: 0,
		}
		if (!current.armed) {
			current.timer = window.setTimeout(() => {
				current.armed = true
				current.longPressed = true
				selectedId = block.id
				navigator.vibrate?.(15)
			}, LONG_PRESS_MS)
		}
		press = current
	}

	function onPointerMove(event: PointerEvent) {
		const current = press
		if (!current || event.pointerId !== current.pointerId) return
		const dx = event.clientX - current.x0
		const dy = event.clientY - current.y0
		if (!current.active) {
			if (!current.armed) {
				if (Math.hypot(dx, dy) > SCROLL_SLOP_PX) endPress()
				return
			}
			if (Math.abs(dy) < DRAG_THRESHOLD_PX) return
			if (!canDrag(current.block, current.edge)) return
			current.active = true
		}
		const { block } = current
		const times = dragTimes(timesOf(block), current.edge, (dy / zoom) * HOUR, {
			stepMinutes: snapStepMinutes(zoom),
			magnets: magnetsFor(shown, block.id, [
				now,
				log?.wakeTime ?? null,
				log?.bedTime ?? null,
			]),
			magnetMs: (MAGNET_PX / zoom) * HOUR,
			free: event.altKey,
			now,
		})
		if (fitsInAxis(times)) ghost = { id: block.id, times }
	}

	function onPointerUp(event: PointerEvent) {
		const current = press
		if (!current || event.pointerId !== current.pointerId) return
		endPress()
		if (current.active) {
			const landed = ghost
			ghost = null
			if (landed) void write(landed.id, keyOf(current.block), landed.times)
		} else if (!current.longPressed) {
			jumpTo(current.block)
		}
	}

	function endPress() {
		if (press) window.clearTimeout(press.timer)
		press = null
	}

	function cancelDrag() {
		endPress()
		ghost = null
	}

	// ----- keyboard -----

	function onKeyDown(event: KeyboardEvent, block: TimelineBlock) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault()
			flushNudge()
			jumpTo(block)
			return
		}
		if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
		event.preventDefault()
		const edge: DragEdge = event.shiftKey
			? 'end'
			: event.altKey
				? 'start'
				: 'move'
		if (!canDrag(block, edge)) return
		if (nudge && nudge.id !== block.id) flushNudge()
		const direction = event.key === 'ArrowUp' ? -1 : 1
		const base = nudge?.times ?? timesOf(block)
		const times = nudgeTimes(base, edge, direction, snapStepMinutes(zoom), now)
		if (!fitsInAxis(times)) return
		nudge ??= { id: block.id, key: keyOf(block), times, timer: 0 }
		nudge.times = times
		pending = { id: block.id, times }
		window.clearTimeout(nudge.timer)
		nudge.timer = window.setTimeout(flushNudge, NUDGE_SETTLE_MS)
	}

	/** Write the arrow-key moves of a block once the keys settle. */
	function flushNudge() {
		const current = nudge
		if (!current) return
		nudge = null
		window.clearTimeout(current.timer)
		focusAfterReload = blockId(current.key.taskName, current.times.start)
		void write(current.id, current.key, current.times)
	}

	function jumpTo(block: TimelineBlock) {
		if (log) void openNoteAtLine(plugin, log.file.path, block.lineIndex)
	}

	// ----- zoom and scroll -----

	function findScroller(element: HTMLElement): HTMLElement {
		for (let node = element.parentElement; node; node = node.parentElement) {
			const { overflowY } = getComputedStyle(node)
			if (overflowY === 'auto' || overflowY === 'scroll') return node
		}
		return document.documentElement
	}

	function toolbarHeight() {
		return toolbar?.offsetHeight ?? 0
	}

	/** Scroll so that `date` sits a quarter down the visible timeline. */
	function scrollToTime(date: Date, fraction = 0.25) {
		if (!scroller || !canvas) return
		const visible = scroller.clientHeight - toolbarHeight()
		const canvasTop =
			canvas.getBoundingClientRect().top -
			scroller.getBoundingClientRect().top +
			scroller.scrollTop
		scroller.scrollTop =
			canvasTop + y(date) - toolbarHeight() - visible * fraction
	}

	/** Zoom keeping the time under `clientY` where it is on screen. */
	async function setZoom(next: number, clientY: number) {
		const clamped = clampZoom(next)
		if (!canvas || !scroller || clamped === zoom) return
		const offset = clientY - canvas.getBoundingClientRect().top
		const ratio = clamped / zoom
		zoom = clamped
		await tick()
		// Set, not add: Chromium's scroll anchoring has already shifted
		// scrollTop during the re-layout, so an increment lands off target.
		const canvasTop =
			canvas.getBoundingClientRect().top -
			scroller.getBoundingClientRect().top +
			scroller.scrollTop
		scroller.scrollTop =
			canvasTop +
			offset * ratio -
			(clientY - scroller.getBoundingClientRect().top)
		saveZoomSoon()
	}

	function zoomBy(factor: number) {
		if (!scroller) return
		const rect = scroller.getBoundingClientRect()
		const middle =
			rect.top + toolbarHeight() + (rect.height - toolbarHeight()) / 2
		void setZoom(zoom * factor, middle)
	}

	async function fit() {
		if (!log || !scroller) return
		const range = fitRange(log.wakeTime, log.bedTime, shown)
		if (!range || !axis) return
		const end = Math.min(range.end.valueOf(), axis.end.valueOf())
		const visible = scroller.clientHeight - toolbarHeight()
		const hoursShown = (end - range.start.valueOf()) / HOUR
		zoom = clampZoom(visible / hoursShown)
		saveZoomSoon()
		await tick()
		scrollToTime(range.start, 0)
	}

	function saveZoomSoon() {
		window.clearTimeout(zoomSaveTimer)
		zoomSaveTimer = window.setTimeout(() => {
			plugin.settings.timelineZoom = zoom
			void plugin.saveSettings()
		}, ZOOM_SAVE_MS)
	}

	function onWheel(event: WheelEvent) {
		// Trackpad pinches arrive as wheel events with ctrlKey set.
		if (!event.ctrlKey && !event.metaKey) return
		event.preventDefault()
		void setZoom(zoom * Math.exp(-event.deltaY * 0.01), event.clientY)
	}

	function onTouchMove(event: TouchEvent) {
		// Once a finger holds a block, its moves drag instead of scrolling.
		if (press?.touch && press.armed && event.cancelable) event.preventDefault()
	}

	function onKeyUpWindow(event: KeyboardEvent) {
		if (event.key === 'Escape' && press?.active) cancelDrag()
	}

	// ----- effects -----

	$effect(() => {
		void log
		now = new Date()
		pending = null
	})

	// Open each note at its interesting part, not wherever the last one was.
	$effect(() => {
		if (!log || !canvas) return
		const path = log.file.path
		if (scrolledFor === path) return
		scrolledFor = path
		const target = initialScrollTime(log.date, new Date(), log.wakeTime, blocks)
		if (target) void tick().then(() => scrollToTime(target))
	})

	// Arrow keys rewrite the block's id (its start); keep the focus on it.
	$effect(() => {
		void blocks
		const id = focusAfterReload
		if (!id || !canvas) return
		void tick().then(() => {
			const element = Array.from(
				canvas?.querySelectorAll<HTMLElement>('[data-block-id]') ?? []
			).find((el) => el.dataset.blockId === id)
			if (element) {
				focusAfterReload = null
				element.focus()
			}
		})
	})

	onMount(() => {
		const timer = window.setInterval(() => (now = new Date()), 60 * 1000)
		window.addEventListener('pointermove', onPointerMove)
		window.addEventListener('pointerup', onPointerUp)
		window.addEventListener('pointercancel', cancelDrag)
		window.addEventListener('keyup', onKeyUpWindow)
		return () => {
			window.clearInterval(timer)
			window.clearTimeout(zoomSaveTimer)
			window.removeEventListener('pointermove', onPointerMove)
			window.removeEventListener('pointerup', onPointerUp)
			window.removeEventListener('pointercancel', cancelDrag)
			window.removeEventListener('keyup', onKeyUpWindow)
			endPress()
			flushNudge()
		}
	})

	$effect(() => {
		const element = canvas
		if (!element) return
		scroller = findScroller(element)
		// Not through Svelte attributes: those make touchmove passive, and
		// both handlers must be able to cancel the browser's own gesture.
		element.addEventListener('wheel', onWheel, { passive: false })
		element.addEventListener('touchmove', onTouchMove, { passive: false })
		return () => {
			element.removeEventListener('wheel', onWheel)
			element.removeEventListener('touchmove', onTouchMove)
		}
	})
</script>

{#snippet content(block: TimelineBlock, height: number)}
	{#if height >= 16}
		<span class="block-name">{nameOf(block)}</span>
	{/if}
	{#if height >= 32}
		{@const label = blockLabel(block)}
		<span class="block-times">
			{label.range}{#if height >= 48}{' · '}{label.duration}{/if}
		</span>
	{/if}
{/snippet}

{#if loading}
	<p class="muted">Loading…</p>
{:else if !log || !axis}
	<p class="muted">No daily note to show.</p>
{:else}
	<div class="timeline-toolbar" bind:this={toolbar}>
		<button
			class="clickable-icon"
			aria-label="Zoom out"
			use:icon={'zoom-out'}
			disabled={zoom <= ZOOM_MIN}
			onclick={() => zoomBy(1 / ZOOM_BUTTON_FACTOR)}
		></button>
		<button
			class="clickable-icon"
			aria-label="Zoom in"
			use:icon={'zoom-in'}
			disabled={zoom >= ZOOM_MAX}
			onclick={() => zoomBy(ZOOM_BUTTON_FACTOR)}
		></button>
		<button
			class="clickable-icon"
			aria-label="Fit the day"
			use:icon={'fold-vertical'}
			disabled={!fitRange(log.wakeTime, log.bedTime, shown)}
			onclick={() => void fit()}
		></button>
	</div>

	<!-- svelte-ignore a11y_no_static_element_interactions -- background press only clears the touch selection -->
	<div
		class="timeline"
		style:height="{y(axis.end)}px"
		bind:this={canvas}
		onpointerdown={() => (selectedId = null)}
	>
		{#if log.wakeTime && log.bedTime && log.bedTime > log.wakeTime}
			<div
				class="awake"
				style:top="{y(log.wakeTime)}px"
				style:height="{y(log.bedTime) - y(log.wakeTime)}px"
			></div>
		{/if}

		{#each hours as hour (hour.valueOf())}
			<div
				class="hour"
				class:midnight={hour.getHours() === 0}
				style:top="{y(hour)}px"
			>
				<span class="hour-label">{formatTimeOfDay(hour)}</span>
			</div>
		{/each}

		{#if log.wakeTime && inAxis(log.wakeTime)}
			<div class="mark wake" style:top="{y(log.wakeTime)}px">
				<span>Wake</span>
			</div>
		{/if}
		{#if log.bedTime && inAxis(log.bedTime)}
			<div class="mark bed" style:top="{y(log.bedTime)}px">
				<span>Bed</span>
			</div>
		{/if}
		{#if inAxis(now)}
			<div class="mark now" style:top="{y(now)}px"></div>
		{/if}

		<div class="lanes">
			{#each shown as block (block.id)}
				{@const place = layout.get(block.id)}
				{@const top = yOnAxis(block.start)}
				{@const height = Math.max(2, yOnAxis(block.end) - top)}
				{#if place}
					<div
						class="block"
						class:running={block.running}
						class:overlap={overlapping.has(block.id)}
						class:selected={selectedId === block.id}
						class:dragged={ghost?.id === block.id}
						role="button"
						tabindex="0"
						data-block-id={block.id}
						aria-label={ariaLabel(block)}
						title={tooltip(block)}
						style:--block-color={blockColor(block.key.taskName)}
						style:top="{top}px"
						style:height="{height}px"
						style:left="{(place.column / place.columns) * 100}%"
						style:width="{(place.span / place.columns) * 100}%"
						onpointerdown={(event) => onPointerDown(event, block, 'move')}
						onkeydown={(event) => onKeyDown(event, block)}
					>
						<div
							class="handle handle-start"
							aria-hidden="true"
							onpointerdown={(event) => onPointerDown(event, block, 'start')}
						></div>
						{@render content(block, height)}
						{#if canDrag(block, 'end')}
							<div
								class="handle handle-end"
								aria-hidden="true"
								onpointerdown={(event) => onPointerDown(event, block, 'end')}
							></div>
						{/if}
					</div>
					{#if ghost?.id === block.id}
						{@const ghostTop = yOnAxis(ghost.times.start)}
						{@const ghostHeight = yOnAxis(ghost.times.end ?? now) - ghostTop}
						<div
							class="block ghost"
							aria-hidden="true"
							style:--block-color={blockColor(block.key.taskName)}
							style:top="{ghostTop}px"
							style:height="{ghostHeight}px"
							style:left="{(place.column / place.columns) * 100}%"
							style:width="{(place.span / place.columns) * 100}%"
						>
							<span class="block-name">{nameOf(block)}</span>
							<span class="block-times">
								{blockLabel({
									...block,
									start: ghost.times.start,
									end: ghost.times.end ?? now,
								}).range}
							</span>
						</div>
					{/if}
				{/if}
			{/each}
		</div>
	</div>
{/if}

<style>
	.muted {
		color: var(--text-muted);
	}

	.timeline-toolbar {
		position: sticky;
		top: 0;
		z-index: 4;
		display: flex;
		justify-content: flex-end;
		gap: 0.25em;
		padding: 0.25em 0;
		background: var(--background-primary);
	}

	:global(.mod-sidedock) .timeline-toolbar {
		background: var(--background-secondary);
	}

	.timeline {
		--gutter: 3.4em;
		position: relative;
		margin: 0.6em 0 1em;
		font-size: var(--font-ui-smaller);
	}

	.awake {
		position: absolute;
		left: var(--gutter);
		right: 0;
		background: var(--background-modifier-hover);
	}

	.hour {
		position: absolute;
		left: var(--gutter);
		right: 0;
		border-top: 1px solid var(--background-modifier-border);
	}

	.hour.midnight {
		border-top: 2px solid var(--text-faint);
	}

	.hour-label {
		position: absolute;
		right: calc(100% + 0.4em);
		transform: translateY(-50%);
		color: var(--text-faint);
		font-variant-numeric: tabular-nums;
	}

	.mark {
		position: absolute;
		left: var(--gutter);
		right: 0;
		z-index: 2;
		pointer-events: none;
	}

	.mark span {
		position: absolute;
		right: 0;
		transform: translateY(-100%);
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}

	.mark.wake,
	.mark.bed {
		border-top: 1px dashed var(--text-muted);
	}

	.mark.now {
		border-top: 2px solid var(--color-red);
	}

	.lanes {
		position: absolute;
		top: 0;
		bottom: 0;
		left: var(--gutter);
		right: 0;
	}

	.block {
		position: absolute;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		padding: 0 0.4em;
		border: 1px solid var(--background-primary);
		border-left: 3px solid var(--block-color);
		border-radius: var(--radius-s);
		background: color-mix(
			in srgb,
			var(--block-color) 25%,
			var(--background-primary)
		);
		color: var(--text-normal);
		cursor: grab;
		user-select: none;
		-webkit-user-select: none;
		touch-action: pan-y;
		z-index: 1;
	}

	.block:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 1px;
		z-index: 3;
	}

	.block.overlap {
		outline: 2px dashed var(--text-warning);
		outline-offset: -2px;
	}

	.block.running {
		border-bottom: 2px dashed var(--block-color);
		animation: running-pulse 2s ease-in-out infinite;
	}

	@keyframes running-pulse {
		50% {
			background: color-mix(
				in srgb,
				var(--block-color) 40%,
				var(--background-primary)
			);
		}
	}

	.block.dragged {
		opacity: 0.4;
	}

	.block.selected {
		touch-action: none;
		box-shadow: 0 0 0 2px var(--interactive-accent);
		z-index: 3;
	}

	.block.ghost {
		z-index: 5;
		pointer-events: none;
		box-shadow: var(--shadow-s);
		background: color-mix(
			in srgb,
			var(--block-color) 45%,
			var(--background-primary)
		);
	}

	.block-name,
	.block-times {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		line-height: 16px;
	}

	.block-name {
		font-weight: var(--font-semibold);
	}

	.block-times {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	.handle {
		position: absolute;
		left: 0;
		right: 0;
		height: 6px;
		cursor: ns-resize;
		z-index: 1;
	}

	.handle-start {
		top: 0;
	}

	.handle-end {
		bottom: 0;
	}

	.block.selected .handle {
		height: 18px;
		background: color-mix(in srgb, var(--interactive-accent) 25%, transparent);
	}
</style>
