<script lang="ts">
	import type { TFile, App, WorkspaceLeaf, CachedMetadata } from 'obsidian'
	import { FileView } from 'obsidian'
	import { onMount } from 'svelte'
	import { getFileByPath } from 'utils/obsidian'
	import { formatTime, init } from 'utils/tracker'

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

	let datas = $derived(
		hasAllContents
			? init({ content: todaysContents, todaysMetadata, yesterdaysMetadata })
			: undefined
	)

	onMount(() => {
		app.workspace.on('active-leaf-change', loadDatas)
	})

	async function loadDatas(leaf: WorkspaceLeaf | null) {
		const view = leaf?.view
		if (view instanceof FileView && view.file) {
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

<h2>Daily view</h2>
{#if datas}
	<b>⌛️ Time Loggable: </b>
	<br />
	<span>{formatTime(datas.stats.loggableTime, 1440)}</span>
	<br />
	<b>⏱ Total Time logged: </b>
	<br />
	<span>{formatTime(datas.stats.totalTime, datas.stats.loggableTime)}</span>
	<br />
	<b>⏳ Remaining Time: </b>
	<br />
	<span>{formatTime(datas.stats.remainingTime, datas.stats.loggableTime)}</span>
	<br />
	<b>💤 Time Slept: </b>
	<br />
	<span>{formatTime(datas.stats.sleepTime, 1440)}</span>
	<br />
	<b>🍃 Time Unlogged (so far): </b>
	<br />
	<span>{formatTime(datas.stats.unloggedTime, datas.stats.loggableTime)}</span>
	<br />

	<h3>Tasks by Time Spent</h3>
	<i>Underline = Project / Bold = Tracker / Italic = Routine</i>

	<table>
		<thead>
			<tr>
				<th>Task</th>
				<th>Time Spent</th>
			</tr>
		</thead>
		<tbody>
			{#each datas.sortedTasks as task}
				<tr>
					<!-- <td>{formatName(task.name, task.tags)}</td> TODO: Format according to tags -->
					<td>{task.name}</td>
					<td>{formatTime(task.totalMinutes, datas.stats.loggableTime)}</td>
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
			{#each datas.sortedTagTimeArray as [tag, totalMinutes]}
				<tr>
					<!-- <td>{formatName(tag)}</td> TODO: Format according to tags -->
					<td>{tag}</td>
					<td>{formatTime(totalMinutes, datas.stats.loggableTime)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{:else if todaysFile === undefined || todaysContents === undefined}
	Loading
{:else}
	Select a file
{/if}

<style>
</style>
