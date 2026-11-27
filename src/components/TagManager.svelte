<script lang="ts">
	import { Menu } from 'obsidian'
	import { onMount } from 'svelte'
	import { dismissIssues } from 'commands/issueActions'
	import {
		chooseTagEmoji,
		deleteTags,
		mergeTags,
		renameTag,
		setTagColors,
	} from 'commands/tagActions'
	import {
		describeIssue,
		detectTagIssues,
		ISSUE_TITLES,
		issueKey,
		issuesByTask,
		visibleIssues,
		type TaskIssue,
	} from 'core/issues'
	import {
		filterTagInfos,
		sortTagInfos,
		tagInfos,
		type TagInfo,
		type TagSortKey,
	} from 'core/tagManager'
	import { formatHoursMinutes, formatLocalDateTime } from 'core/time'
	import type { TagMapping } from 'types/tags'
	import { openColorMenu } from 'ui/colorMenu'
	import { icon } from 'ui/icon'
	import type TaskTimeTracker from '../main'
	import { RowSelection, searchField, TableSort } from './managerTable.svelte'

	type Props = {
		plugin: TaskTimeTracker
		/** Show the Tasks tab filtered to the tag. */
		showTasks: (tag: string) => void
	}

	const { plugin, showTasks }: Props = $props()

	let infos = $state<TagInfo[] | null>(null)
	// A local mirror of the settings so the rows re-render on change.
	// svelte-ignore state_referenced_locally
	let mappings = $state<TagMapping[]>([...plugin.settings.tagMappings])
	let issues = $state<Map<string, TaskIssue[]>>(new Map())
	let query = $state('')
	let issuesOnly = $state(false)
	const filtering = $derived(query !== '' || issuesOnly)

	function clearFilters() {
		query = ''
		issuesOnly = false
	}
	let busy = $state(false)
	const sort = new TableSort<TagSortKey>('notes', (key) => key === 'tag')
	const selection = new RowSelection()

	const HEADERS: { key: TagSortKey; label: string; numeric?: boolean }[] = [
		{ key: 'tag', label: 'Tag' },
		{ key: 'tasks', label: 'Tasks', numeric: true },
		{ key: 'notes', label: 'Notes', numeric: true },
		{ key: 'lastUsed', label: 'Last used' },
		{ key: 'total', label: 'Total', numeric: true },
	]

	const rows = $derived.by(() => {
		if (infos === null) return null
		const matching = filterTagInfos(infos, query).filter(
			(info) => !issuesOnly || issues.has(info.tag)
		)
		return sortTagInfos(matching, sort.key, sort.ascending)
	})
	const rowTags = $derived(rows?.map((info) => info.tag) ?? [])
	const selected = $derived(selection.selected)
	const allSelected = $derived(selection.allOf(rowTags))
	const someSelected = $derived(selected.length > 0 && !allSelected)
	const singleSelected = $derived(
		selected.length === 1 ? (selected[0] ?? null) : null
	)

	function mappingOf(tag: string): TagMapping | undefined {
		return mappings.find((mapping) => mapping.tag === tag)
	}

	function lastUsedLabel(info: TagInfo): string {
		return info.lastUsed
			? formatLocalDateTime(info.lastUsed).split('T')[0]!
			: '—'
	}

	async function load() {
		await plugin.vaultTasks.ensureBuilt()
		mappings = [...plugin.settings.tagMappings]
		infos = tagInfos(
			plugin.vaultTasks.notes(),
			mappings.map((mapping) => mapping.tag),
			new Date()
		)
		issues = issuesByTask(
			visibleIssues(
				detectTagIssues(infos.map((info) => info.tag)),
				plugin.settings
			)
		)
	}

	/** Run an operation, then refresh from the settings and the index. */
	async function runAction(action: () => Promise<unknown>) {
		busy = true
		try {
			await action()
		} finally {
			busy = false
			selection.clear()
			await load()
		}
	}

	function setColor(tags: string[], color: string | null) {
		void runAction(() => setTagColors(plugin, tags, color))
	}

	function openIssueMenu(event: MouseEvent, list: TaskIssue[]) {
		const menu = new Menu()
		for (const issue of list) {
			if (issue.kind !== 'similar-tag') continue
			menu.addItem((item) =>
				item
					.setTitle(`Merge with ${issue.other}…`)
					.setIcon('merge')
					.onClick(
						() =>
							void runAction(() => mergeTags(plugin, [issue.name, issue.other]))
					)
			)
			menu.addItem((item) =>
				item
					.setTitle(`Show ${issue.other}`)
					.setIcon('search')
					.onClick(() => (query = issue.other))
			)
		}
		menu.addSeparator()
		menu.addItem((item) =>
			item
				.setTitle(
					list.length === 1 ? 'Ignore this warning' : 'Ignore these warnings'
				)
				.setIcon('bell-off')
				.onClick(
					() => void runAction(() => dismissIssues(plugin, list.map(issueKey)))
				)
		)
		menu.addItem((item) =>
			item
				.setTitle(`Ignore every "${ISSUE_TITLES['similar-tag']}" warning`)
				.setIcon('bell-off')
				.onClick(
					() => void runAction(() => dismissIssues(plugin, [], 'similar-tag'))
				)
		)
		menu.showAtMouseEvent(event)
	}

	onMount(() => {
		void load()
		return plugin.dailyLogs.onChange(() => void load())
	})
</script>

