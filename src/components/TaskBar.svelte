<script lang="ts">
	import { Platform, prepareFuzzySearch } from 'obsidian'
	import { loadVaultEntries } from 'commands/tracking'
	import { addToPlan, startTask, type StartMode } from 'commands/trackerActions'
	import { isRunning } from 'core/note'
	import {
		entryLabel,
		prepareWordSearch,
		type VaultPickerEntries,
	} from 'core/taskPicker'
	import { taskChoice, type TaskChoice } from 'core/toggle'
	import {
		barOptions,
		barSuggestions,
		startActions,
		type BarOption,
	} from 'core/tracker'
	import type { Task } from 'types/tasks'
	import { icon } from 'ui/icon'
	import type TaskTimeTracker from '../main'

	type Props = {
		plugin: TaskTimeTracker
		tasks: Task[]
		placeholder: string
	}

	const { plugin, tasks, placeholder }: Props = $props()

	/** Other notes' tasks listed before anything is typed, or once typed. */
	const OTHER_LIMIT = 8

	const LISTBOX_ID = 'task-time-tracker-bar-options'

	let query = $state('')
	let open = $state(false)
	let selected = $state(0)
	let vault = $state<VaultPickerEntries | null>(null)
	let input = $state<HTMLInputElement | null>(null)

	const actions = $derived(startActions(tasks.filter(isRunning)))
	const suggestions = $derived(
		barSuggestions(
			query,
			tasks,
			vault,
			prepareWordSearch(query, prepareFuzzySearch),
			OTHER_LIMIT
		)
	)
	const options = $derived(barOptions(suggestions))
	const current = $derived(open ? (options[selected] ?? null) : null)

	function optionId(index: number) {
		return `${LISTBOX_ID}-${index}`
	}

	function label(option: BarOption): string {
		const { tagMappings } = plugin.settings
		if (option.kind === 'create') {
			return `➕ Create "${[option.name, ...option.tags].join(' ')}"`
		}
		return entryLabel(option, tagMappings)
	}

	function meta(option: BarOption): string {
		if (option.kind === 'note') return isRunning(option.task) ? 'running' : ''
		if (option.kind === 'vault') {
			const count = option.info.noteCount
			return `${count} note${count === 1 ? '' : 's'}`
		}
		return ''
	}

	function choiceOf(option: BarOption): TaskChoice {
		if (option.kind === 'note') return taskChoice(option.task)
		if (option.kind === 'vault') {
			return { name: option.info.name, tags: option.info.tags, running: false }
		}
		return { name: option.name, tags: option.tags, running: false }
	}

	function reset() {
		query = ''
		selected = 0
		open = false
		input?.blur()
	}

	function run(option: BarOption | null, mode: StartMode) {
		if (!option) {
			input?.focus()
			return
		}
		reset()
		void startTask(plugin, choiceOf(option), mode)
	}

	function addOption(option: BarOption) {
		if (option.kind !== 'create') return
		reset()
		void addToPlan(plugin, option.name, option.tags)
	}

	function onFocus() {
		open = true
		if (plugin.settings.includeVaultTasks && !vault) {
			void loadVaultEntries(plugin).then((entries) => (vault = entries))
		}
	}

	function onInput() {
		open = true
		selected = 0
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault()
			open = true
			const step = event.key === 'ArrowDown' ? 1 : -1
			const count = options.length
			if (count > 0) selected = (selected + step + count) % count
		} else if (event.key === 'Enter') {
			event.preventDefault()
			const alongside = Platform.isMacOS ? event.metaKey : event.ctrlKey
			if (alongside && actions.alongside) run(current, 'alongside')
			else run(current, actions.primary)
		} else if (event.key === 'Escape') {
			if (open) {
				event.preventDefault()
				open = false
			}
		}
	}

	// Mouse presses inside the list must not blur the input first, which
	// would close the list before the click lands.
	function keepFocus(event: MouseEvent) {
		event.preventDefault()
	}

	function onSelect(index: number) {
		selected = index
	}
</script>

