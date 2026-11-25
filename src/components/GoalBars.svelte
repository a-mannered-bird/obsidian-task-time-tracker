<script lang="ts">
	import type { GoalCard } from 'core/goalCards'
	import type { GoalKey } from 'core/goalEdits'
	import type { MetricGoal } from 'types/goals'
	import {
		describeGoalBar,
		goalColor,
		goalEmoji,
		trackerGoalBars,
		type MetricSettings,
	} from 'core/goalStyle'
	import { instantTooltip } from 'ui/tooltip'

	type Props = {
		/** The task's goals, in note order. */
		cards: GoalCard[]
		metricSettings: MetricSettings
		/** Goals whose bar the user hid from the tracker. */
		hidden: GoalKey[]
		/** A metric goal's bar records its result. */
		onrecord: (taskName: string, goal: MetricGoal) => void
		/** A bar's emoji, and a time goal's bar, open the Goals tab. */
		onedit: (goalId: string) => void
	}

	const { cards, metricSettings, hidden, onrecord, onedit }: Props = $props()

	const bars = $derived(trackerGoalBars(cards, hidden))
</script>

{#if bars.length > 0}
	<ul class="goal-bars" aria-label="Goals">
		{#each bars as card (card.id)}
			{@const emoji = goalEmoji(card.goal, metricSettings)}
			{@const description = describeGoalBar(card, emoji)}
			<li
				style:--goal-color={goalColor(card.goal, metricSettings)}
				style:--progress={card.progress}
			>
				<button
					class="goal-bar"
					class:is-done={card.state === 'done'}
					class:is-over={card.state === 'over'}
					class:is-at-most={card.goal.atMost}
					aria-label={description}
					use:instantTooltip={() => [
						description,
						card.goal.kind === 'metric'
							? 'Click to record the result'
							: 'Click to open it in the Goals tab',
					]}
					onclick={() =>
						card.goal.kind === 'metric'
							? onrecord(card.key.taskName, card.goal)
							: onedit(card.id)}
				>
					<span class="track"><span class="fill"></span></span>
				</button>
				<button
					class="emoji"
					aria-label="Open {card.title} in the Goals tab"
					use:instantTooltip={() => [
						card.title,
						'Click to open it in the Goals tab',
					]}
					onclick={() => onedit(card.id)}>{emoji}</button
				>
			</li>
		{/each}
	</ul>
{/if}

<style>
	/* Under the whole row, the checkbox included. */
	.goal-bars {
		flex-basis: 100%;
		display: grid;
		gap: 3px;
		margin: -4px 0 6px;
		padding: 0;
		list-style: none;
	}

	.goal-bars > li {
		display: grid;
		grid-template-columns: 1fr 1.4em;
		align-items: center;
		gap: 6px;
	}

	.goal-bar,
	.emoji {
		all: unset;
		box-sizing: border-box;
		cursor: pointer;
	}

	/* Taller than its track, so the thin bar is easy to hit. */
	.goal-bar {
		display: grid;
		align-items: center;
		min-height: 1em;
	}

	.goal-bar:focus-visible,
	.emoji:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
		border-radius: var(--radius-s);
	}

	.track {
		height: 5px;
		overflow: hidden;
		border-radius: 3px;
		background: var(--background-modifier-border);
	}

	/* The used part of an "at most" bar is pale red, like its ring's. */
	.goal-bar.is-at-most .track {
		background: color-mix(
			in srgb,
			var(--color-red) 35%,
			var(--background-modifier-border)
		);
	}

	/* Fills or empties itself on a change, like the goal rings. */
	.fill {
		display: block;
		width: calc(var(--progress) * 100%);
		height: 100%;
		border-radius: 3px;
		background: var(--goal-color);
		transition:
			width 700ms cubic-bezier(0.2, 0.8, 0.2, 1),
			background-color 700ms;
	}

	@starting-style {
		.fill {
			width: 0;
		}

		.goal-bar.is-at-most .fill {
			width: 100%;
		}
	}

	.goal-bar.is-over .fill {
		width: 100%;
		background: var(--color-red);
	}

	.emoji {
		font-size: 0.8em;
		line-height: 1;
		text-align: center;
	}

	.emoji:hover {
		transform: scale(1.25);
	}
</style>
