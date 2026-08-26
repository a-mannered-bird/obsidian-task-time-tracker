<script lang="ts">
	import { moment } from 'obsidian'
	import { onMount } from 'svelte'
	import { loadRangeStats, type LoadedRangeStats } from 'core/loadRangeStats'
	import type { StatsBlockOptions } from 'core/statsOptions'
	import { getStyleByTags } from 'core/tags'
	import { formatClockMinutes, formatHoursMinutes } from 'core/time'
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

	const stats = $derived(loaded?.stats ?? null)
	const tagMappings = $derived(plugin.settings.tagMappings)
	const show = (metric: StatsBlockOptions['metrics'][number]) =>
		options.metrics.includes(metric)

	// Fixed assignment order, validated for color-vision separation on the
	// default themes (see PLAN); the user's theme provides the actual colors.
	const CHART_COLORS = [
		'var(--color-blue)',
		'var(--color-orange)',
		'var(--color-purple)',
		'var(--color-green)',
		'var(--color-red)',
		'var(--color-cyan)',
		'var(--color-yellow)',
		'var(--color-pink)',
	]
	/**
	 * Beyond the theme colors, cycle the same hue order through deterministic
	 * variants: paler (mixed with the surface), then deeper (mixed with the
	 * ink), mixing harder on each round. Adapts to light and dark themes.
	 */
	function seriesColor(index: number): string {
		const base = CHART_COLORS[index % CHART_COLORS.length]!
		const round = Math.floor(index / CHART_COLORS.length)
		if (round === 0) return base
		const towards =
			round % 2 === 1 ? 'var(--background-primary)' : 'var(--text-normal)'
		const amount = Math.min(35 + Math.floor((round - 1) / 2) * 15, 70)
		return `color-mix(in srgb, ${base} ${100 - amount}%, ${towards})`
	}

	const OTHER = 'Other'

	/** Totals with everything below the `top` biggest keys folded into Other. */
	const byKey = $derived.by<[string, number][]>(() => {
		if (!stats) return []
		if (options.top === null || stats.byKey.length <= options.top) {
			return stats.byKey
		}
		const kept = stats.byKey.slice(0, options.top)
		const folded = stats.byKey
			.slice(options.top)
			.reduce((sum, [, minutes]) => sum + minutes, 0)
		return [...kept, [OTHER, folded]]
	})

	const keptKeys = $derived(new Set(byKey.map(([key]) => key)))

	const series = $derived.by<ChartSeries[]>(() =>
		byKey.map(([key], index) => ({
			key,
			color: key === OTHER ? 'var(--text-faint)' : seriesColor(index),
		}))
	)

	const chartPoints = $derived.by<ChartPoint[]>(() => {
		if (!stats) return []
		return stats.perDay.map((point) => {
			const minutes: Record<string, number> = {}
			for (const [key, value] of Object.entries(point.minutes)) {
				const slot = keptKeys.has(key) ? key : OTHER
				minutes[slot] = (minutes[slot] ?? 0) + value
			}
			return {
				label: shortDay(point.date),
				// Full date, in the same format as the daily note names.
				tooltipLabel: moment(point.date).format(
					plugin.getDailyLogStoreConfig().dailyNotes.format
				),
				minutes,
				total: point.total,
			}
		})
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

	function rowStyle(key: string) {
		return getStyleByTags(options.groupBy === 'tag' ? [key] : [], tagMappings)
	}

	function formatDay(date: Date) {
		return date.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		})
	}

	async function reload() {
		loaded = await loadRangeStats(plugin.dailyLogs, options)
		loading = false
	}

	onMount(() => {
		const unsubscribe = plugin.dailyLogs.onChange(() => void reload())
		void reload()
		return unsubscribe
	})
</script>

{#if loading}
	<p>Loading…</p>
{:else if !loaded || !stats}
	<p>No daily note found for range "{options.range}".</p>
{:else}
	<div class="stats-header">
		<strong
			>{formatDay(loaded.range.start)} → {formatDay(loaded.range.end)}</strong
		>
		<span class="muted">
			{stats.loggedDays} of {stats.days} days logged
		</span>
	</div>

	{#if show('total') || show('average')}
		<div class="stats-summary">
			{#if show('total')}
				<div><b>⏱ Total</b> <span>{duration(stats.totalMinutes)}</span></div>
			{/if}
			{#if show('average')}
				<div>
					<b>📊 Average per {options.skipEmptyDays ? 'logged day' : 'day'}</b>
					<span>{duration(average)}</span>
				</div>
			{/if}
		</div>
	{/if}

	{#if show('total') && byKey.length}
		<KeyValueTable
			columns={[
				{ label: options.groupBy === 'tag' ? 'Tag' : 'Task' },
				{ label: 'Time spent' },
				{ label: 'Share' },
			]}
			rows={byKey.map(([key, minutes]) => [
				key,
				formatHoursMinutes(minutes),
				`${Math.round((minutes / stats.totalMinutes) * 100)}%`,
			])}
			rowClasses={byKey.map(([key]) => rowStyle(key))}
		/>
	{/if}

	{#if show('time-of-day')}
		<div class="stats-summary">
			<div><b>💤 Sleep</b> <span>{duration(stats.timeOfDay.sleep)}</span></div>
			<div>
				<b>🍃 Unlogged</b> <span>{duration(stats.timeOfDay.unlogged)}</span>
			</div>
			<div><b>🌅 Wake</b> <span>{clock(stats.timeOfDay.wake)}</span></div>
			<div><b>🌙 Bed</b> <span>{clock(stats.timeOfDay.bed)}</span></div>
		</div>
	{/if}

	{#if show('per-day')}
		<StackedBarChart points={chartPoints} {series} />
		<details>
			<summary class="muted">Per-day table</summary>
			<KeyValueTable
				columns={[{ label: 'Day' }, { label: 'Logged' }]}
				rows={stats.perDay.map((point) => [
					formatDay(point.date),
					formatHoursMinutes(point.total),
				])}
				rowClasses={stats.perDay.map(() => rowStyle(''))}
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
