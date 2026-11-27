<script lang="ts">
	import { Menu } from 'obsidian'
	import { onMount } from 'svelte'
	import { dismissIssues } from 'commands/issueActions'
	import {
		changeMetricUnit,
		chooseMetricEmoji,
		deleteMetrics,
		mergeMetrics,
		renameMetric,
		updateMetricSettings,
	} from 'commands/metricActions'
	import {
		METRIC_GOAL_EMOJI,
		TIME_GOAL_EMOJI,
		TIME_GOAL_LABEL,
	} from 'core/goalCards'
	import { defaultAggregation } from 'core/goals'
	import {
		AGGREGATION_RULE_NAMES,
		AGGREGATION_RULES,
		isAggregationRule,
		metricRuleOf,
		type MetricSettings,
	} from 'core/goalStyle'
	import {
		describeIssue,
		detectMetricIssues,
		ISSUE_TITLES,
		issueKey,
		issuesByTask,
		visibleIssues,
		type IssueKind,
		type TaskIssue,
	} from 'core/issues'
	import {
		describeMetricTotal,
		filterMetricInfos,
		metricInfos,
		sortMetricInfos,
		type MetricInfo,
		type MetricSortKey,
		type NamedMetricInfo,
	} from 'core/metricManager'
	import { metricQuery } from 'core/taskManager'
	import { formatLocalDateTime } from 'core/time'
	import { openColorMenu } from 'ui/colorMenu'
	import { icon } from 'ui/icon'
	import type { IconName } from 'obsidian'
	import type TaskTimeTracker from '../main'
	import { RowSelection, searchField, TableSort } from './managerTable.svelte'

	type Props = {
		plugin: TaskTimeTracker
		/** Show the Tasks tab with this filter. */
		showTasks: (query: string) => void
		/** The filter, bound so an opener can point at one metric. */
		query: string
	}

	let { plugin, showTasks, query = $bindable() }: Props = $props()

	let infos = $state<MetricInfo[] | null>(null)
	// A local mirror of the settings so the rows re-render on change.
	// svelte-ignore state_referenced_locally
	let settings = $state<MetricSettings>({ ...plugin.settings.metricSettings })
	let issues = $state<Map<string, TaskIssue[]>>(new Map())
	let issuesOnly = $state(false)
	const filtering = $derived(query !== '' || issuesOnly)

	function clearFilters() {
		query = ''
		issuesOnly = false
	}
	let busy = $state(false)
	const sort = new TableSort<MetricSortKey>('notes', (key) => key === 'metric')
	const selection = new RowSelection()

	type Header = { key: MetricSortKey; label: string; numeric?: boolean }
	const NAME_HEADER: Header = { key: 'metric', label: 'Goal' }
	const COUNT_HEADERS: Header[] = [
		{ key: 'tasks', label: 'Tasks', numeric: true },
		{ key: 'notes', label: 'Notes', numeric: true },
		{ key: 'lastUsed', label: 'Last used' },
		{ key: 'total', label: 'Total', numeric: true },
	]

	const ISSUE_ICON: Partial<Record<IssueKind, IconName>> = {
		'similar-metric': 'spell-check',
		'metric-units': 'ruler',
	}

	const rows = $derived.by(() => {
		if (infos === null) return null
		const matching = filterMetricInfos(infos, query).filter(
			(info) => !issuesOnly || issues.has(info.metric)
		)
		return sortMetricInfos(matching, sort.key, sort.ascending)
	})
	// The time row takes no action, so it is never selected.
	const selectable = $derived(
		rows?.filter((info) => info.kind === 'metric').map((info) => info.metric) ??
			[]
	)
	const selected = $derived(selection.selected)
	const allSelected = $derived(selection.allOf(selectable))
	const someSelected = $derived(selected.length > 0 && !allSelected)
	const singleSelected = $derived(
		selected.length === 1 ? (selected[0] ?? null) : null
	)

	function lastUsedLabel(info: MetricInfo): string {
		return info.lastUsed
			? formatLocalDateTime(info.lastUsed).split('T')[0]!
			: '—'
	}

	function defaultRuleName(info: NamedMetricInfo): string {
		return `Default (${AGGREGATION_RULE_NAMES[defaultAggregation(info.unit)]})`
	}

	async function load() {
		await plugin.vaultTasks.ensureBuilt()
		settings = { ...plugin.settings.metricSettings }
		infos = metricInfos(
			plugin.vaultTasks.notes(),
			Object.keys(settings).filter((name) => name !== TIME_GOAL_LABEL),
			metricRuleOf(settings),
			new Date()
		)
		issues = issuesByTask(
			visibleIssues(
				detectMetricIssues(infos.filter((info) => info.kind === 'metric')),
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

	function setColor(metrics: string[], color: string | null) {
		void runAction(() =>
			updateMetricSettings(plugin, metrics, { color: color ?? undefined })
		)
	}

	function setRule(metric: string, value: string) {
		void runAction(() =>
			updateMetricSettings(plugin, [metric], {
				rule: isAggregationRule(value) ? value : undefined,
			})
		)
	}

	function openIssueMenu(event: MouseEvent, metric: string, list: TaskIssue[]) {
		const menu = new Menu()
		for (const issue of list) {
			if (issue.kind === 'similar-metric') {
				menu.addItem((item) =>
					item
						.setTitle(`Merge with ${issue.other}…`)
						.setIcon('merge')
						.onClick(
							() =>
								void runAction(() =>
									mergeMetrics(plugin, [issue.name, issue.other])
								)
						)
				)
				menu.addItem((item) =>
					item
						.setTitle(`Show ${issue.other}`)
						.setIcon('search')
						.onClick(() => (query = issue.other))
				)
			} else if (issue.kind === 'metric-units') {
				menu.addItem((item) =>
					item
						.setTitle('Change unit…')
						.setIcon('ruler')
						.onClick(
							() => void runAction(() => changeMetricUnit(plugin, metric))
						)
				)
				menu.addItem((item) =>
					item
						.setTitle(`Show the tasks with a ${metric} goal`)
						.setIcon('search')
						.onClick(() => showTasks(metricQuery(metric)))
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
				.onClick(
					() => void runAction(() => dismissIssues(plugin, list.map(issueKey)))
				)
		)
		for (const kind of new Set(list.map((issue) => issue.kind))) {
			menu.addItem((item) =>
				item
					.setTitle(`Ignore every "${ISSUE_TITLES[kind]}" warning`)
					.setIcon('bell-off')
					.onClick(() => void runAction(() => dismissIssues(plugin, [], kind)))
			)
		}
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
			placeholder: 'Filter goals',
			label: 'Filter goals',
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
		<span class="muted">{rows.length} of {infos.length} goals</span>
	{/if}
</div>

<div class="selection-bar" class:idle={selected.length === 0}>
	{#if selected.length === 0}
		<span class="muted">
			No goal selected. Tick goals to rename, merge, recolor or delete them
			together.
		</span>
	{:else}
		<span>{selected.length} selected</span>
		{#if singleSelected !== null}
			{@const metric = singleSelected}
			<button
				disabled={busy}
				title="Rename the selected goal on every goal line"
				onclick={() => void runAction(() => renameMetric(plugin, metric))}
			>
				Rename…
			</button>
			<button
				disabled={busy}
				title="Change the unit written on the selected goal's lines; values are not converted"
				onclick={() => void runAction(() => changeMetricUnit(plugin, metric))}
			>
				Change unit…
			</button>
		{:else}
			<button
				disabled={busy}
				title="Merge the selected goals into one: pick the surviving goal, every daily note is rewritten"
				onclick={() => void runAction(() => mergeMetrics(plugin, selected))}
			>
				Merge…
			</button>
		{/if}
		<button
			disabled={busy}
			title="Give the selected goals the same color (or remove their color)"
			onclick={(event) =>
				openColorMenu(
					event,
					undefined,
					(color) => setColor(selected, color),
					selected.some((metric) => settings[metric]?.color !== undefined)
				)}
		>
			Color…
		</button>
		<button
			class="mod-warning"
			disabled={busy}
			title="Delete every line of the selected goals and their settings; asks for confirmation, cannot be undone"
			onclick={() => void runAction(() => deleteMetrics(plugin, selected))}
		>
			Delete…
		</button>
		<button
			class="clear"
			title="Untick every goal"
			onclick={() => selection.clear()}
		>
			Clear
		</button>
	{/if}
</div>

{#snippet sortHeader(header: Header)}
	<th class:numeric={header.numeric} aria-sort={sort.ariaSort(header.key)}>
		<button class="header" onclick={() => sort.set(header.key)}>
			{header.label}
			{#if sort.key === header.key}
				<span aria-hidden="true">{sort.ascending ? '▲' : '▼'}</span>
			{/if}
		</button>
	</th>
{/snippet}

{#if rows === null}
	<p class="muted">Scanning vault goals…</p>
{:else if rows.length === 0}
	<div class="no-results">
		<span class="muted">No goal matches.</span>
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
							aria-label="Select every matching goal"
							checked={allSelected}
							indeterminate={someSelected}
							onchange={() => selection.toggleAll(selectable)}
						/>
					</th>
					<th class="swatch-cell"></th>
					<th class="emoji-cell"></th>
					{@render sortHeader(NAME_HEADER)}
					<th>Unit</th>
					<th>Adds up</th>
					{#each COUNT_HEADERS as header (header.key)}
						{@render sortHeader(header)}
					{/each}
					<th>Issues</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as info (info.metric)}
					{@const own = settings[info.metric]}
					{@const isTime = info.kind === 'time'}
					{@const label = isTime ? 'Time goals' : info.metric}
					{@const total = describeMetricTotal(info)}
					<tr>
						<td class="select-cell">
							{#if !isTime}
								<input
									type="checkbox"
									aria-label="Select {label}"
									checked={selection.has(info.metric)}
									onclick={(event) =>
										selection.toggle(info.metric, event.shiftKey, selectable)}
								/>
							{/if}
						</td>
						<td class="swatch-cell">
							<button
								class="swatch"
								class:unset={own?.color === undefined}
								style:background={own?.color ?? 'transparent'}
								aria-label="Set color of {label}"
								onclick={(event) =>
									openColorMenu(event, own?.color, (color) =>
										setColor([info.metric], color)
									)}
							></button>
						</td>
						<td class="emoji-cell">
							<button
								class="emoji"
								class:unset={!own?.emoji}
								aria-label="Emoji of {label}"
								disabled={busy}
								onclick={() =>
									void runAction(() => chooseMetricEmoji(plugin, info.metric))}
							>
								{own?.emoji ?? (isTime ? TIME_GOAL_EMOJI : METRIC_GOAL_EMOJI)}
							</button>
						</td>
						<td class="nowrap">
							{#if info.kind === 'time'}
								<span
									class="muted"
									title="Time goals have no name to rename, merge or delete"
									>{label}</span
								>
							{:else}
								<button
									class="name"
									class:muted={info.noteCount === 0}
									title="Rename…"
									aria-label="Rename {info.metric}"
									disabled={busy}
									onclick={() =>
										void runAction(() => renameMetric(plugin, info.metric))}
								>
									{info.metric}
								</button>
							{/if}
						</td>
						<td class="nowrap">
							{#if info.kind === 'time'}
								<span class="muted">h, m</span>
							{:else if info.noteCount > 0}
								<button
									class="name"
									title="Change unit…"
									aria-label="Change unit of {info.metric}"
									disabled={busy}
									onclick={() =>
										void runAction(() => changeMetricUnit(plugin, info.metric))}
								>
									{info.unit || '—'}
								</button>
							{:else}
								<span class="muted">—</span>
							{/if}
						</td>
						<td>
							{#if info.kind === 'time'}
								<span class="muted">—</span>
							{:else}
								<select
									class="dropdown rule"
									aria-label="How {info.metric} adds up"
									disabled={busy}
									value={own?.rule ?? ''}
									onchange={(event) =>
										setRule(info.metric, event.currentTarget.value)}
								>
									<option value="">{defaultRuleName(info)}</option>
									{#each AGGREGATION_RULES as rule (rule)}
										<option value={rule}>{AGGREGATION_RULE_NAMES[rule]}</option>
									{/each}
								</select>
							{/if}
						</td>
						<td class="numeric">
							{#if info.taskCount > 0}
								<button
									class="link"
									title="Show the tasks with a {isTime
										? 'time'
										: info.metric} goal"
									aria-label="Show the tasks of {label}"
									onclick={() => showTasks(metricQuery(info.metric))}
								>
									{info.taskCount}
								</button>
							{:else}
								0
							{/if}
						</td>
						<td class="numeric">{info.noteCount}</td>
						<td class="nowrap">{lastUsedLabel(info)}</td>
						<td class="numeric" title={total.title}>
							{total.text}{#if total.title}*{/if}
						</td>
						<td class="issues-cell">
							{#if issues.has(info.metric)}
								{@const list = issues.get(info.metric) ?? []}
								{@const kind = list[0]!.kind}
								<button
									class="issue"
									aria-label="{ISSUE_TITLES[kind]}: {list.length}"
									title={list.map(describeIssue).join('\n')}
									onclick={(event) => openIssueMenu(event, info.metric, list)}
								>
									<span use:icon={ISSUE_ICON[kind] ?? 'triangle-alert'}></span>
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
