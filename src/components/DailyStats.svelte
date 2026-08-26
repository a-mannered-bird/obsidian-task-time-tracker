<script lang="ts">
	import { onMount } from 'svelte'
	import {
		minutesByTag,
		sortByMinutes,
		taskMinutes,
		totalMinutes,
	} from 'core/aggregate'
	import { addDays } from 'core/dailyNotes'
	import type { DailyLog } from 'core/dailyLogs'
	import {
		coveredMinutes,
		tasksToIntervals,
		uncoveredMinutes,
	} from 'core/intervals'
	import { getStyleByTags } from 'core/tags'
	import { formatDuration, getMinutesBetween } from 'core/time'
	import KeyValueTable from './KeyValueTable.svelte'
	import type TaskTimeTracker from '../main'

	type Props = {
		plugin: TaskTimeTracker
		log: DailyLog | null
		loading: boolean
	}

	const { plugin, log, loading }: Props = $props()
	const MINUTES_PER_DAY = 24 * 60

	const tagMappings = $derived(plugin.settings.tagMappings)
	const styledMappings = $derived(
		tagMappings.filter((m) => m.bold || m.italic || m.underline)
	)

	const today = $derived(log)
	let yesterday = $state<DailyLog | null>(null)
	let now = $state(new Date())

	$effect(() => {
		const current = log
		yesterday = null
		if (!current) return
		let cancelled = false
		void plugin.dailyLogs.loadByDate(addDays(current.date, -1)).then((prev) => {
			if (!cancelled) yesterday = prev
		})
		return () => {
			cancelled = true
		}
	})

	const tasks = $derived(
		(today?.tasks ?? [])
			.filter((task) => task.clocks.length > 0)
			.sort((a, b) => taskMinutes(b, now) - taskMinutes(a, now))
	)
	const tagTimes = $derived(sortByMinutes(minutesByTag(tasks, now)))

	const wakeTime = $derived(today?.wakeTime ?? null)
	const bedTime = $derived(today?.bedTime ?? null)
	const previousBedTime = $derived(yesterday?.bedTime ?? null)

	const totalTime = $derived(totalMinutes(tasks, now))
	const coveredTime = $derived(coveredMinutes(tasksToIntervals(tasks, now)))
	const loggableTime = $derived(
		wakeTime && bedTime ? getMinutesBetween(wakeTime, bedTime) : null
	)
	const sleepTime = $derived(
		previousBedTime && wakeTime
			? getMinutesBetween(previousBedTime, wakeTime)
			: null
	)
	const remainingTime = $derived(
		bedTime ? Math.max(0, getMinutesBetween(now, bedTime)) : null
	)
	const unloggedTime = $derived.by(() => {
		if (!wakeTime) return null
		const end = bedTime && bedTime < now ? bedTime : now
		return uncoveredMinutes(tasksToIntervals(tasks, now), {
			start: wakeTime,
			end,
		})
	})

	function format(minutes: number | null, total?: number | null) {
		return minutes === null
			? 'n/a'
			: formatDuration(minutes, total ?? undefined)
	}

	onMount(() => {
		const tick = window.setInterval(() => (now = new Date()), 60 * 1000)
		return () => window.clearInterval(tick)
	})
</script>

{#if today}
	<div class="stats-item">
		<b>⌛️ Time loggable: </b>
		<span>{format(loggableTime, MINUTES_PER_DAY)}</span>
	</div>
	<div class="stats-item">
		<b>⏱ Total time logged: </b>
		<span>{format(totalTime, loggableTime)}</span>
	</div>
	<div class="stats-item">
		<b>🕰 Time covered (overlaps once): </b>
		<span>{format(coveredTime, loggableTime)}</span>
	</div>
	<div class="stats-item">
		<b>⏳ Remaining time: </b>
		<span>{format(remainingTime, loggableTime)}</span>
	</div>
	<div class="stats-item">
		<b>💤 Time slept: </b>
		<span>{format(sleepTime, MINUTES_PER_DAY)}</span>
	</div>
	<div class="stats-item">
		<b>🍃 Time unlogged (so far): </b>
		<span>{format(unloggedTime, loggableTime)}</span>
	</div>

	<h3>Tasks by time spent</h3>

	<KeyValueTable
		columns={[{ label: 'Task' }, { label: 'Time spent' }]}
		rows={tasks.map((task) => [
			task.name,
			format(taskMinutes(task, now), loggableTime),
		])}
		rowClasses={tasks.map((task) => getStyleByTags(task.tags, tagMappings))}
	/>

	<h3>Tags by total time spent</h3>

	<KeyValueTable
		columns={[{ label: 'Tag' }, { label: 'Total time spent' }]}
		rows={tagTimes.map(([tag, minutes]) => [
			tag,
			format(minutes, loggableTime),
		])}
		rowClasses={tagTimes.map(([tag]) => getStyleByTags([tag], tagMappings))}
	/>
	{#if styledMappings.length}
		<p class="legend">
			{#each styledMappings as mapping (mapping.tag)}
				<span class={getStyleByTags([mapping.tag], tagMappings)}
					>{mapping.tag}</span
				>
			{/each}
		</p>
	{/if}
{:else if loading}
	Loading
{:else}
	No daily note found
{/if}

<style>
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75em;
		color: var(--text-muted);
	}

	.italic {
		font-style: italic;
	}

	.bold {
		font-weight: bold;
	}

	.underline {
		text-decoration: underline;
	}
</style>
