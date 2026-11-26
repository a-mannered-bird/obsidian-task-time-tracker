<script lang="ts">
	import type TaskTimeTracker from '../main'
	import type { ManagerTab } from './managerTable.svelte'
	import TagManager from './TagManager.svelte'
	import TaskManager from './TaskManager.svelte'

	type Props = {
		plugin: TaskTimeTracker
		close: () => void
		tab: ManagerTab
		/** The Tasks tab's filter when it opens. */
		taskQuery: string
	}

	// Both tabs stay mounted, so each keeps its filter, sort and selection.
	let { plugin, close, tab, taskQuery }: Props = $props()

	const TABS: { id: ManagerTab; label: string }[] = [
		{ id: 'tasks', label: 'Tasks' },
		{ id: 'tags', label: 'Tags' },
	]

	function showTasks(tag: string) {
		taskQuery = tag
		tab = 'tasks'
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
	<TagManager {plugin} {showTasks} />
</div>
