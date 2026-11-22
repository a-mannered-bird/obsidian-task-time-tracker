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
		streakSkipsMissingDays,
		toggleStreakSkip,
	} from 'commands/goalActions'
	import type { DailyLog } from 'core/dailyLogs'
	import { isSameDay, startOfDay } from 'core/dailyNotes'
	import {
		describeRing,
		describeSuggestedTarget,
		goalLabel,
		dismissedOn,
		goalCards,
		goalSuggestions,
		groupGoalCards,
		isDayOver,
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
	import { goalColor, goalEmoji, goalStreak, stampText } from 'core/goalStyle'
	import { formatLocalDate } from 'core/time'
	import { icon } from 'ui/icon'
	import { suggestionFlight } from 'ui/suggestionFlight'
	import { selectOnFocus } from 'ui/selectOnFocus'
	import { instantTooltip } from 'ui/tooltip'
	import type TaskTimeTracker from '../main'

	type Props = {
		plugin: TaskTimeTracker
		/** Null until the note's first write creates it. */
		log: DailyLog | null
		loading: boolean
		/** A goal (by id) to edit as the tab opens, from a tracker bar. */
		focusGoal?: string | null
		onfocused?: () => void
	}

	const { plugin, log, loading, focusGoal = null, onfocused }: Props = $props()

	// svelte-ignore state_referenced_locally -- settings apply on a view reload
	const { metricSettings, doneBadge, stampTexts } = plugin.settings

	/** The card elements by goal id, to focus one asked for. */
	const cardElements = new Map<string, HTMLElement>()
	function registerCard(node: HTMLElement, id: string) {
		cardElements.set(id, node)
		return {
			destroy() {
				if (cardElements.get(id) === node) cardElements.delete(id)
			},
		}
	}

	$effect(() => {
		if (!focusGoal || loading) return
		const card = cardElements.get(focusGoal)
		if (!card) return
		card.scrollIntoView({ block: 'nearest' })
		card.querySelector('input')?.focus()
		onfocused?.()
	})

	/** Bumped when a goal's streak setting changes: settings are not reactive. */
	let streakSettings = $state(0)

	/** The days in a row the goal was met, for the streak flame. */
	function streak(card: GoalCard): number {
		void streakSettings
		if (!log || !indexReady) return 0
		return goalStreak(
			plugin.vaultTasks.occurrences(card.key.taskName),
			card.key,
			log.date,
			streakSkipsMissingDays(plugin, card.key)
		)
	}

	let now = $state(new Date())

	// A suggestion and the goal card it becomes share their id (the goal key).
	const flight = suggestionFlight()
	// svelte-ignore state_referenced_locally -- the plugin never changes
	let indexReady = $state(plugin.vaultTasks.isReady)
	/** Bumped when a suggestion is dismissed: the settings are not reactive. */
	let dismissals = $state(0)

	const dayOver = $derived(log !== null && isDayOver(log, now))
	const cards = $derived(goalCards(log?.tasks ?? [], now, dayOver))
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

	const groups = $derived(
		groupGoalCards(
			(log?.tasks ?? []).map((task) => task.name),
			cards,
			suggestions
		)
	)

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
		return goalEmoji(card.goal, metricSettings)
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
				.setTitle('Skip days without it in streaks')
				.setIcon('flame')
				.setChecked(streakSkipsMissingDays(plugin, card.key))
				.onClick(async () => {
					await toggleStreakSkip(plugin, card.key)
					streakSettings++
				})
		)
		menu.addItem((item) =>
			item
				.setTitle('Delete goal')
				.setIcon('trash-2')
				.setWarning(true)
				.onClick(() => void deleteGoal(plugin, file, card.key))
		)
		menu.showAtMouseEvent(event)
	}

	function addSuggestions(list: GoalSuggestion[]) {
		if (!log) return
		flight.depart(list.map((suggestion) => suggestion.id))
		void addSuggestedGoals(plugin, log.file, list)
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
			<button class="mod-cta" onclick={() => addSuggestions(suggestions)}>
				<span class="button-icon" use:icon={'list-plus'}></span>
				Add all suggestions
			</button>
			<button onclick={() => void dismiss(suggestions)}>
				<span class="button-icon" use:icon={'x'}></span>
				Reject all suggestions
			</button>
		</div>
	{/if}

	<!-- One grid for every list, so each task's cards fill the row after the last. -->
	<section class="cards" aria-label="Goals">
		{#each groups as group (group.taskName)}
			<h3 class="group-title">{group.taskName}</h3>
			<div class="card-list" role="list" aria-label={group.taskName}>
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
						use:flight.arrive={card.id}
						use:registerCard={card.id}
						style:--goal-color={goalColor(card.goal, metricSettings)}
						style:--progress={card.progress}
					>
						<span class="title">{goalLabel(card.goal)}</span>
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
									use:icon={'minus'}
									onclick={() =>
										log && void stepGoal(plugin, log.file, card.key, -1)}
								></button>
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
									use:icon={'plus'}
									onclick={() =>
										log && void stepGoal(plugin, log.file, card.key, 1)}
								></button>
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
						{#if card.state === 'done' && doneBadge !== 'none'}
							{@const days = doneBadge === 'flame' ? streak(card) : 0}
							{@const stamp =
								doneBadge === 'stamp' && log
									? stampText(stampTexts, formatLocalDate(log.date), card.id)
									: null}
							<span
								class="badge is-{doneBadge}"
								class:stamps={popped.has(card.id)}
								role="img"
								aria-label={doneBadge === 'flame'
									? `Met ${days} day${days === 1 ? '' : 's'} in a row`
									: (stamp ?? 'Done')}
							>
								{#if doneBadge === 'tick'}✓{:else if doneBadge === 'trophy'}🏆{:else if doneBadge === 'flame'}🔥
									{days}{:else if doneBadge === 'stamp'}{stamp}{/if}
							</span>
						{/if}
					</div>
				{/each}
				{#each group.suggestions as suggestion (suggestion.id)}
					<div
						class="goal-card is-suggested"
						role="listitem"
						aria-label="Suggested {suggestion.title}"
						use:flight.suggestion={suggestion.id}
					>
						<span class="title">{goalLabel(suggestion.goal)}</span>
						<button
							class="menu-button"
							aria-label="Dismiss {suggestion.title} for this day"
							use:icon={'x'}
							onclick={() => void dismiss([suggestion])}
						></button>
						<button
							class="add-suggestion"
							aria-label="Add {suggestion.title} to {isToday
								? 'today'
								: 'this day'}"
							use:icon={'plus'}
							onclick={() => addSuggestions([suggestion])}
						></button>
						<span class="suggested-target">
							{describeSuggestedTarget(suggestion.goal)}
						</span>
					</div>
				{/each}
			</div>
		{/each}

		<div class="new-slot">
			<button class="goal-card is-new" onclick={() => void setGoalFlow(plugin)}>
				<span class="plus" use:icon={'plus'}></span>
				<span>Add goal</span>
			</button>
		</div>
	</section>
</div>

<style>
	.goals-tab {
		display: grid;
		gap: var(--size-4-3);
	}

	.goals-toolbar {
		display: flex;
		flex-wrap: wrap;
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

	/* Done badges, on the card's top-left corner. */
	.badge {
		position: absolute;
		/* Within the panel's 12px inline padding, which clips what passes it. */
		top: -8px;
		left: -8px;
		z-index: 1;
		display: grid;
		place-items: center;
		line-height: 1;
		pointer-events: none;
		rotate: -10deg;
	}

	.badge.stamps {
		animation: goal-badge-stamp 500ms cubic-bezier(0.2, 0.9, 0.3, 1.3) both;
	}

	@keyframes goal-badge-stamp {
		0% {
			scale: 1.8;
			opacity: 0;
		}
		60% {
			scale: 0.92;
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.badge.stamps {
			animation: none;
		}
	}

	.badge.is-tick {
		width: 26px;
		height: 26px;
		border: 2px solid var(--background-primary);
		border-radius: 50%;
		background: var(--color-green);
		color: var(--background-primary);
		font-size: 0.85em;
		font-weight: 800;
	}

	.badge.is-star {
		top: -10px;
		left: -8px;
		width: 34px;
		height: 34px;
		background: linear-gradient(135deg, #ffe58a, var(--color-yellow) 70%);
		clip-path: polygon(
			50% 0%,
			61% 35%,
			98% 35%,
			68% 57%,
			79% 91%,
			50% 70%,
			21% 91%,
			32% 57%,
			2% 35%,
			39% 35%
		);
	}

	.badge.is-rosette {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background:
			radial-gradient(circle, var(--color-yellow) 0 52%, transparent 53%),
			repeating-conic-gradient(var(--color-yellow) 0 12deg, #f7dc7c 12deg 24deg);
	}

	.badge.is-rosette::before,
	.badge.is-rosette::after {
		content: '';
		position: absolute;
		top: 22px;
		z-index: -1;
		width: 10px;
		height: 15px;
		background: var(--color-red);
		clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 72%, 0 100%);
	}

	.badge.is-rosette::before {
		left: 4px;
		transform: rotate(18deg);
	}

	.badge.is-rosette::after {
		left: 16px;
		transform: rotate(-18deg);
	}

	.badge.is-stamp {
		top: -8px;
		left: -6px;
		padding: 2px 7px;
		border: 2px solid var(--color-red);
		border-radius: var(--radius-s);
		outline: 1px solid var(--color-red);
		outline-offset: 2px;
		background: var(--background-primary);
		color: var(--color-red);
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		rotate: -14deg;
		white-space: nowrap;
	}

	.badge.is-trophy {
		width: 32px;
		height: 32px;
		border: 2px solid var(--background-primary);
		border-radius: 50%;
		background: radial-gradient(
			circle at 35% 30%,
			#fff3c2,
			var(--color-yellow) 75%
		);
		font-size: 1em;
	}

	.badge.is-flame {
		padding: 3px 8px 3px 6px;
		border: 2px solid var(--background-primary);
		border-radius: 999px;
		background: linear-gradient(135deg, var(--color-orange), var(--color-red));
		color: #fff;
		font-size: var(--font-ui-smaller);
		font-weight: 700;
		white-space: nowrap;
		rotate: -6deg;
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

	/*
	 * Themes restyle every button (radius, height, padding), some with
	 * selectors like `.theme-dark button:not(.mod-cta):not(.clickable-icon)`:
	 * the long selector outranks them and the pinned box keeps these round.
	 * Obsidian also gives buttons `corner-shape: var(--button-corner-shape)`,
	 * a squircle that squares off even a 50% radius: its variable is reset.
	 */
	.goal-card .ring-row button.step {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		box-sizing: border-box;
		width: 24px;
		min-width: 24px;
		max-width: 24px;
		height: 24px;
		min-height: 24px;
		max-height: 24px;
		aspect-ratio: 1;
		padding: 0;
		border: 1px solid var(--background-modifier-border);
		border-radius: 50%;
		--button-corner-shape: round;
		background: var(--background-primary);
		box-shadow: none;
		color: var(--text-muted);
	}

	.goal-card .ring-row button.step :global(svg) {
		width: 14px;
		height: 14px;
	}

	.goal-card .ring-row button.step:hover:enabled {
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

	/* Unset: Obsidian's button styles (size, squircle corners) do not apply. */
	.add-suggestion {
		all: unset;
		box-sizing: border-box;
		display: grid;
		place-items: center;
		width: 54px;
		height: 54px;
		border: 1.5px dashed var(--interactive-accent);
		border-radius: 50%;
		color: var(--interactive-accent);
		cursor: pointer;
		transition:
			background-color 150ms ease,
			border-color 150ms ease,
			transform 100ms ease;
	}

	.add-suggestion:hover {
		border-style: solid;
		background: color-mix(in srgb, var(--interactive-accent) 14%, transparent);
	}

	.add-suggestion:active {
		background: color-mix(in srgb, var(--interactive-accent) 26%, transparent);
		transform: scale(0.94);
	}

	.add-suggestion:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		.add-suggestion {
			transition: none;
		}

		.add-suggestion:active {
			transform: none;
		}
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
