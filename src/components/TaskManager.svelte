<script lang="ts">
	import { onMount } from 'svelte'
	import {
		filterTaskInfos,
		sortTaskInfos,
		TASK_TABLE_ROW_CAP,
		type TaskSortKey,
	} from 'core/taskManager'
	import { formatHoursMinutes, formatLocalDateTime } from 'core/time'
	import type { VaultTaskInfo } from 'core/vaultTaskIndex'
	import { openColorMenu } from 'ui/colorMenu'
	import type TaskTimeTracker from '../main'

	type Props = {
		plugin: TaskTimeTracker
	}

	const { plugin }: Props = $props()

	let infos = $state<VaultTaskInfo[] | null>(null)
	// Local mirror of the setting so the swatches re-render on change; the
	// one-time capture is fine, the plugin prop never changes.
	// svelte-ignore state_referenced_locally
	let taskColors = $state<Record<string, string>>({
		...plugin.settings.taskColors,
	})
	let query = $state('')
	let sortKey = $state<TaskSortKey>('usage')
	let ascending = $state(false)

	const HEADERS: { key: TaskSortKey; label: string; numeric?: boolean }[] = [
		{ key: 'name', label: 'Task' },
		{ key: 'usage', label: 'Notes', numeric: true },
		{ key: 'lastUsed', label: 'Last used' },
		{ key: 'total', label: 'Total', numeric: true },
	]

	const filtered = $derived(
		infos === null
			? null
			: sortTaskInfos(filterTaskInfos(infos, query), sortKey, ascending)
	)
	const rows = $derived(filtered?.slice(0, TASK_TABLE_ROW_CAP) ?? null)

	function setSort(key: TaskSortKey) {
		if (sortKey === key) {
			ascending = !ascending
		} else {
			sortKey = key
			ascending = key === 'name'
		}
	}

	function ariaSort(key: TaskSortKey): 'ascending' | 'descending' | undefined {
		if (sortKey !== key) return undefined
		return ascending ? 'ascending' : 'descending'
	}

	function lastUsedLabel(info: VaultTaskInfo): string {
		return formatLocalDateTime(info.lastUsed).split('T')[0]!
	}

	function setColor(name: string, color: string | null) {
		if (color === null) delete taskColors[name]
		else taskColors[name] = color
		plugin.settings.taskColors = { ...taskColors }
		void plugin.saveSettings()
	}

	async function load() {
		await plugin.vaultTasks.ensureBuilt()
		infos = plugin.vaultTasks.snapshot()
	}

	onMount(() => {
		void load()
		// Keep the table fresh while notes change (e.g. a tracked task stops).
		return plugin.dailyLogs.onChange(() => void load())
	})
</script>

<div class="toolbar">
	<input
		type="search"
		placeholder="Filter by name or tag…"
		bind:value={query}
	/>
	{#if filtered !== null && infos !== null && filtered.length !== infos.length}
		<span class="muted">{filtered.length} of {infos.length} tasks</span>
	{/if}
</div>

{#if rows === null}
	<p class="muted">Scanning vault tasks…</p>
{:else if rows.length === 0}
	<p class="muted">No task matches.</p>
{:else}
	<div class="table-wrapper">
		<table>
			<thead>
				<tr>
					<th class="swatch-cell"></th>
					{#each HEADERS as header (header.key)}
						<th class:numeric={header.numeric} aria-sort={ariaSort(header.key)}>
							<button class="header" onclick={() => setSort(header.key)}>
								{header.label}
								{#if sortKey === header.key}
									<span aria-hidden="true">{ascending ? '▲' : '▼'}</span>
								{/if}
							</button>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each rows as info (info.name)}
					<tr>
						<td class="swatch-cell">
							<button
								class="swatch"
								class:unset={taskColors[info.name] === undefined}
								style:background={taskColors[info.name] ?? 'transparent'}
								aria-label="Set color of {info.name}"
								onclick={(event) =>
									openColorMenu(event, taskColors[info.name], (color) =>
										setColor(info.name, color)
									)}
							></button>
						</td>
						<td>
							<span class="name">{info.name}</span>
							{#each info.tags as tag (tag)}
								<span class="tag">{tag}</span>
							{/each}
						</td>
						<td class="numeric">{info.noteCount}</td>
						<td class="nowrap">{lastUsedLabel(info)}</td>
						<td class="numeric">{formatHoursMinutes(info.totalMinutes)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	{#if filtered !== null && filtered.length > rows.length}
		<p class="muted">
			Showing {rows.length} of {filtered.length} tasks — refine the filter to see
			the rest.
		</p>
	{/if}
{/if}

<style>
	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.75em;
		margin-bottom: 0.75em;
	}

	.toolbar input {
		flex: 1;
	}

	.muted {
		color: var(--text-muted);
	}

	.table-wrapper {
		max-height: 60vh;
		overflow-y: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th {
		position: sticky;
		top: 0;
		background: var(--background-primary);
		text-align: left;
		border-bottom: 1px solid var(--background-modifier-border);
	}

	.header {
		all: unset;
		cursor: pointer;
		padding: 0.3em 0.5em;
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		font-weight: 600;
	}

	.header:hover {
		color: var(--text-accent-hover);
	}

	.header:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: -2px;
	}

	td {
		padding: 0.3em 0.5em;
		border-bottom: 1px solid var(--background-modifier-border);
	}

	td.numeric,
	th.numeric {
		text-align: right;
		padding: 0.3em 0.5em;
	}

	td.numeric,
	td.nowrap {
		white-space: nowrap;
	}

	.name {
		margin-right: 0.5em;
	}

	.swatch-cell {
		width: 1.6em;
	}

	.swatch {
		all: unset;
		cursor: pointer;
		display: inline-block;
		width: 1em;
		height: 1em;
		border-radius: 50%;
		border: 1px solid var(--background-modifier-border);
	}

	.swatch.unset {
		border-style: dashed;
	}

	.swatch:hover {
		border-color: var(--text-muted);
	}

	.swatch:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	.tag {
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
		margin-right: 0.35em;
	}
</style>
