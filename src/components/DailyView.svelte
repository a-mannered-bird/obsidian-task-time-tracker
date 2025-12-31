<script lang="ts">
	import type { TFile, App, WorkspaceLeaf, CachedMetadata } from 'obsidian'
	import { FileView } from 'obsidian'
	import { onMount } from 'svelte'
	import type { Interval } from 'types/tasks'
	import { getFileByPath } from 'utils/obsidian'
	import {
		aggregateTimeByTags,
		calculateTasksTotalTime,
		formatTime,
		getAvailableIntervals,
		getMinutesBetween,
		parseTasks,
		sortTagTimeArray,
		sortTasksByTime,
	} from 'utils/tracker'

	type Props = {
		app: App
	}

	const { app }: Props = $props()

	let todaysFile: TFile | null | undefined = $state()
	let yesterdaysFile: TFile | null | undefined = $state()
	let todaysContents: string | null | undefined = $state()
	let todaysMetadata: CachedMetadata | null | undefined = $state()
	let yesterdaysMetadata: CachedMetadata | null | undefined = $state()
	let hasAllContents = $derived(todaysFile && yesterdaysFile && todaysContents)
	let tasks = $derived.by(() => {
		if (!todaysContents) return []
		return sortTasksByTime(parseTasks(todaysContents))
	})
	let tagTimes = $derived(sortTagTimeArray(aggregateTimeByTags(tasks)))

	// Stats
	const oldBedTime = $derived(
		new Date(yesterdaysMetadata?.frontmatter?.bed_time)
	)
	const newBedTime = $derived(new Date(todaysMetadata?.frontmatter?.bed_time))
	const wakeTime = $derived(new Date(todaysMetadata?.frontmatter?.wake_time))
	let totalTime = $derived(calculateTasksTotalTime(tasks))
	let sleepTime = $derived(getMinutesBetween(oldBedTime, wakeTime))
	let loggableTime = $derived(getMinutesBetween(wakeTime, newBedTime))
	let nowBedDifference = $derived(getMinutesBetween(new Date(), newBedTime))
	let remainingTime = $derived(nowBedDifference < 0 ? 0 : nowBedDifference)
	let unloggedTime = $derived.by(() => {
		const dayInterval = {
			startTime: new Date(wakeTime),
			endTime: nowBedDifference < 0 ? new Date(newBedTime) : new Date(),
		}

		let tasksIntervals: Interval[] = []
		tasks.forEach((t) => {
			tasksIntervals = tasksIntervals.concat([...t.intervals])
		})
		const notLoggedIntervals = getAvailableIntervals(
			tasksIntervals,
			dayInterval
		)
		return notLoggedIntervals.totalAvailable
	})

	onMount(() => {
		app.workspace.on('active-leaf-change', loadDatas)
		loadDatas(app.workspace.getMostRecentLeaf())
	})

	async function loadDatas(leaf: WorkspaceLeaf | null) {
		const view = leaf?.view
		if (view instanceof FileView && view.file) {
			// TODO: Add settings to what qualifies as an appropriate file
			if (!view.file.path.includes('Journal')) return
			todaysFile = view.file
			yesterdaysFile = await getFileByPath(
				app,
				`Journal/${getYesterdaysStringDate()}.md`
			)
			todaysMetadata = app.metadataCache.getFileCache(todaysFile)
			yesterdaysMetadata = app.metadataCache.getFileCache(yesterdaysFile)
			todaysContents = await app.vault.read(view.file)
		}
	}

	function getYesterdaysStringDate() {
		if (!todaysFile) return ''
		const y = new Date(todaysFile.basename) // First date
		y.setDate(y.getDate() - 1)
		const year = y.getFullYear()
		const month = String(y.getMonth() + 1).padStart(2, '0')
		const day = String(y.getDate()).padStart(2, '0')
		return `${year}-${month}-${day}`
	}
</script>

{#if hasAllContents}
	<h2>Daily view - {todaysFile?.basename}</h2>
	<div class="stats-item">
		<b>⌛️ Time Loggable: </b>
		<span>{formatTime(loggableTime, 1440)}</span>
	</div>
	<div class="stats-item">
		<b>⏱ Total Time logged: </b>
		<span>{formatTime(totalTime, loggableTime)}</span>
	</div>
	<div class="stats-item">
		<b>⏳ Remaining Time: </b>
		<span>{formatTime(remainingTime, loggableTime)}</span>
	</div>
	<div class="stats-item">
		<b>💤 Time Slept: </b>
		<span>{formatTime(sleepTime, 1440)}</span>
	</div>
	<div class="stats-item">
		<b>🍃 Time Unlogged (so far): </b>
		<span>{formatTime(unloggedTime, loggableTime)}</span>
	</div>

	<h3>Tasks by Time Spent</h3>

	<table>
		<thead>
			<tr>
				<th>Task</th>
				<th>Time Spent</th>
			</tr>
		</thead>
		<tbody>
			{#each tasks as task}
				<tr>
					<!-- <td>{formatName(task.name, task.tags)}</td> TODO: Format according to tags -->
					<td>{task.name}</td>
					<td>{formatTime(task.totalMinutes, loggableTime)}</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<h3>Tags by Total Time Spent</h3>

	<table>
		<thead>
			<tr>
				<th>Tag</th>
				<th>Total Time Spent</th>
			</tr>
		</thead>
		<tbody>
			{#each tagTimes as [tag, totalMinutes]}
				<tr>
					<!-- <td>{formatName(tag)}</td> TODO: Format according to tags -->
					<td>{tag}</td>
					<td>{formatTime(totalMinutes, loggableTime)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<br />
	<i>Underline = Project / Bold = Tracker / Italic = Routine</i>
{:else if todaysFile === undefined || todaysContents === undefined}
	Loading
{:else}
	Select a file
{/if}

<style>
</style>
