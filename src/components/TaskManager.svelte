<script lang="ts">
	import { Menu, type IconName } from 'obsidian'
	import { onMount } from 'svelte'
	import {
		changeTags,
		deleteTasks,
		joinOverlappingClocks,
		mergeTasks,
		openNoteAtLine,
		renameTask,
	} from 'commands/taskActions'
	import {
		describeIssue,
		detectIssues,
		ISSUE_TITLES,
		issueKey,
		issuesByTask,
		visibleIssues,
		type IssueKind,
		type TaskIssue,
	} from 'core/issues'
	import {
		filterTaskInfos,
		sortTaskInfos,
		TASK_TABLE_ROW_CAP,
		type TaskSortKey,
	} from 'core/taskManager'
	import { formatHoursMinutes, formatLocalDateTime } from 'core/time'
	import type { VaultTaskInfo } from 'core/vaultTaskIndex'
	import { openColorMenu } from 'ui/colorMenu'
	import { icon } from 'ui/icon'
	import type TaskTimeTracker from '../main'

	type Props = {
		plugin: TaskTimeTracker
		/** Close the hosting modal (after navigating to a note). */
		close: () => void
	}

	const { plugin, close }: Props = $props()

	let infos = $state<VaultTaskInfo[] | null>(null)
	// Local mirrors of the settings so the rows re-render on change; the
	// one-time captures are fine, the plugin prop never changes.
	// svelte-ignore state_referenced_locally
	let taskColors = $state<Record<string, string>>({
		...plugin.settings.taskColors,
	})
	// svelte-ignore state_referenced_locally
	let hiddenTasks = $state<string[]>([...plugin.settings.hiddenTasks])
	/** Detected issues per task name, refreshed with the table. */
	let issues = $state<Map<string, TaskIssue[]>>(new Map())
	let query = $state('')
	let hiddenOnly = $state(false)
	let issuesOnly = $state(false)
	let sortKey = $state<TaskSortKey>('usage')
	let ascending = $state(false)
	/** Names ticked for a bulk action. */
	let selected = $state<string[]>([])
	/** Row of the last plain click, the anchor of a shift-click range. */
	let anchor = $state<string | null>(null)
	let busy = $state(false)

	const HEADERS: { key: TaskSortKey; label: string; numeric?: boolean }[] = [
		{ key: 'name', label: 'Task' },
		{ key: 'usage', label: 'Notes', numeric: true },
		{ key: 'lastUsed', label: 'Last used' },
		{ key: 'total', label: 'Total', numeric: true },
	]

	const filtered = $derived.by(() => {
		if (infos === null) return null
		const matching = filterTaskInfos(infos, query).filter(
			(info) =>
				(!hiddenOnly || isHidden(info.name)) &&
				(!issuesOnly || issues.has(info.name))
		)
		return sortTaskInfos(matching, sortKey, ascending)
	})
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

	function isHidden(name: string): boolean {
		return hiddenTasks.includes(name)
	}

	const allSelected = $derived(
		filtered !== null &&
			filtered.length > 0 &&
			filtered.every((info) => selected.includes(info.name))
	)
	const someSelected = $derived(selected.length > 0 && !allSelected)
	const selectedHidden = $derived(
		selected.length > 0 && selected.every((name) => isHidden(name))
	)

	function isSelected(name: string): boolean {
		return selected.includes(name)
	}

	/**
	 * Tick or untick a row; with shift, tick every row between the last
	 * plain click and this one (in the current order of the table).
	 */
	function toggleSelected(name: string, shift: boolean) {
		if (shift && anchor !== null && rows) {
			const names = rows.map((info) => info.name)
			const [from, to] = [names.indexOf(anchor), names.indexOf(name)]
			if (from !== -1 && to !== -1) {
				const range = names.slice(Math.min(from, to), Math.max(from, to) + 1)
				selected = [...new Set([...selected, ...range])]
				return
			}
		}
		anchor = name
		selected = isSelected(name)
			? selected.filter((other) => other !== name)
			: [...selected, name]
	}

	/** Header checkbox: select every matching task, or clear the selection. */
	function toggleAll() {
		selected = allSelected ? [] : (filtered?.map((info) => info.name) ?? [])
		anchor = null
	}

	function setHiddenAll(names: string[], hidden: boolean) {
		const set = new Set(hiddenTasks)
		for (const name of names) {
			if (hidden) set.add(name)
			else set.delete(name)
		}
		hiddenTasks = [...set]
		plugin.settings.hiddenTasks = [...hiddenTasks]
		void plugin.saveSettings()
	}

	function setColorAll(names: string[], color: string | null) {
		for (const name of names) {
			if (color === null) delete taskColors[name]
			else taskColors[name] = color
		}
		plugin.settings.taskColors = { ...taskColors }
		void plugin.saveSettings()
	}

	/**
	 * Run a bulk operation, then re-sync the settings mirrors it may have
	 * migrated (the table itself follows the store's change events).
	 */
	async function runAction(action: () => Promise<boolean>) {
		busy = true
		try {
			await action()
		} finally {
			busy = false
			taskColors = { ...plugin.settings.taskColors }
			hiddenTasks = [...plugin.settings.hiddenTasks]
			selected = []
			await load()
		}
	}

	async function load() {
		await plugin.vaultTasks.ensureBuilt()
		infos = plugin.vaultTasks.snapshot()
		issues = issuesByTask(
			visibleIssues(
				detectIssues(plugin.vaultTasks, new Date()),
				plugin.settings
			)
		)
	}

	const ISSUE_ICON: Record<IssueKind, IconName> = {
		'similar-name': 'spell-check',
		'long-session': 'hourglass',
		'tag-drift': 'tags',
		'clock-overlap': 'layers',
		'stale-clock': 'alarm-clock',
		'outside-day': 'moon',
	}

	/** Remember not to show these warnings again, or a whole kind of them. */
	async function dismiss(keys: string[], kind?: IssueKind) {
		const { settings } = plugin
		if (kind && !settings.ignoredIssueKinds.includes(kind)) {
			settings.ignoredIssueKinds = [...settings.ignoredIssueKinds, kind]
		}
		settings.dismissedIssues = [
			...new Set([...settings.dismissedIssues, ...keys]),
		]
		await plugin.saveSettings()
		await load()
	}

	/** The task's issues grouped by kind, in a stable order. */
	function issueGroups(name: string): [IssueKind, TaskIssue[]][] {
		const groups = new Map<IssueKind, TaskIssue[]>()
		for (const issue of issues.get(name) ?? []) {
			groups.set(issue.kind, [...(groups.get(issue.kind) ?? []), issue])
		}
		return [...groups.entries()]
	}

	async function goTo(path: string, line: number) {
		close()
		await openNoteAtLine(plugin, path, line)
	}

	/** One menu entry per finding, each with the action that resolves it. */
	function openIssueMenu(
		event: MouseEvent,
		kind: IssueKind,
		list: TaskIssue[]
	) {
		const menu = new Menu()
		for (const issue of list) {
			menu.addItem((item) => {
				item.setTitle(describeIssue(issue)).setIcon(ISSUE_ICON[kind])
				switch (issue.kind) {
					case 'similar-name':
						item.onClick(
							() =>
								void runAction(() =>
									mergeTasks(plugin, [issue.name, issue.other])
								)
						)
						break
					case 'tag-drift':
						item.onClick(
							() => void runAction(() => changeTags(plugin, [issue.name]))
						)
						break
					case 'clock-overlap':
						item.onClick(
							() =>
								void runAction(() =>
									joinOverlappingClocks(plugin, issue.name, issue.path)
								)
						)
						break
					default:
						item.onClick(() => void goTo(issue.path, issue.lineIndex))
				}
			})
			if (issue.kind === 'similar-name') {
				menu.addItem((item) =>
					item
						.setTitle(`Show "${issue.other}"`)
						.setIcon('search')
						.onClick(() => (query = issue.other))
				)
			}
		}
		menu.addSeparator()
		menu.addItem((item) =>
			item
				.setTitle(
					list.length === 1 ? 'Ignore this warning' : 'Ignore these warnings'
				)
				.setIcon('bell-off')
				.onClick(() => void dismiss(list.map(issueKey)))
		)
		menu.addItem((item) =>
			item
				.setTitle(`Ignore every "${ISSUE_TITLES[kind]}" warning`)
				.setIcon('bell-off')
				.onClick(() => void dismiss([], kind))
		)
		menu.showAtMouseEvent(event)
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
	<button
		class="facet"
		aria-pressed={hiddenOnly}
		onclick={() => (hiddenOnly = !hiddenOnly)}
	>
		<span use:icon={'eye-off'}></span>
		Hidden only
	</button>
	<button
		class="facet"
		aria-pressed={issuesOnly}
		onclick={() => (issuesOnly = !issuesOnly)}
	>
		<span use:icon={'triangle-alert'}></span>
		Issues only
	</button>
	{#if filtered !== null && infos !== null && filtered.length !== infos.length}
		<span class="muted">{filtered.length} of {infos.length} tasks</span>
	{/if}
</div>

<div class="selection-bar" class:idle={selected.length === 0}>
	{#if selected.length === 0}
		<span class="muted">
			No task selected. Tick tasks to merge, retag, recolor, hide or delete them
			together.
		</span>
	{:else}
		<span>{selected.length} selected</span>
		<button
			disabled={selected.length < 2 || busy}
			title="Merge the selected tasks into one: pick the surviving name, every daily note is rewritten and their clocks joined (needs at least two)"
			onclick={() => void runAction(() => mergeTasks(plugin, selected))}
		>
			Merge…
		</button>
		<button
			disabled={busy}
			title="Set the tags of every line of the selected tasks, in every daily note, to the ones you pick"
			onclick={() => void runAction(() => changeTags(plugin, selected))}
		>
			Change tags…
		</button>
		<button
			disabled={busy}
			title="Give the selected tasks the same chart color (or remove their custom color)"
			onclick={(event) =>
				openColorMenu(
					event,
					undefined,
					(color) => setColorAll(selected, color),
					selected.some((name) => taskColors[name] !== undefined)
				)}
		>
			Color…
		</button>
		<button
			disabled={busy}
			title={selectedHidden
				? 'Offer the selected tasks again in the task pickers'
				: 'Stop offering the selected tasks in the task pickers (typing their exact name still finds them)'}
			onclick={() => setHiddenAll(selected, !selectedHidden)}
		>
			{selectedHidden ? 'Show in picker' : 'Hide from picker'}
		</button>
		<button
			class="mod-warning"
			disabled={busy}
			title="Remove the selected tasks and their clocks from every daily note; asks for confirmation, cannot be undone"
			onclick={() => void runAction(() => deleteTasks(plugin, selected))}
		>
			Delete…
		</button>
		<button
			class="clear"
			title="Untick every task"
			onclick={() => (selected = [])}
		>
			Clear
		</button>
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
					<th class="select-cell">
						<input
							type="checkbox"
							aria-label="Select every matching task"
							checked={allSelected}
							indeterminate={someSelected}
							onchange={toggleAll}
						/>
					</th>
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
					<th>Issues</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as info (info.name)}
					<tr>
						<td class="select-cell">
							<input
								type="checkbox"
								aria-label="Select {info.name}"
								checked={isSelected(info.name)}
								onclick={(event) => toggleSelected(info.name, event.shiftKey)}
							/>
						</td>
						<td class="swatch-cell">
							<button
								class="swatch"
								class:unset={taskColors[info.name] === undefined}
								style:background={taskColors[info.name] ?? 'transparent'}
								aria-label="Set color of {info.name}"
								onclick={(event) =>
									openColorMenu(event, taskColors[info.name], (color) =>
										setColorAll([info.name], color)
									)}
							></button>
						</td>
						<td>
							<button
								class="name"
								class:muted={isHidden(info.name)}
								title="Rename…"
								aria-label="Rename {info.name}"
								disabled={busy}
								onclick={() =>
									void runAction(() => renameTask(plugin, info.name))}
							>
								{info.name}
							</button>
							{#if isHidden(info.name)}
								<span
									class="hidden-marker"
									aria-label="Hidden from picker"
									use:icon={'eye-off'}
								></span>
							{/if}
							<button
								class="tags"
								title="Change tags…"
								aria-label="Change tags of {info.name}"
								disabled={busy}
								onclick={() =>
									void runAction(() => changeTags(plugin, [info.name]))}
							>
								{#each info.tags as tag (tag)}
									<span class="tag">{tag}</span>
								{:else}
									<span class="tag placeholder">no tag</span>
								{/each}
							</button>
						</td>
						<td class="numeric">{info.noteCount}</td>
						<td class="nowrap">{lastUsedLabel(info)}</td>
						<td class="numeric">{formatHoursMinutes(info.totalMinutes)}</td>
						<td class="issues-cell">
							{#each issueGroups(info.name) as [kind, list] (kind)}
								<button
									class="issue"
									aria-label="{ISSUE_TITLES[kind]}: {list.length}"
									title={ISSUE_TITLES[kind]}
									onclick={(event) => openIssueMenu(event, kind, list)}
								>
									<span use:icon={ISSUE_ICON[kind]}></span>
									{#if list.length > 1}<span class="count">{list.length}</span
										>{/if}
								</button>
							{/each}
						</td>
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

	.selection-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5em;
		/* Same height with or without a selection, so the table never jumps. */
		min-height: calc(var(--input-height) + 1em);
		margin-bottom: 0.75em;
		padding: 0.5em 0.75em;
		border-radius: var(--radius-m);
		background: var(--background-secondary);
	}

	.selection-bar.idle {
		background: transparent;
		border: 1px dashed var(--background-modifier-border);
	}

	.selection-bar .clear {
		margin-left: auto;
	}

	.facet {
		display: inline-flex;
		align-items: center;
		gap: 0.35em;
		color: var(--text-muted);
	}

	.facet[aria-pressed='true'] {
		color: var(--text-on-accent);
		background: var(--interactive-accent);
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
		/* Above the rows scrolled beneath (their checkboxes are positioned). */
		z-index: 1;
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
		all: unset;
		cursor: pointer;
		margin-right: 0.5em;
	}

	.name:hover {
		color: var(--text-accent-hover);
	}

	.name:focus-visible,
	.tags:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	.tags {
		all: unset;
		cursor: pointer;
	}

	.tags:hover .tag {
		color: var(--text-normal);
	}

	.tag.placeholder {
		font-style: italic;
		opacity: 0.6;
	}

	.swatch-cell,
	.select-cell {
		width: 1.6em;
	}

	th.select-cell,
	td.select-cell {
		padding: 0.3em 0.5em;
		text-align: center;
		vertical-align: middle;
	}

	.select-cell input {
		margin: 0;
		vertical-align: middle;
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

	.hidden-marker {
		display: inline-flex;
		vertical-align: middle;
		color: var(--text-faint);
		margin-right: 0.5em;
	}

	.issues-cell {
		white-space: nowrap;
	}

	.issue {
		all: unset;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 0.15em;
		margin-right: 0.4em;
		color: var(--text-warning);
	}

	.issue:hover {
		color: var(--text-normal);
	}

	.issue:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	.issue .count {
		font-size: var(--font-ui-smaller);
	}
</style>
