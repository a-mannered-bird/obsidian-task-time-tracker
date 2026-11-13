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

	const dayStart = $derived(today?.dayStart ?? null)
	const dayEnd = $derived(today?.dayEnd ?? null)
	const previousDayEnd = $derived(yesterday?.dayEnd ?? null)

	const totalTime = $derived(totalMinutes(tasks, now))
	const coveredTime = $derived(coveredMinutes(tasksToIntervals(tasks, now)))
	const loggableTime = $derived(
		dayStart && dayEnd ? getMinutesBetween(dayStart, dayEnd) : null
	)
	const offTime = $derived(
		previousDayEnd && dayStart
			? getMinutesBetween(previousDayEnd, dayStart)
			: null
	)
	const remainingTime = $derived(
		dayEnd ? Math.max(0, getMinutesBetween(now, dayEnd)) : null
	)
	const unloggedTime = $derived.by(() => {
		if (!dayStart) return null
		const end = dayEnd && dayEnd < now ? dayEnd : now
		return uncoveredMinutes(tasksToIntervals(tasks, now), {
			start: dayStart,
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
		<b>⏸ Time off: </b>
		<span>{format(offTime, MINUTES_PER_DAY)}</span>
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
	/>

	<h3>Tags by total time spent</h3>

	<KeyValueTable
		columns={[{ label: 'Tag' }, { label: 'Total time spent' }]}
		rows={tagTimes.map(([tag, minutes]) => [
			tag,
			format(minutes, loggableTime),
		])}
	/>
{:else if loading}
	Loading
{:else}
	No daily note found
{/if}