<div class="bar">
	<div class="field-wrap">
		<div class="field">
			<span class="field-icon" use:icon={'search'}></span>
			<input
				bind:this={input}
				bind:value={query}
				type="text"
				role="combobox"
				aria-label="Task to start"
				aria-expanded={open && options.length > 0}
				aria-controls={LISTBOX_ID}
				aria-autocomplete="list"
				aria-activedescendant={current ? optionId(selected) : undefined}
				{placeholder}
				onfocus={onFocus}
				onblur={() => (open = false)}
				oninput={onInput}
				onkeydown={onKeydown}
			/>
		</div>

		{#if open && options.length > 0}
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -- keeps focus on the combobox -->
			<ul
				id={LISTBOX_ID}
				class="options"
				role="listbox"
				aria-label="Suggestions"
				onmousedown={keepFocus}
			>
				{#if suggestions.today.length > 0}
					<li class="group" role="presentation">Today</li>
				{/if}
				{#each options as option, index (index)}
					{#if index === suggestions.today.length && suggestions.other.length > 0}
						<li class="group" role="presentation">Other notes</li>
					{/if}
					{#if option.kind === 'create' && options.length > 1}
						<li class="separator" role="presentation"></li>
					{/if}
					<li
						id={optionId(index)}
						class="option"
						class:is-selected={index === selected}
						class:create={option.kind === 'create'}
						role="option"
						aria-selected={index === selected}
						onmousemove={() => onSelect(index)}
						onclick={() => run(option, actions.primary)}
						onkeydown={() => {}}
					>
						<span class="option-label">{label(option)}</span>
						{#if option.kind === 'create'}
							<button
								class="add-button"
								tabindex="-1"
								onclick={(event) => {
									event.stopPropagation()
									addOption(option)
								}}
							>
								Add to list
							</button>
						{:else if meta(option)}
							<span class="option-meta">{meta(option)}</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<button
		class="mod-cta start-button"
		onmousedown={keepFocus}
		onclick={() => run(current, actions.primary)}
	>
		<span use:icon={'play'}></span>
		{actions.primary === 'switch' ? 'Switch' : 'Start'}
	</button>
	{#if actions.alongside}
		<button
			class="alongside-button"
			aria-label="Start alongside"
			title="Start alongside"
			use:icon={'plus'}
			onmousedown={keepFocus}
			onclick={() => run(current, 'alongside')}
		></button>
	{/if}
</div>

<style>
	/* The list opens under the whole bar, buttons included: the field
	   alone is too narrow for task names in a sidebar. */
	.bar {
		position: relative;
		display: flex;
		gap: 0.5em;
		align-items: stretch;
	}

	.field-wrap {
		flex: 1;
		min-width: 0;
	}

	.field {
		display: flex;
		align-items: center;
		gap: 0.4em;
		height: 100%;
		padding: 0 0.6em;
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--input-radius);
		background: var(--background-modifier-form-field);
		color: var(--text-muted);
	}

	.field:focus-within {
		border-color: var(--interactive-accent);
		box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
	}

	.field-icon {
		display: inline-flex;
	}

	.field input {
		all: unset;
		flex: 1;
		min-width: 0;
		padding: 0.5em 0;
		color: var(--text-normal);
	}

	.field input::placeholder {
		color: var(--text-faint);
	}

	.start-button,
	.alongside-button {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
	}

	.options {
		position: absolute;
		z-index: var(--layer-popover);
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		margin: 0;
		padding: 0.3em;
		list-style: none;
		max-height: 22em;
		overflow-y: auto;
		background: var(--background-primary);
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow-s);
	}

	.group {
		padding: 0.6em 0.6em 0.2em;
		font-size: var(--font-ui-smaller);
		font-weight: var(--font-semibold);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.separator {
		height: 1px;
		margin: 0.3em 0.4em;
		background: var(--background-modifier-border);
	}

	.option {
		display: flex;
		align-items: center;
		gap: 0.6em;
		min-height: 2.2em;
		padding: 0 0.6em;
		border-radius: var(--radius-s);
		cursor: pointer;
	}

	.option.is-selected {
		background: var(--background-modifier-hover);
	}

	.option-label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.option.create .option-label {
		color: var(--text-accent);
	}

	.option-meta {
		font-size: var(--font-ui-smaller);
		color: var(--text-muted);
	}

	.add-button {
		font-size: var(--font-ui-smaller);
	}
</style>
