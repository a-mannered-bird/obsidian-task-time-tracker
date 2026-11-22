<script lang="ts">
	import { Menu, type TFile } from 'obsidian'
	import { onMount } from 'svelte'
	import {
		addSuggestedGoals,
		deleteGoal,
		dismissGoalSuggestions,
		editGoalUnit,
		setGoalAchieved,
		setGoalFlow,
		setGoalTarget,
		stepGoal,
	} from 'commands/goalActions'
	import type { DailyLog } from 'core/dailyLogs'
	import { isSameDay, startOfDay } from 'core/dailyNotes'
	import {
		defaultGoalColor,
		describeRing,
		describeSuggestedTarget,
		goalLabel,
		dismissedOn,
		goalCards,
		goalSuggestions,
		groupGoalCards,
		METRIC_GOAL_EMOJI,
		TIME_GOAL_EMOJI,
		type GoalCard,
		type GoalSuggestion,
	} from 'core/goalCards'
	import {
		achievedField,
		targetField,
		typedFieldValue,
		type GoalField,
	} from 'core/goalEdits'
	import { formatGoalMinutes } from 'core/goals'
	import { formatLocalDate } from 'core/time'
	import { icon } from 'ui/icon'
	import { selectOnFocus } from 'ui/selectOnFocus'
	import { instantTooltip } from 'ui/tooltip'
	import type TaskTimeTracker from '../main'

	type Props = {
		plugin: TaskTimeTracker
		/** Null until the note's first write creates it. */
		log: DailyLog | null
		loading: boolean
	}

	const { plugin, log, loading }: Props = $props()

	let now = $state(new Date())
	// svelte-ignore state_referenced_locally -- the plugin never changes
	let indexReady = $state(plugin.vaultTasks.isReady)
	/** Bumped when a suggestion is dismissed: the settings are not reactive. */
	let dismissals = $state(0)

	const dayOver = $derived(
		log !== null &&
			(log.dayEnd !== null || startOfDay(log.date) < startOfDay(now))
	)
	const cards = $derived(goalCards(log?.tasks ?? [], now, dayOver))
	const groups = $derived(groupGoalCards(cards))
	const suggestions = $derived.by(() => {
		void dismissals
		if (!log || !indexReady) return []
		const day = startOfDay(log.date)
		return goalSuggestions(
			log.tasks,
			(name) => plugin.vaultTasks.recentGoals(name, day),
			dismissedOn(
				plugin.settings.dismissedGoalSuggestions,
				formatLocalDate(log.date)
			)
		)
	})

	/*
	 * The ring pops once when a goal is reached while the tab is open; the
	 * cards already done when it opened, or on another note, do not.
	 */
	let shownPath: string | null = null
	let doneIds = new Set<string>()
	let popped = $state(new Set<string>())
	$effect(() => {
		const path = log?.file.path ?? null
		const done = new Set(
			cards.filter((card) => card.state === 'done').map((card) => card.id)
		)
		if (path === shownPath) {
			const fresh = [...done].filter((id) => !doneIds.has(id))
			if (fresh.length) popped = new Set([...popped, ...fresh])
		} else {
			popped = new Set()
		}
		shownPath = path
		doneIds = done
	})

	function emoji(card: GoalCard): string {
		return card.goal.kind === 'time' ? TIME_GOAL_EMOJI : METRIC_GOAL_EMOJI
	}

	/** Commit a field on change (blur or Enter), unless left as it was. */
	function commit(
		event: Event & { currentTarget: HTMLInputElement },
		field: GoalField,
		write: (file: TFile, value: string) => Promise<void>
	) {
		const value = event.currentTarget.value
		if (value.trim() === field.value || !log) return
		void write(log.file, typedFieldValue(field, value))
	}

	function fieldKeys(
		event: KeyboardEvent & { currentTarget: HTMLInputElement },
		shown: string
	) {
		if (event.key === 'Enter') event.currentTarget.blur()
		if (event.key === 'Escape') {
			event.currentTarget.value = shown
			event.currentTarget.blur()
		}
	}

	/** Width in characters, for when `field-sizing` is not supported. */
	function size(value: string): number {
		return Math.max(2, value.length + 1)
	}

	function openMenu(event: MouseEvent, card: GoalCard) {
		if (!log) return
		const file = log.file
		const menu = new Menu()
		if (card.key.metric !== null) {
			menu.addItem((item) =>
				item
					.setTitle('Edit unit…')
					.setIcon('ruler')
					.onClick(() => void editGoalUnit(plugin, file, card.key))
			)
		}
		menu.addItem((item) =>
			item
				.setTitle('Delete goal')
				.setIcon('trash-2')
				.setWarning(true)
				.onClick(() => void deleteGoal(plugin, file, card.key))
		)
		menu.showAtMouseEvent(event)
	}

	function suggestedFrom(suggestion: GoalSuggestion): string {
		if (!log) return ''
		const sameWeek =
			startOfDay(log.date).valueOf() - startOfDay(suggestion.from).valueOf() <
			7 * 24 * 3600 * 1000
		return suggestion.from.toLocaleDateString(
			'en-US',
			sameWeek ? { weekday: 'long' } : { month: 'long', day: 'numeric' }
		)
	}

	function addSuggestions(list: GoalSuggestion[]) {
		if (log) void addSuggestedGoals(plugin, log.file, list)
	}

	async function dismiss(list: GoalSuggestion[]) {
		if (!log) return
		await dismissGoalSuggestions(
			plugin,
			log.date,
			list.map((suggestion) => suggestion.key)
		)
		dismissals++
	}

	onMount(() => {
		if (!indexReady) {
			void plugin.vaultTasks.ensureBuilt().then(() => (indexReady = true))
		}
		const tick = window.setInterval(() => (now = new Date()), 60 * 1000)
		return () => window.clearInterval(tick)
	})

	const isToday = $derived(log ? isSameDay(log.date, now) : true)
