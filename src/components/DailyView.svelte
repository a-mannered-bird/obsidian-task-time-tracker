<script lang="ts">
	import { Menu, type App, type TFile } from 'obsidian'
	import {
		DAY_END_COMMAND,
		runTimeCommand,
		DAY_START_COMMAND,
	} from 'commands/frontmatterTime'
	import { onMount } from 'svelte'
	import { controlHint, titleWithShortcut } from 'commands/shortcuts'
	import {
		createDailyNote,
		getAdjacentDailyNoteFile,
		getDailyNoteFile,
		getDailyNoteName,
		isSameDay,
		resolveTarget,
		type DailyTarget,
	} from 'core/dailyNotes'
	import type { DailyLog } from 'core/dailyLogs'
	import {
		describeDay,
		findOvernightClocks,
		type OvernightNote,
	} from 'core/overnight'
	import type { DailyViewTab } from '../settings'
	import { formatTimeOfDay } from 'core/timeline'
	import { icon } from 'ui/icon'
	import { instantTooltip } from 'ui/tooltip'
	import { openTaskManager } from 'ui/TaskManagerModal'
	import DailyStats from './DailyStats.svelte'
	import TimelineTab from './TimelineTab.svelte'
	import TrackerTab from './TrackerTab.svelte'
	import type TaskTimeTracker from '../main'

	type Props = {
		app: App
		plugin: TaskTimeTracker
	}

	const { app, plugin }: Props = $props()

	const TABS: { id: DailyViewTab; label: string }[] = [
		{ id: 'tracker', label: 'Tracker' },
		{ id: 'timeline', label: 'Timeline' },
		{ id: 'stats', label: 'Stats' },
	]

	// svelte-ignore state_referenced_locally -- deliberately only the initial value
	let active = $state<DailyViewTab>(plugin.settings.lastDailyViewTab)
	let target = $state<DailyTarget | null>(null)
	let log = $state<DailyLog | null>(null)
	let overnight = $state<OvernightNote | null>(null)
	let loading = $state(true)

	let trackerTab = $state<TrackerTab | null>(null)

	function select(tab: DailyViewTab) {
		if (tab !== active) trackerTab?.leave()
		active = tab
		plugin.settings.lastDailyViewTab = tab
		void plugin.saveSettings()
	}

	const dailyNotes = $derived(plugin.getDailyNotesConfig())
	const previousFile = $derived(
		target ? getAdjacentDailyNoteFile(app, dailyNotes, target.date, -1) : null
	)
	const nextFile = $derived(
		target ? getAdjacentDailyNoteFile(app, dailyNotes, target.date, 1) : null
	)
	/** Set while the note shown is not today's, which actions then write to. */
	const otherDay = $derived(
		target && !isSameDay(target.date, new Date())
			? describeDay(target.date, new Date())
			: null
	)

	let latestReload = 0

	async function reload() {
		// Reloads overlap (note changes, leaf changes); an older one finishing
		// last would show the note that was active when it started.
		const reloadId = ++latestReload
		const now = new Date()
		const next = resolveTarget(app, dailyNotes, now)
		const nextLog = next.file
			? await plugin.dailyLogs.loadFile(next.file)
			: null
		const nextOvernight = isSameDay(next.date, now)
			? await findOvernight(next.date, now)
			: null
		if (reloadId !== latestReload) return
		overnight = nextOvernight
		target = next
		log = nextLog
		loading = false
	}

	/** Clocks still running in the note before today's. */
	async function findOvernight(
		today: Date,
		now: Date
	): Promise<OvernightNote | null> {
		const file = getAdjacentDailyNoteFile(app, dailyNotes, today, -1)
		const earlier = file ? await plugin.dailyLogs.loadFile(file) : null
		if (!earlier) return null
		const clocks = findOvernightClocks(earlier.tasks, earlier.dayEnd, now)
		return clocks.length > 0 ? { log: earlier, clocks } : null
	}

	/** Opens the note in the workspace so the view and commands follow it. */
	async function openNote(file: TFile | null) {
		if (!file) return
		await app.workspace.getLeaf(false).openFile(file)
		await reload()
	}

	function openMoreMenu(event: MouseEvent) {
		const menu = new Menu()
		menu.addItem((item) =>
			item
				.setTitle(titleWithShortcut(plugin, 'Manage tasks', 'manageTasks'))
				.setIcon('list-todo')
				.onClick(() => openTaskManager(plugin))
		)
		menu.showAtMouseEvent(event)
	}

	async function openToday() {
		const today = new Date()
		const file =
			getDailyNoteFile(app, dailyNotes, today) ??
			(await createDailyNote(app, dailyNotes, today))
		await openNote(file)
	}

	onMount(() => {
		const unsubscribe = plugin.dailyLogs.onChange(() => void reload())
		const leafRef = app.workspace.on('active-leaf-change', () => void reload())
		// Restored at startup, the view mounts before the note leaves: the
		// active file is not known yet and would resolve to today's note.
		app.workspace.onLayoutReady(() => void reload())
		return () => {
			unsubscribe()
			app.workspace.offref(leafRef)
		}
	})
</script>

