<script lang="ts">
	import { onMount } from 'svelte'
	import { loadRangeStats, type LoadedRangeStats } from 'core/loadRangeStats'
	import type { StatsBlockOptions } from 'core/statsOptions'
	import { getStyleByTags } from 'core/tags'
	import { formatClockMinutes, formatHoursMinutes } from 'core/time'
	import KeyValueTable from './KeyValueTable.svelte'
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

	{#if show('total') && stats.byKey.length}
		<KeyValueTable
			columns={[
				{ label: options.groupBy === 'tag' ? 'Tag' : 'Task' },
				{ label: 'Time spent' },
				{ label: 'Share' },
			]}
			rows={stats.byKey.map(([key, minutes]) => [
				key,
				formatHoursMinutes(minutes),
				`${Math.round((minutes / stats.totalMinutes) * 100)}%`,
			])}
			rowClasses={stats.byKey.map(([key]) => rowStyle(key))}
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
		<KeyValueTable
			columns={[{ label: 'Day' }, { label: 'Logged' }]}
			rows={stats.perDay.map((point) => [
				formatDay(point.date),
				formatHoursMinutes(point.total),
			])}
			rowClasses={stats.perDay.map(() => rowStyle(''))}
		/>
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
