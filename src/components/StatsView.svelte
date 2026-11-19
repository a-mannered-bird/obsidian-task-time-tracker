<script lang="ts">
	import { moment } from 'obsidian'
	import { onMount } from 'svelte'
	import { resolveSeriesColor } from 'core/chartColors'
	import {
		loadComparison,
		loadRangeStats,
		type LoadedRangeStats,
	} from 'core/loadRangeStats'
	import {
		summaryDelta,
		summaryShift,
		type Comparison,
		type PeriodValues,
	} from 'core/progression'
	import { shiftRange } from 'core/ranges'
	import type { StatsBlockOptions } from 'core/statsOptions'
	import {
		buildStatsTable,
		chartDay,
		OTHER,
		showsOverlap,
	} from 'core/statsTable'
	import { formatClockMinutes, formatHoursMinutes } from 'core/time'
	import { icon } from 'ui/icon'
	import KeyValueTable from './KeyValueTable.svelte'
	import StackedBarChart, {
		type ChartPoint,
		type ChartSeries,
	} from './StackedBarChart.svelte'
	import type TaskTimeTracker from '../main'

	type Props = {
		plugin: TaskTimeTracker
		options: StatsBlockOptions
	}

	const { plugin, options }: Props = $props()

	let loaded = $state<LoadedRangeStats | null>(null)
	let loading = $state(true)
	/**
	 * Periods navigated away from the written range (0 = as written, negative
	 * = past). Component state only: a re-render starts back at the source.
	 */
	let offset = $state(0)
	let canGoPrevious = $state(false)
	let canGoNext = $state(false)
	/** Null until the earlier periods are loaded, and with `compare: none`. */
	let comparison = $state<Comparison | null>(null)
	let comparing = $state(false)
	/** Bumped by every reload, so a slower earlier one cannot win. */
	let generation = 0

	const stats = $derived(loaded?.stats ?? null)
	const show = (metric: StatsBlockOptions['metrics'][number]) =>
		options.metrics.includes(metric)

	const ready = $derived(comparison?.status === 'ready' ? comparison : null)

	const table = $derived(
		stats ? buildStatsTable(stats, options.groupBy, options.top, ready) : null
	)
	const keptKeys = $derived(new Set(table?.rows.map((row) => row.key)))
	const hatched = $derived(stats ? showsOverlap(stats, options.groupBy) : false)

	const series = $derived.by<ChartSeries[]>(() =>
		(table?.rows ?? []).map(({ key }, index) => ({
			key,
			color:
				key === OTHER
					? 'var(--text-faint)'
					: resolveSeriesColor(key, index, plugin.settings.taskColors),
		}))
	)

	const chartPoints = $derived.by<ChartPoint[]>(() => {
		if (!stats) return []
		return stats.perDay.map((point) => ({
			label: shortDay(point.date),
			// Full date, in the same format as the daily note names.
			tooltipLabel: moment(point.date).format(
				plugin.getDailyNotesConfig().format
			),
			...chartDay(point, keptKeys, hatched),
		}))
	})

	function shortDay(date: Date) {
		return date.toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'numeric',
		})
	}

	const average = $derived(
		stats
			? options.skipEmptyDays
				? stats.averagePerLoggedDay
				: stats.averagePerDay
			: 0
	)

	function duration(minutes: number | null) {
		return minutes === null ? 'n/a' : formatHoursMinutes(minutes)
	}

	function clock(minutes: number | null) {
		return minutes === null ? 'n/a' : formatClockMinutes(minutes)
	}

	type Pick = (values: PeriodValues) => number | null

	function delta(current: number | null, pick: Pick) {
		return ready ? summaryDelta(current, pick, ready) : null
	}

	function shift(current: number | null, pick: Pick) {
		return ready ? summaryShift(current, pick, ready) : null
	}

	function formatDay(date: Date) {
		return date.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		})
	}

	async function reload() {
		const run = ++generation
		const now = new Date()
		const main = await loadRangeStats(plugin.dailyLogs, options, offset, now)
		if (run !== generation) return
		loaded = main
		canGoPrevious = shiftRange(options.range, offset - 1, now) !== null
		canGoNext = shiftRange(options.range, offset + 1, now) !== null
		loading = false
		if (!main || options.compare === 'none') return

		// Drawn first, compared after: earlier periods can span years.
		comparing = true
		const result = await loadComparison(plugin.dailyLogs, options, offset, now)
		if (run !== generation) return
		comparison = result
		comparing = false
	}

	function navigate(step: number) {
		offset += step
		// The comparison of the range left behind must not show meanwhile.
		comparison = null
		void reload()
	}

	onMount(() => {
		const unsubscribe = plugin.dailyLogs.onChange(() => void reload())
		void reload()
		return unsubscribe
	})
