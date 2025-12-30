<script lang="ts">
	import type { TFile, App, WorkspaceLeaf } from 'obsidian'
	import { FileView } from 'obsidian'
	import { onMount } from 'svelte'
	import { getFileByPath } from 'utils/obsidian'

	type Props = {
		app: App
	}

	const { app }: Props = $props()

	let todaysFile: TFile | null | undefined = $state()
	let yesterdaysFile: TFile | null | undefined = $state()
	let todaysContents: string | null | undefined = $state()
	$inspect(todaysFile)

	onMount(() => {
		app.workspace.on('active-leaf-change', loadDatas)
	})

	async function loadDatas(leaf: WorkspaceLeaf | null) {
		const view = leaf?.view
		if (view instanceof FileView) {
			todaysFile = view.file
			yesterdaysFile = await getFileByPath(
				app,
				`Journal/${getYesterdaysStringDate()}.md`
			)
			todaysContents = view.file ? await app.vault.read(view.file) : null
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
<div>{todaysFile?.basename} {yesterdaysFile?.basename} {todaysContents}</div>

<style>
</style>
