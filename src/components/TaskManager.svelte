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
		explainOutsideDay,
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
	import { dismissIssues } from 'commands/issueActions'
	import { openColorMenu } from 'ui/colorMenu'
	import { icon } from 'ui/icon'
	import { showNotice } from 'ui/notice'
	import type TaskTimeTracker from '../main'
	import { RowSelection, searchField, TableSort } from './managerTable.svelte'

	type Props = {
		plugin: TaskTimeTracker
		/** Close the hosting modal (after navigating to a note). */
		close: () => void
		/** The filter, also set from the Tags tab. */
		query: string
	}

	let { plugin, close, query = $bindable() }: Props = $props()

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
	let hiddenOnly = $state(false)
	let issuesOnly = $state(false)
	const sort = new TableSort<TaskSortKey>('usage', (key) => key === 'name')
	const selection = new RowSelection()
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
		return sortTaskInfos(matching, sort.key, sort.ascending)
	})
	const rows = $derived(filtered?.slice(0, TASK_TABLE_ROW_CAP) ?? null)
	const filteredNames = $derived(filtered?.map((info) => info.name) ?? [])

	function lastUsedLabel(info: VaultTaskInfo): string {
		return formatLocalDateTime(info.lastUsed).split('T')[0]!
	}

	function isHidden(name: string): boolean {
		return hiddenTasks.includes(name)
	}

	const selected = $derived(selection.selected)
	const allSelected = $derived(selection.allOf(filteredNames))
	const someSelected = $derived(selected.length > 0 && !allSelected)
	const singleSelected = $derived(
		selected.length === 1 ? (selected[0] ?? null) : null
	)
	const selectedHidden = $derived(
		selected.length > 0 && selected.every((name) => isHidden(name))
	)

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
			selection.clear()
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
		'outside-day': 'calendar-x',
		'goal-syntax': 'target',
		'unit-drift': 'ruler',
		'similar-tag': 'spell-check',
	}

	async function dismiss(keys: string[], kind?: IssueKind) {
		await dismissIssues(plugin, keys, kind)
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
					case 'outside-day':
						item.onClick(() => {
							// Stays long enough to read next to the opened note.
							showNotice(explainOutsideDay(issue), 15000)
							void goTo(issue.path, issue.lineIndex)
						})
						break
					case 'similar-tag':
						// Raised on the Tags tab only.
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
	<div
		class="search"
		use:searchField={{
			placeholder: 'Filter by name or tag, "Name" for an exact name',
			label: 'Filter tasks',
			get: () => query,
			set: (value) => (query = value),
		}}
	></div>
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
			No task selected. Tick tasks to rename, merge, retag, recolor, hide or
			delete them together.
		</span>
	{:else}
		<span>{selected.length} selected</span>
		{#if singleSelected !== null}
			{@const name = singleSelected}
			<button
				disabled={busy}
				title="Rename the selected task in every daily note"
				onclick={() => void runAction(() => renameTask(plugin, name))}
			>
				Rename…
			</button>
		{:else}
			<button
				disabled={busy}
				title="Merge the selected tasks into one: pick the surviving name, every daily note is rewritten and their clocks joined"
				onclick={() => void runAction(() => mergeTasks(plugin, selected))}
			>
				Merge…
			</button>
		{/if}
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
			onclick={() => selection.clear()}
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
							onchange={() => selection.toggleAll(filteredNames)}
						/>
					</th>
					<th class="swatch-cell"></th>
					{#each HEADERS as header (header.key)}
						<th
							class:numeric={header.numeric}
							aria-sort={sort.ariaSort(header.key)}
						>
							<button class="header" onclick={() => sort.set(header.key)}>
								{header.label}
								{#if sort.key === header.key}
									<span aria-hidden="true">{sort.ascending ? '▲' : '▼'}</span>
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
								checked={selection.has(info.name)}
								onclick={(event) =>
									selection.toggle(
										info.name,
										event.shiftKey,
										rows.map((row) => row.name)
									)}
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
