<script lang="ts">
	import type { App } from 'obsidian'
	import type TaskTimeTracker from '../main'

	type Props = {
		app: App
		plugin: TaskTimeTracker
	}

	const { app, plugin }: Props = $props()
	void app
	void plugin
</script>

<p class="placeholder">Tracker actions coming next.</p>

<style>
	.placeholder {
		color: var(--text-muted);
	}
</style>
