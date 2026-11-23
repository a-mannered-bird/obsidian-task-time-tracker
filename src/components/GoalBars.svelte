<script lang="ts">
	import type { GoalCard } from 'core/goalCards'
	import type { MetricGoal } from 'types/goals'
	import {
		describeGoalBar,
		goalBars,
		goalColor,
		goalEmoji,
		type MetricSettings,
	} from 'core/goalStyle'
	import { instantTooltip } from 'ui/tooltip'

	type Props = {
		/** The task's goals, in note order. */
		cards: GoalCard[]
		metricSettings: MetricSettings
		/** A metric goal's bar records its result. */
		onrecord: (taskName: string, goal: MetricGoal) => void
		/** A time goal's bar, and the folded ones, open the Goals tab. */
		onedit: (goalId: string) => void
	}

	const { cards, metricSettings, onrecord, onedit }: Props = $props()

	const bars = $derived(goalBars(cards))
</script>

<ul class="goal-bars" aria-label="Goals">
	{#each bars.shown as card (card.id)}
		{@const emoji = goalEmoji(card.goal, metricSettings)}
		{@const description = describeGoalBar(card, emoji)}
		<li>
			<button
				class="goal-bar"
				class:is-done={card.state === 'done'}
				class:is-over={card.state === 'over'}
				aria-label={description}
				use:instantTooltip={() => [
					description,
					card.goal.kind === 'metric'
						? 'Click to record the result'
						: 'Click to open it in the Goals tab',
				]}
				style:--goal-color={goalColor(card.goal, metricSettings)}
				style:--progress={card.progress}
				onclick={() =>
					card.goal.kind === 'metric'
						? onrecord(card.key.taskName, card.goal)
						: onedit(card.id)}
			>
				<span class="track"><span class="fill"></span></span>
				<span class="emoji" aria-hidden="true">{emoji}</span>
			</button>
		</li>
	{/each}
	{#if bars.folded[0]}
		{@const first = bars.folded[0]}
		{@const count = bars.folded.length}
		<li>
			<button
				class="folded"
				aria-label="{count} more goal{count === 1 ? '' : 's'}"
				onclick={() => onedit(first.id)}>+{count}</button
			>
		</li>
	{/if}
</ul>

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

	.goal-bar {
		all: unset;
		box-sizing: border-box;
		display: grid;
		grid-template-columns: 1fr 1.4em;
		align-items: center;
		gap: 6px;
		width: 100%;
		cursor: pointer;
	}

	.goal-bar:focus-visible,
	.folded:focus-visible {
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

	.fill {
		display: block;
		width: calc(var(--progress) * 100%);
		height: 100%;
		border-radius: 3px;
		background: var(--goal-color);
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

	.folded {
		all: unset;
		cursor: pointer;
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}

	.folded:hover,
	.goal-bar:hover .emoji {
		color: var(--text-normal);
	}
</style>