<div class="toolbar">
	<div
		class="search"
		use:searchField={{
			placeholder: 'Filter tags',
			label: 'Filter tags',
			get: () => query,
			set: (value) => (query = value),
		}}
	></div>
	<button
		class="facet"
		aria-pressed={issuesOnly}
		onclick={() => (issuesOnly = !issuesOnly)}
	>
		<span use:icon={'triangle-alert'}></span>
		Issues only
	</button>
	{#if rows !== null && infos !== null && rows.length !== infos.length}
		<span class="muted">{rows.length} of {infos.length} tags</span>
	{/if}
</div>

<div class="selection-bar" class:idle={selected.length === 0}>
	{#if selected.length === 0}
		<span class="muted">
			No tag selected. Tick tags to rename, merge, recolor or delete them
			together.
		</span>
	{:else}
		<span>{selected.length} selected</span>
		{#if singleSelected !== null}
			{@const tag = singleSelected}
			<button
				disabled={busy}
				title="Rename the selected tag on every task line and tag goal"
				onclick={() => void runAction(() => renameTag(plugin, tag))}
			>
				Rename…
			</button>
		{:else}
			<button
				disabled={busy}
				title="Merge the selected tags into one: pick the surviving tag, every daily note is rewritten"
				onclick={() => void runAction(() => mergeTags(plugin, selected))}
			>
				Merge…
			</button>
		{/if}
		<button
			disabled={busy}
			title="Give the selected tags the same color (or remove their color)"
			onclick={(event) =>
				openColorMenu(
					event,
					undefined,
					(color) => setColor(selected, color),
					selected.some((tag) => mappingOf(tag)?.color !== undefined)
				)}
		>
			Color…
		</button>
		<button
			class="mod-warning"
			disabled={busy}
			title="Remove the selected tags and their tag goals from every daily note; asks for confirmation, cannot be undone"
			onclick={() => void runAction(() => deleteTags(plugin, selected))}
		>
			Delete…
		</button>
		<button
			class="clear"
			title="Untick every tag"
			onclick={() => selection.clear()}
		>
			Clear
		</button>
	{/if}
</div>

{#if rows === null}
	<p class="muted">Scanning vault tags…</p>
{:else if rows.length === 0}
	<div class="no-results">
		<span class="muted">No tag matches.</span>
		{#if filtering}
			<button onclick={clearFilters}>Clear filters</button>
		{/if}
	</div>
{:else}
	<div class="table-wrapper">
		<table>
			<thead>
				<tr>
					<th class="select-cell">
						<input
							type="checkbox"
							aria-label="Select every matching tag"
							checked={allSelected}
							indeterminate={someSelected}
							onchange={() => selection.toggleAll(rowTags)}
						/>
					</th>
					<th class="swatch-cell"></th>
					<th class="emoji-cell"></th>
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
				{#each rows as info (info.tag)}
					{@const mapping = mappingOf(info.tag)}
					<tr>
						<td class="select-cell">
							<input
								type="checkbox"
								aria-label="Select {info.tag}"
								checked={selection.has(info.tag)}
								onclick={(event) =>
									selection.toggle(info.tag, event.shiftKey, rowTags)}
							/>
						</td>
						<td class="swatch-cell">
							<button
								class="swatch"
								class:unset={mapping?.color === undefined}
								style:background={mapping?.color ?? 'transparent'}
								aria-label="Set color of {info.tag}"
								onclick={(event) =>
									openColorMenu(event, mapping?.color, (color) =>
										setColor([info.tag], color)
									)}
							></button>
						</td>
						<td class="emoji-cell">
							<button
								class="emoji"
								class:unset={!mapping?.emoji}
								aria-label="Emoji of {info.tag}"
								disabled={busy}
								onclick={() =>
									void runAction(() => chooseTagEmoji(plugin, info.tag))}
							>
								{#if mapping?.emoji}{mapping.emoji}{:else}<span
										class="emoji-icon"
										use:icon={'smile-plus'}
									></span>{/if}
							</button>
						</td>
						<td>
							<button
								class="name"
								class:muted={info.noteCount === 0}
								title="Rename…"
								aria-label="Rename {info.tag}"
								disabled={busy}
								onclick={() =>
									void runAction(() => renameTag(plugin, info.tag))}
							>
								{info.tag}
							</button>
						</td>
						<td class="numeric">
							{#if info.taskCount > 0}
								<button
									class="link"
									title="Show the tasks carrying {info.tag}"
									aria-label="Show the tasks of {info.tag}"
									onclick={() => showTasks(info.tag)}
								>
									{info.taskCount}
								</button>
							{:else}
								0
							{/if}
						</td>
						<td class="numeric">{info.noteCount}</td>
						<td class="nowrap">{lastUsedLabel(info)}</td>
						<td class="numeric">{formatHoursMinutes(info.totalMinutes)}</td>
						<td class="issues-cell">
							{#if issues.has(info.tag)}
								{@const list = issues.get(info.tag) ?? []}
								<button
									class="issue"
									aria-label="{ISSUE_TITLES['similar-tag']}: {list.length}"
									title={list.map(describeIssue).join('\n')}
									onclick={(event) => openIssueMenu(event, list)}
								>
									<span use:icon={'spell-check'}></span>
									{#if list.length > 1}<span class="count">{list.length}</span
										>{/if}
								</button>
							{:else}
								<span class="no-issue" role="img" aria-label="No issues">—</span
								>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
