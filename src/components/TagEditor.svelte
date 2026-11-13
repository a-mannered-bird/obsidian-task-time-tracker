<script lang="ts">
	import type { TFile } from 'obsidian'
	import { onMount } from 'svelte'
	import { setTaskTags } from 'commands/trackerActions'
	import { tagSuggestions } from 'core/rowTags'
	import { TAG_FORMAT_HELP, typedTag } from 'core/taskEdits'
	import type { Task } from 'types/tasks'
	import { TagSuggest } from 'ui/TagSuggest'
	import type TaskTimeTracker from '../main'

	type Props = {
		plugin: TaskTimeTracker
		file: TFile
		task: Task
		/** The note's tasks, whose tags are suggested first. */
		noteTasks: Task[]
		onclose: () => void
	}

	const { plugin, file, task, noteTasks, onclose }: Props = $props()

	// Edited from the tags shown when it opened, not followed live.
	// svelte-ignore state_referenced_locally
	let tags = $state([...new Set(task.tags)])
	let error = $state('')
	let input: HTMLInputElement

	function addTyped() {
		if (!input.value.trim()) return
		const tag = typedTag(input.value)
		if (!tag) {
			error = TAG_FORMAT_HELP
			return
		}
		error = ''
		if (!tags.includes(tag)) tags.push(tag)
		input.value = ''
	}

	function remove(tag: string) {
		tags = tags.filter((other) => other !== tag)
		input.focus()
	}

	function save() {
		addTyped()
		if (error) return
		onclose()
		void setTaskTags(plugin, file, task.name, [...tags])
	}

	function onInputKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault()
			if (input.value.trim()) addTyped()
			else save()
		} else if (event.key === ',') {
			event.preventDefault()
			addTyped()
		} else if (event.key === 'Backspace' && !input.value) {
			const last = tags[tags.length - 1]
			if (last) remove(last)
		}
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return
		event.preventDefault()
		// A half-typed tag goes first, so Escape never loses the chips edited.
		if (input.value) input.value = ''
		else onclose()
	}

	onMount(() => {
		void plugin.vaultTasks.ensureBuilt()
		const suggest = new TagSuggest(
			plugin.app,
			input,
			() => tagSuggestions(noteTasks, plugin.vaultTasks.allTags(), tags),
			addTyped
		)
		input.focus()
		return () => suggest.close()
	})
</script>

<div
	class="tag-editor"
	role="dialog"
	aria-label={`Tags of ${task.name}`}
	tabindex="-1"
	onkeydown={onKeyDown}
>
	<p class="tag-editor-title">Tags of {task.name}</p>
	<div class="task-time-tracker-chips" role="group" aria-label="Tags">
		{#each tags as tag (tag)}
			<span class="task-time-tracker-chip">
				<span>{tag}</span>
				<button
					class="task-time-tracker-chip-remove"
					aria-label={`Remove ${tag}`}
					onclick={() => remove(tag)}>×</button
				>
			</span>
		{/each}
		<input
			bind:this={input}
			type="text"
			class="task-time-tracker-chips-input"
			aria-label="Add a tag"
			placeholder="Add a tag…"
			onkeydown={onInputKeyDown}
		/>
	</div>
	{#if error}
		<p class="task-time-tracker-prompt-error">{error}</p>
	{/if}
	<div class="tag-editor-buttons">
		<button onclick={onclose}>Cancel</button>
		<button class="mod-cta" onclick={save}>Save</button>
	</div>
</div>

<style>
	.tag-editor {
		position: absolute;
		top: calc(100% + 2px);
		left: 0;
		right: 0;
		z-index: var(--layer-popover);
		padding: 0.6em 0.75em;
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-m);
		background: var(--background-primary);
		box-shadow: var(--shadow-s);
		cursor: default;
	}

	.tag-editor-title {
		margin: 0;
		font-weight: var(--font-semibold);
	}

	.tag-editor :global(.task-time-tracker-chips) {
		margin: 0.5em 0;
	}

	.tag-editor-buttons {
		display: flex;
		justify-content: flex-end;
		gap: 0.5em;
	}
</style>
