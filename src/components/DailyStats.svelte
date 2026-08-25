<script lang="ts">
	import type { App, WorkspaceLeaf } from 'obsidian'
	import { FileView } from 'obsidian'
	import { onMount } from 'svelte'
	import {
		minutesByTag,
		sortByMinutes,
		taskMinutes,
		totalMinutes,
	} from 'core/aggregate'
	import { addDays, isDailyNote } from 'core/dailyNotes'
	import type { DailyLog } from 'core/dailyLogs'
	import { tasksToIntervals, uncoveredMinutes } from 'core/intervals'
	import { getStyleByTags } from 'core/tags'
	import { formatDuration, getMinutesBetween } from 'core/time'
	import KeyValueTable from './KeyValueTable.svelte'
	import type TaskTimeTracker from '../main'

	type Props = {
		app: App
		plugin: TaskTimeTracker
	}

	const { app, plugin }: Props = $props()
	const MINUTES_PER_DAY = 24 * 60

	const tagMappings = $derived(plugin.settings.tagMappings)
	const styledMappings = $derived(
		tagMappings.filter((m) => m.bold || m.italic || m.underline)
	)

	let today = $state<DailyLog | null>(null)
	let yesterday = $state<DailyLog | null>(null)
	let loading = $state(true)
	let now = $state(new Date())

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

	async function loadFromLeaf(leaf: WorkspaceLeaf | null) {
		const view = leaf?.view
		if (!(view instanceof FileView) || !view.file) return
		if (!isDailyNote(plugin.getDailyLogStoreConfig().dailyNotes, view.file))
			return

		loading = true
		const log = await plugin.dailyLogs.loadFile(view.file)
		today = log
		yesterday = log
			? await plugin.dailyLogs.loadByDate(addDays(log.date, -1))
			: null
		loading = false
	}

	function reload() {
		void loadFromLeaf(app.workspace.getMostRecentLeaf())
	}

	onMount(() => {
		const leafRef = app.workspace.on('active-leaf-change', (leaf) => {
			void loadFromLeaf(leaf)
		})
		const unsubscribe = plugin.dailyLogs.onChange(reload)
		const tick = window.setInterval(() => (now = new Date()), 60 * 1000)
		reload()

		return () => {
			app.workspace.offref(leafRef)
			unsubscribe()
			window.clearInterval(tick)
		}
	})
</script>

{#if today}
	<h2>Daily view - {today.file.basename}</h2>
	<div class="stats-item">
		<b>⌛️ Time loggable: </b>
		<span>{format(loggableTime, MINUTES_PER_DAY)}</span>
	</div>
	<div class="stats-item">
		<b>⏱ Total time logged: </b>
		<span>{format(totalTime, loggableTime)}</span>
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
	Open a daily note
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
