<script lang="ts">
	import { moment, type App, type TFile } from 'obsidian'
	import { onMount } from 'svelte'
	import {
		createDailyNote,
		getAdjacentDailyNoteFile,
		getDailyNoteFile,
		resolveTargetFile,
	} from 'core/dailyNotes'
	import type { DailyLog } from 'core/dailyLogs'
	import type { DailyViewTab } from '../settings'
	import { icon } from 'ui/icon'
	import DailyStats from './DailyStats.svelte'
	import TrackerTab from './TrackerTab.svelte'
	import type TaskTimeTracker from '../main'

	type Props = {
		app: App
		plugin: TaskTimeTracker
	}

	const { app, plugin }: Props = $props()

	const TABS: { id: DailyViewTab; label: string }[] = [
		{ id: 'tracker', label: 'Tracker' },
		{ id: 'stats', label: 'Stats' },
	]

	// svelte-ignore state_referenced_locally -- deliberately only the initial value
	let active = $state<DailyViewTab>(plugin.settings.lastDailyViewTab)
	let log = $state<DailyLog | null>(null)
	let loading = $state(true)

	function select(tab: DailyViewTab) {
		active = tab
		plugin.settings.lastDailyViewTab = tab
		void plugin.saveSettings()
	}

	const dailyNotes = $derived(plugin.getDailyLogStoreConfig().dailyNotes)
	const previousFile = $derived(
		log ? getAdjacentDailyNoteFile(app, dailyNotes, log.date, -1) : null
	)
	const nextFile = $derived(
		log ? getAdjacentDailyNoteFile(app, dailyNotes, log.date, 1) : null
	)

	async function reload() {
		const file = resolveTargetFile(app, dailyNotes)
		log = file ? await plugin.dailyLogs.loadFile(file) : null
		loading = false
	}

	/** Opens the note in the workspace so the view and commands follow it. */
	async function openNote(file: TFile | null) {
		if (!file) return
		await app.workspace.getLeaf(false).openFile(file)
		await reload()
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
		void reload()
		return () => {
			unsubscribe()
			app.workspace.offref(leafRef)
		}
	})
</script>

<div class="note-nav">
	<button
		class="icon-button"
		aria-label="Previous daily note"
		use:icon={'chevron-left'}
		disabled={!previousFile}
		onclick={() => void openNote(previousFile)}
	></button>
	<span class="note-date">
		{log ? moment(log.date).format('dddd, LL') : 'No daily note'}
	</span>
	<button
		class="icon-button"
		aria-label="Next daily note"
		use:icon={'chevron-right'}
		disabled={!nextFile}
		onclick={() => void openNote(nextFile)}
	></button>
	<button class="today-button" onclick={() => void openToday()}> Today </button>
</div>

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

{#if active === 'tracker'}
	<TrackerTab {plugin} {log} {loading} />
{:else}
	<DailyStats {plugin} {log} {loading} />
{/if}

<style>
	.note-nav {
		display: flex;
		align-items: center;
		gap: 0.4em;
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
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

	.icon-button:focus-visible,
	.today-button:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	.today-button {
		all: unset;
		cursor: pointer;
		margin-left: auto;
		color: var(--text-muted);
	}

	.today-button:hover {
		color: var(--text-normal);
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
