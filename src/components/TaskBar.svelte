<script lang="ts">
	import { Platform, prepareFuzzySearch, type SearchResult } from 'obsidian'
	import { loadVaultEntries } from 'commands/tracking'
	import { addToPlan } from 'commands/plan'
	import { startTask, type StartMode } from 'commands/trackerActions'
	import { isRunning } from 'core/note'
	import {
		groupBreaks,
		prepareWordSearch,
		suggestionChoice,
		suggestionGroup,
		suggestionLabel,
		suggestionMeta,
		suggestionRunning,
		taskSuggestions,
		type TaskSuggestion,
		type VaultPickerEntries,
	} from 'core/taskPicker'
	import { primaryStartIcon, startActions } from 'core/tracker'
	import type { Task } from 'types/tasks'
	import { icon } from 'ui/icon'
	import { instantTooltip } from 'ui/tooltip'
	import type TaskTimeTracker from '../main'

	type Props = {
		plugin: TaskTimeTracker
		tasks: Task[]
		placeholder: string
		/** Heading over the note's tasks: `Today`, or the note's day. */
		noteHeading: string
	}

	const { plugin, tasks, placeholder, noteHeading }: Props = $props()

	/** Other notes' tasks listed before anything is typed, or once typed. */
	const OTHER_LIMIT = 8

	const LISTBOX_ID = 'task-time-tracker-bar-options'

	let query = $state('')
	let open = $state(false)
	let selected = $state(0)
	let vault = $state<VaultPickerEntries | null>(null)
	let input = $state<HTMLInputElement | null>(null)

	const actions = $derived(startActions(tasks.filter(isRunning)))
	const options = $derived(
		taskSuggestions({
			query,
			tasks,
			noteNames: tasks.map((task) => task.name),
			vault,
			match: prepareWordSearch(query, prepareFuzzySearch),
			otherLimit: OTHER_LIMIT,
			offersCreate: true,
		})
	)
	const breaks = $derived(
		groupBreaks(options.map(suggestionGroup), noteHeading)
	)
	const current = $derived(open ? (options[selected] ?? null) : null)

	function optionId(index: number) {
		return `${LISTBOX_ID}-${index}`
	}

	type Option = TaskSuggestion<SearchResult>

	function reset() {
		query = ''
		selected = 0
		open = false
		input?.blur()
	}

	function run(option: Option | null, mode: StartMode) {
		if (!option) {
			input?.focus()
			return
		}
		reset()
		void startTask(plugin, suggestionChoice(option), mode)
	}

	function addOption(option: Option) {
		if (option.kind !== 'create') return
		reset()
		void addToPlan(plugin, option.name, option.tags)
	}

	function onFocus() {
		open = true
		if (!vault) {
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
				{#each options as option, index (index)}
					{@const groupBreak = breaks.get(index)}
					{#if groupBreak && 'heading' in groupBreak}
						<li class="group" role="presentation">{groupBreak.heading}</li>
					{:else if groupBreak}
						<li class="separator" role="presentation"></li>
					{/if}
					<li
						id={optionId(index)}
						class="option"
						class:is-selected={index === selected}
						class:create={option.kind === 'create'}
						class:running={suggestionRunning(option)}
						role="option"
						aria-selected={index === selected}
						onmousemove={() => onSelect(index)}
						onclick={() => run(option, actions.primary)}
						onkeydown={() => {}}
					>
						<span class="option-label"
							>{suggestionLabel(option, plugin.settings.tagMappings)}</span
						>
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
						{:else if suggestionMeta(option)}
							<span class="option-meta">{suggestionMeta(option)}</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<button
		class="mod-cta start-button"
		aria-label={actions.primary === 'switch' ? 'Switch' : 'Start'}
		use:instantTooltip
		use:icon={primaryStartIcon(actions.primary)}
		onmousedown={keepFocus}
		onclick={() => run(current, actions.primary)}
	></button>
	{#if actions.alongside}
		<button
			class="mod-cta alongside-button"
			aria-label="Start alongside"
			use:instantTooltip
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
		align-items: baseline;
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

	/* Centering the boxes leaves the icon off by a font-dependent amount:
	   the icon's bottom sits on the text baseline instead, then moves so
	   the magnifier's circle (centered 11/24 down the Lucide glyph) meets
	   the middle of the capitals, whatever the font size. */
	.field-icon {
		display: inline-flex;
		translate: 0 calc(100% * 13 / 24 - 0.5cap);
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

	/* Auto height lets the bar stretch them to the field's height, which
	   Obsidian's fixed button height would otherwise override. */
	.start-button,
	.alongside-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: auto;
		padding: 0 var(--size-4-3);
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
		padding: 0.8em 0.6em 0.5em;
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

	.option.running .option-label {
		font-weight: var(--font-semibold);
		color: var(--text-accent);
	}

	.option.running .option-meta {
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
