<script lang="ts">
	import type TaskTimeTracker from '../main'
	import type { ManagerTab } from './managerTable.svelte'
	import MetricManager from './MetricManager.svelte'
	import TagManager from './TagManager.svelte'
	import TaskManager from './TaskManager.svelte'

	type Props = {
		plugin: TaskTimeTracker
		close: () => void
		tab: ManagerTab
		/** The Tasks tab's filter when it opens. */
		taskQuery: string
		/** The Tags tab's filter when it opens. */
		tagQuery: string
		/** The Metrics tab's filter when it opens. */
		metricQuery: string
	}

	// Both tabs stay mounted, so each keeps its filter, sort and selection.
	let { plugin, close, tab, taskQuery, tagQuery, metricQuery }: Props = $props()

	const TABS: { id: ManagerTab; label: string }[] = [
		{ id: 'tasks', label: 'Tasks' },
		{ id: 'tags', label: 'Tags' },
		{ id: 'metrics', label: 'Goals' },
	]

	function showTasks(query: string) {
		taskQuery = query
		tab = 'tasks'
	}

	function showTags(query: string) {
		tagQuery = query
		tab = 'tags'
	}
</script>

<div class="task-time-tracker-tabs" role="tablist">
	{#each TABS as entry (entry.id)}
		<button
			type="button"
			role="tab"
			aria-selected={tab === entry.id}
			class:active={tab === entry.id}
			onclick={() => (tab = entry.id)}
		>
			{entry.label}
		</button>
	{/each}
</div>

<div role="tabpanel" aria-label="Tasks" hidden={tab !== 'tasks'}>
	<TaskManager {plugin} {close} bind:query={taskQuery} />
</div>
<div role="tabpanel" aria-label="Tags" hidden={tab !== 'tags'}>
	<TagManager {plugin} {showTasks} bind:query={tagQuery} />
</div>
<div role="tabpanel" aria-label="Goals" hidden={tab !== 'metrics'}>
	<MetricManager {plugin} {showTasks} {showTags} bind:query={metricQuery} />
</div>