</script>

<div class="goals-tab" aria-busy={loading}>
	{#if suggestions.length > 1}
		<div class="goals-toolbar">
			<button onclick={() => void dismiss(suggestions)}>
				<span class="button-icon" use:icon={'x'}></span>
				Reject all suggestions
			</button>
			<button class="mod-cta" onclick={() => addSuggestions(suggestions)}>
				<span class="button-icon" use:icon={'list-plus'}></span>
				Add all suggestions
			</button>
		</div>
	{/if}

	<!-- One grid for every list, so the suggestions fill the row after the goals. -->
	<div class="cards">
		{#each groups as group (group.taskName ?? '')}
			{#if group.taskName}
				<h3 class="group-title">{group.taskName}</h3>
			{/if}
			<div class="card-list" role="list" aria-label={group.taskName ?? 'Goals'}>
				{#each group.cards as card (card.id)}
					{@const achieved =
						card.goal.kind === 'metric' ? achievedField(card.goal) : null}
					{@const target = targetField(card.goal)}
					<div
						class="goal-card"
						class:is-done={card.state === 'done'}
						class:is-over={card.state === 'over'}
						class:is-at-most={card.goal.atMost}
						role="listitem"
						aria-label={card.title}
						style:--goal-color={defaultGoalColor(card.goal)}
						style:--progress={card.state === 'done' ? 1 : card.progress}
					>
						<span class="title"
							>{group.taskName ? goalLabel(card.goal) : card.title}</span
						>
						<button
							class="menu-button"
							aria-label="Actions for {card.title}"
							use:icon={'more-horizontal'}
							onclick={(event) => openMenu(event, card)}
						></button>
						<div class="ring-row">
							{#if card.goal.kind === 'metric'}
								<button
									class="step"
									aria-label="Decrease {card.title}"
									disabled={!log}
									onclick={() =>
										log && void stepGoal(plugin, log.file, card.key, -1)}
									>−</button
								>
							{/if}
							<div
								class="ring"
								class:pops={popped.has(card.id)}
								role="img"
								aria-label={describeRing(card)}
							>
								<span>{emoji(card)}</span>
							</div>
							{#if card.goal.kind === 'metric'}
								<button
									class="step"
									aria-label="Increase {card.title}"
									disabled={!log}
									onclick={() =>
										log && void stepGoal(plugin, log.file, card.key, 1)}
									>+</button
								>
							{/if}
						</div>
						<div class="values">
							{#if achieved}
								<input
									class="field"
									aria-label="Result of {card.title}"
									type="number"
									step="any"
									min="0"
									inputmode="decimal"
									value={achieved.value}
									size={size(achieved.value)}
									use:selectOnFocus
									onchange={(event) =>
										commit(event, achieved, (file, value) =>
											setGoalAchieved(plugin, file, card.key, value)
										)}
									onkeydown={(event) => fieldKeys(event, achieved.value)}
								/>
							{:else}
								<span
									class="field is-readonly"
									aria-label="Time spent on {card.title}"
									use:instantTooltip={() => [
										'Value collected from your trackers',
									]}>{formatGoalMinutes(card.achieved ?? 0)}</span
								>
							{/if}
							<span aria-hidden="true">/</span>
							{#if target.type === 'number'}
								{#if target.atMost}
									<span class="at-most" use:instantTooltip={() => ['At most']}
										>&lt;</span
									>
								{/if}
								<input
									class="field"
									aria-label="Target of {card.title}"
									type="number"
									step="any"
									min="0"
									inputmode="decimal"
									value={target.value}
									size={size(target.value)}
									use:selectOnFocus
									onchange={(event) =>
										commit(event, target, (file, value) =>
											setGoalTarget(plugin, file, card.key, value)
										)}
									onkeydown={(event) => fieldKeys(event, target.value)}
								/>
							{:else}
								<input
									class="field"
									aria-label="Target of {card.title}"
									type="text"
									value={target.value}
									size={size(target.value)}
									onchange={(event) =>
										commit(event, target, (file, value) =>
											setGoalTarget(plugin, file, card.key, value)
										)}
									onkeydown={(event) => fieldKeys(event, target.value)}
								/>
							{/if}
							{#if card.goal.kind === 'metric' && card.goal.unit}
								<span class="unit">{card.goal.unit}</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/each}

		<div class="card-list" role="list" aria-label="Suggestions and new goals">
			{#each suggestions as suggestion (suggestion.id)}
				<div
					class="goal-card is-suggested"
					role="listitem"
					aria-label="Suggested {suggestion.title}"
				>
					<span class="title">{suggestion.title}</span>
					<button
						class="menu-button"
						aria-label="Dismiss {suggestion.title} for this day"
						use:icon={'x'}
						onclick={() => void dismiss([suggestion])}
					></button>
					<div class="ring is-ghost" aria-hidden="true">
						<span>
							{suggestion.goal.kind === 'time'
								? TIME_GOAL_EMOJI
								: METRIC_GOAL_EMOJI}
						</span>
					</div>
					<span class="suggested-target">
						{describeSuggestedTarget(suggestion.goal)}
					</span>
					<span class="suggested-from">
						Suggested · from {suggestedFrom(suggestion)}
					</span>
					<button
						class="mod-cta add-suggestion"
						onclick={() => addSuggestions([suggestion])}
					>
						{isToday ? 'Add to today' : 'Add to this day'}
					</button>
				</div>
			{/each}
			<div class="new-slot" role="listitem">
				<button
					class="goal-card is-new"
					onclick={() => void setGoalFlow(plugin)}
				>
					<span class="plus" use:icon={'plus'}></span>
					<span>Add goal</span>
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	.goals-tab {
		display: grid;
		gap: var(--size-4-3);
	}

	.goals-toolbar {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--size-4-2);
	}

	.goals-toolbar button {
		gap: var(--size-4-1);
	}

	.button-icon {
		display: inline-flex;
	}

	.button-icon :global(svg) {
		width: var(--icon-s);
		height: var(--icon-s);
	}

	/* Two columns in the sidebar, more in a wide pane, one below 310px. */
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr));
		gap: 10px;
	}

	.card-list {
		display: contents;
	}

	.group-title {
		grid-column: 1 / -1;
		margin: var(--size-4-2) 0 0;
		color: var(--text-muted);
		font-size: var(--font-ui-small);
		font-weight: var(--font-semibold);
	}

	.goal-card {
		position: relative;
		display: grid;
		justify-items: center;
		align-content: start;
		gap: 8px;
		min-width: 0;
		padding: 10px 10px 12px;
		border: 1px solid var(--background-modifier-border);
		border-radius: 10px;
		background: var(--background-primary);
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.goal-card.is-done {
		border-color: var(--color-green);
		background: color-mix(
			in srgb,
			var(--color-green) 9%,
			var(--background-primary)
		);
		box-shadow: 0 0 0 3px
			color-mix(in srgb, var(--color-green) 14%, transparent);
	}

	.goal-card.is-over {
		border-color: var(--color-red);
		background: color-mix(
			in srgb,
			var(--color-red) 7%,
			var(--background-primary)
		);
	}

	/* Clear of the corner button on both sides, so the text stays centered. */
	.title {
		max-width: 100%;
		padding: 2px 26px 0;
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
		line-height: 1.35;
		text-wrap: balance;
		overflow-wrap: break-word;
	}

	.menu-button {
		all: unset;
		position: absolute;
		top: 10px;
		right: 10px;
		display: inline-flex;
		cursor: pointer;
		color: var(--text-faint);
		border-radius: var(--radius-s);
	}

	.menu-button:hover {
		color: var(--text-normal);
	}

	.menu-button:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	.menu-button :global(svg) {
		width: var(--icon-s);
		height: var(--icon-s);
	}

	.ring-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	/*
	 * `--task-time-tracker-ring` is a registered number (styles.css), so it
	 * transitions: the ring fills or empties itself when the value changes,
	 * and fills up from empty when the card appears.
	 */
	.ring {
		--task-time-tracker-ring: var(--progress);
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 54px;
		height: 54px;
		border-radius: 50%;
		background: conic-gradient(
			var(--goal-color) calc(var(--task-time-tracker-ring) * 1turn),
			var(--background-modifier-border) 0
		);
		transition: --task-time-tracker-ring 700ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	/* An "at most" ring shows the limit left: it starts full and empties. */
	@starting-style {
		.ring {
			--task-time-tracker-ring: 0;
		}

		.goal-card.is-at-most .ring {
			--task-time-tracker-ring: 1;
		}
	}

	.goal-card.is-over .ring {
		background: var(--color-red);
	}

	.ring > span {
		display: grid;
		place-items: center;
		width: 42px;
		height: 42px;
		border-radius: 50%;
		background: var(--background-primary);
		font-size: 0.95rem;
	}

	.goal-card.is-done .ring > span {
		background: color-mix(
			in srgb,
			var(--color-green) 9%,
			var(--background-primary)
		);
	}

	.ring.pops {
		animation: goal-ring-pop 600ms ease-out 1;
	}

	@keyframes goal-ring-pop {
		40% {
			transform: scale(1.12);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.ring {
			transition: none;
		}

		.ring.pops {
			animation: none;
		}
	}

	.ring.is-ghost {
		background: repeating-conic-gradient(
			var(--background-modifier-border) 0 15deg,
			transparent 15deg 30deg
		);
		transition: none;
	}

	.ring.is-ghost > span {
		opacity: 0.7;
	}

	.step {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		padding: 0;
		border: 1px solid var(--background-modifier-border);
		border-radius: 50%;
		background: var(--background-primary);
		box-shadow: none;
		color: var(--text-muted);
		font-size: 0.95rem;
		line-height: 1;
	}

	.step:hover:enabled {
		background: var(--background-modifier-hover);
		color: var(--text-normal);
	}

	.values {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: 4px;
		font-size: var(--font-ui-small);
	}

	.field {
		field-sizing: content;
		min-width: 2ch;
		height: auto;
		padding: 0 4px;
		border-radius: 5px;
		font-size: var(--font-ui-small);
		line-height: 1.5;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	/* The − / + buttons step the result; no spinner inside the field. */
	.field[type='number'] {
		appearance: textfield;
	}

	.field[type='number']::-webkit-inner-spin-button,
	.field[type='number']::-webkit-outer-spin-button {
		appearance: none;
		margin: 0;
	}

	.field.is-readonly {
		border: 1px dashed var(--background-modifier-border);
		color: var(--text-muted);
	}

	.unit,
	.at-most {
		color: var(--text-muted);
	}

	.goal-card.is-suggested {
		border: 1.5px dashed var(--interactive-accent);
		background: color-mix(
			in srgb,
			var(--interactive-accent) 5%,
			var(--background-primary)
		);
	}

	.suggested-target {
		color: var(--text-muted);
		font-size: var(--font-ui-small);
	}

	.suggested-from {
		color: var(--text-accent);
		font-size: var(--font-ui-smaller);
	}

	.add-suggestion {
		height: auto;
		padding: 2px 12px;
		border-radius: 999px;
		font-size: var(--font-ui-smaller);
		font-weight: var(--font-semibold);
	}

	.new-slot {
		display: grid;
	}

	.goal-card.is-new {
		all: unset;
		box-sizing: border-box;
		display: grid;
		justify-items: center;
		align-content: center;
		gap: 8px;
		min-height: 150px;
		padding: 10px;
		border: 1.5px dashed var(--text-faint);
		border-radius: 10px;
		color: var(--text-muted);
		font-size: var(--font-ui-small);
		cursor: pointer;
	}

	.goal-card.is-new:hover {
		color: var(--text-normal);
		border-color: var(--text-muted);
	}

	.goal-card.is-new:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	.plus {
		display: grid;
		place-items: center;
		width: 54px;
		height: 54px;
		border: 1.5px dashed var(--text-faint);
		border-radius: 50%;
		color: var(--text-faint);
	}
</style>