<div class="daily-view">
	<div class="note-nav">
		<button
			class="icon-button"
			aria-label="Previous daily note"
			use:instantTooltip
			use:icon={'chevron-left'}
			disabled={!previousFile}
			onclick={() => void openNote(previousFile)}
		></button>
		<span class="note-date">
			{target ? getDailyNoteName(dailyNotes, target.date) : ''}
		</span>
		<button
			class="icon-button"
			aria-label="Next daily note"
			use:instantTooltip
			use:icon={'chevron-right'}
			disabled={!nextFile}
			onclick={() => void openNote(nextFile)}
		></button>
		{#if target}
			<div class="day-status">
				<button
					class="day-time"
					class:is-reminder={!log?.dayStart && !otherDay}
					use:instantTooltip={() => controlHint(plugin, 'dayStart')}
					aria-label={log?.dayStart
						? `Start of day ${formatTimeOfDay(log.dayStart)}, change`
						: 'Set start of day'}
					onclick={() => void runTimeCommand(plugin, DAY_START_COMMAND)}
				>
					<span use:icon={'sunrise'}></span>
					{log?.dayStart ? formatTimeOfDay(log.dayStart) : 'Set start'}
				</button>
				<span aria-hidden="true">·</span>
				<button
					class="day-time"
					use:instantTooltip={() => controlHint(plugin, 'dayEnd')}
					aria-label={log?.dayEnd
						? `End of day ${formatTimeOfDay(log.dayEnd)}, change`
						: 'Set end of day'}
					onclick={() => void runTimeCommand(plugin, DAY_END_COMMAND)}
				>
					<span use:icon={'sunset'}></span>
					{log?.dayEnd ? formatTimeOfDay(log.dayEnd) : 'Set end'}
				</button>
			</div>
		{/if}
		<button
			class="icon-button more-button"
			aria-label="More actions"
			use:instantTooltip
			use:icon={'more-horizontal'}
			onclick={openMoreMenu}
		></button>
	</div>

	{#if otherDay}
		<div class="other-day" role="status">
			<span>You're viewing {otherDay}</span>
			<button class="back-to-today" onclick={() => void openToday()}>
				Back to today
			</button>
		</div>
	{/if}

	<div class="tabs" role="tablist">
		{#each TABS as tab (tab.id)}
			<button
				type="button"
				role="tab"
				aria-selected={active === tab.id}
				class:active={active === tab.id}
				onclick={() => select(tab.id)}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	<div class="tab-panel" role="tabpanel">
		{#if active === 'tracker'}
			<TrackerTab
				bind:this={trackerTab}
				{plugin}
				{log}
				{overnight}
				{otherDay}
				{loading}
			/>
		{:else if active === 'timeline'}
			<TimelineTab {plugin} {log} {loading} />
		{:else}
			<DailyStats {plugin} {log} {loading} />
		{/if}
	</div>
</div>

<style>
	/* The tab content scrolls under the note navigation and the tabs. */
	.daily-view {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	/*
	 * Obsidian's scrollbars overlay the content instead of taking width, so
	 * the panel reaches into the view's right padding: its scrollbar lands
	 * there, as the view's own did, rather than over the timeline toolbar.
	 */
	.tab-panel {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		margin-right: calc(-1 * var(--size-4-3));
		padding-right: var(--size-4-3);
	}

	.note-nav {
		display: flex;
		align-items: center;
		gap: 0.4em;
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}

	/* Same-width digits, so the arrows stay put while browsing days. */
	.note-date {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.icon-button {
		all: unset;
		cursor: pointer;
		display: inline-flex;
		color: var(--text-muted);
	}

	.icon-button:hover:enabled {
		color: var(--text-normal);
	}

	.icon-button:disabled {
		color: var(--text-faint);
		cursor: default;
	}

	.icon-button:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	/* Pushed to the right, next to the menu button; the menu button stays
	   right-aligned when there is no note. */
	.day-status,
	.more-button {
		margin-left: auto;
	}

	.day-status + .more-button {
		margin-left: 0;
	}

	.day-status {
		display: flex;
		align-items: center;
		gap: 0.3em;
		color: var(--text-faint);
	}

	.day-time {
		all: unset;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		padding: 0.1em 0.25em;
		border-radius: var(--radius-s);
		color: var(--text-muted);
		white-space: nowrap;
	}

	.day-time:hover {
		background: var(--background-modifier-hover);
		color: var(--text-normal);
	}

	.day-time:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	.day-time.is-reminder {
		color: var(--text-accent);
	}

	.day-time :global(svg) {
		width: var(--icon-xs);
		height: var(--icon-xs);
	}

	.other-day {
		display: flex;
		align-items: center;
		gap: 0.5em;
		margin-top: 0.5em;
		padding: 0.4em 0.6em;
		border-radius: var(--radius-s);
		background: var(--background-modifier-hover);
		font-size: var(--font-ui-smaller);
	}

	.back-to-today {
		all: unset;
		cursor: pointer;
		margin-left: auto;
		color: var(--text-accent);
		font-weight: var(--font-semibold);
	}

	.back-to-today:hover {
		text-decoration: underline;
	}

	.back-to-today:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	.tabs {
		display: flex;
		gap: 1.25em;
		margin-bottom: 1em;
		border-bottom: 1px solid var(--background-modifier-border);
	}

	.tabs button {
		all: unset;
		cursor: pointer;
		color: var(--text-faint);
		font-size: var(--font-ui-medium);
		padding: 0.4em 0.1em;
		margin-bottom: -1px;
		border-bottom: 2px solid transparent;
	}

	.tabs button:hover {
		color: var(--text-muted);
	}

	.tabs button:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	.tabs button.active {
		color: var(--text-normal);
		font-weight: var(--font-semibold);
		border-bottom-color: var(--interactive-accent);
	}
</style>