</script>

{#snippet change(text: string | null)}
	{#if text}
		<span class="muted">· {text}</span>
	{/if}
{/snippet}

{#if loading}
	<p>Loading…</p>
{:else if !loaded || !stats}
	<p>No daily note found for range "{options.range}".</p>
{:else}
	<div class="stats-header">
		<span class="range-nav">
			{#if canGoPrevious || canGoNext}
				<button
					class="icon-button"
					aria-label="Previous range"
					use:icon={'chevron-left'}
					disabled={!canGoPrevious}
					onclick={() => navigate(-1)}
				></button>
			{/if}
			<strong
				>{formatDay(loaded.range.start)} → {formatDay(loaded.range.end)}</strong
			>
			{#if canGoPrevious || canGoNext}
				<button
					class="icon-button"
					aria-label="Next range"
					use:icon={'chevron-right'}
					disabled={!canGoNext}
					onclick={() => navigate(1)}
				></button>
			{/if}
		</span>
		<span class="muted">
			{stats.loggedDays} of {stats.days} days logged
			{#if comparing && !comparison}
				· Comparing…
			{:else if comparison?.status === 'unavailable'}
				· {comparison.message}
			{/if}
		</span>
	</div>

	{#if show('total') || show('average')}
		<div class="stats-summary">
			{#if show('total')}
				<div>
					<b>⏱ Covered</b> <span>{duration(stats.coveredMinutes)}</span>
					{#if stats.concurrentMinutes > 0}
						<span class="muted"
							>· +{duration(stats.concurrentMinutes)} concurrent</span
						>
					{/if}
					{@render change(delta(stats.coveredMinutes, (v) => v.covered))}
				</div>
			{/if}
			{#if show('average')}
				<div>
					<b>📊 Average per {options.skipEmptyDays ? 'logged day' : 'day'}</b>
					<span>{duration(average)}</span>
				</div>
			{/if}
		</div>
	{/if}

	{#if show('total') && table && table.rows.length}
		<KeyValueTable
			columns={table.columns}
			rows={table.rows.map((row, i) => ({
				cells: row.cells,
				swatch: series[i]?.color,
			}))}
			footer={table.footer}
		/>
	{/if}

	{#if show('time-of-day')}
		<div class="stats-summary">
			<div>
				<b>⏸ Off time</b> <span>{duration(stats.timeOfDay.offTime)}</span>
				{@render change(delta(stats.timeOfDay.offTime, (v) => v.offTime))}
			</div>
			<div>
				<b>🍃 Unlogged</b> <span>{duration(stats.timeOfDay.unlogged)}</span>
				{@render change(delta(stats.timeOfDay.unlogged, (v) => v.unlogged))}
			</div>
			<div>
				<b>🌅 Start of day</b> <span>{clock(stats.timeOfDay.dayStart)}</span>
				{@render change(shift(stats.timeOfDay.dayStart, (v) => v.dayStart))}
			</div>
			<div>
				<b>🌇 End of day</b> <span>{clock(stats.timeOfDay.dayEnd)}</span>
				{@render change(shift(stats.timeOfDay.dayEnd, (v) => v.dayEnd))}
			</div>
		</div>
	{/if}

	{#if show('per-day')}
		<StackedBarChart points={chartPoints} {series} {hatched} />
		<details>
			<summary class="muted">Per-day table</summary>
			<KeyValueTable
				columns={[{ label: 'Day' }, { label: 'Covered', numeric: true }]}
				rows={stats.perDay.map((point) => ({
					cells: [
						{ text: formatDay(point.date) },
						{ text: formatHoursMinutes(point.covered) },
					],
				}))}
			/>
		</details>
	{/if}
{/if}

<style>
	.stats-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 0.5em;
	}

	.range-nav {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
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

	.stats-summary {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5em 1.5em;
		margin: 0.5em 0;
	}

	.muted {
		color: var(--text-muted);
	}
</style>
