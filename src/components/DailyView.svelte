<script lang="ts">
	import type { App } from 'obsidian'
	import type { DailyViewTab } from '../settings'
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

	let active = $state<DailyViewTab>(plugin.settings.lastDailyViewTab)

	function select(tab: DailyViewTab) {
		active = tab
		plugin.settings.lastDailyViewTab = tab
		void plugin.saveSettings()
	}
</script>

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
	<TrackerTab {app} {plugin} />
{:else}
	<DailyStats {app} {plugin} />
{/if}

<style>
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
