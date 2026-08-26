<script lang="ts">
	import { formatHoursMinutes } from 'core/time'

	export type ChartSeries = {
		key: string
		/** CSS color, e.g. `var(--color-blue)`. */
		color: string
	}

	export type ChartPoint = {
		label: string
		/** Shown in the hover tooltip; falls back to `label`. */
		tooltipLabel?: string
		/** Minutes per series key; missing keys count as 0. */
		minutes: Record<string, number>
		total: number
	}

	type Props = {
		points: ChartPoint[]
		series: ChartSeries[]
	}

	const { points, series }: Props = $props()

	const HEIGHT = 160
	const GAP = 2

	const yMax = $derived(niceMax(Math.max(...points.map((p) => p.total), 60)))
	const ticks = $derived([0.5, 1].map((f) => f * yMax))
	const barSlot = $derived(100 / points.length)
	// Label roughly every nth bar so long ranges stay readable.
	const labelEvery = $derived(Math.ceil(points.length / 12))

	let hovered = $state<number | null>(null)

	const y = (minutes: number) => (minutes / yMax) * HEIGHT

	/** Segments of one bar, bottom-up, with their y offsets. */
	function segments(point: ChartPoint) {
		let offset = 0
		return series
			.map((s) => {
				const minutes = point.minutes[s.key] ?? 0
				const segment = { ...s, minutes, from: offset }
				offset += minutes
				return segment
			})
			.filter((segment) => segment.minutes > 0)
	}

	function niceMax(minutes: number): number {
		const hours = Math.ceil(minutes / 60)
		const step = hours > 8 ? 4 : hours > 4 ? 2 : 1
		return Math.ceil(hours / step) * step * 60
	}

	/** `1.5h`, at most one decimal; whole hours stay bare (`3h`). */
	function tickLabel(tick: number): string {
		return `${Math.round((tick / 60) * 10) / 10}h`
	}
</script>

<div class="chart">
	<!-- Marks only: text lives in HTML so the stretched SVG cannot distort it. -->
	<div class="plot">
		<svg
			viewBox="0 0 100 {HEIGHT}"
			preserveAspectRatio="none"
			role="img"
			aria-label="Logged time per day"
		>
			{#each ticks as tick (tick)}
				<line
					class="grid"
					x1="0"
					x2="100"
					y1={HEIGHT - y(tick)}
					y2={HEIGHT - y(tick)}
				/>
			{/each}
			{#each points as point, i (point.label)}
				{@const slotX = i * barSlot}
				{#each segments(point) as segment (segment.key)}
					<rect
						class="segment"
						x={slotX + barSlot * 0.15}
						width={barSlot * 0.7}
						y={HEIGHT - y(segment.from + segment.minutes)}
						height={Math.max(y(segment.minutes) - GAP, 1)}
						rx="1"
						fill={segment.color}
						opacity={hovered === null || hovered === i ? 1 : 0.35}
					/>
				{/each}
				<!-- Full-column hit target, wider than the bar itself. -->
				<rect
					class="hit"
					x={slotX}
					width={barSlot}
					y="0"
					height={HEIGHT}
					onmouseenter={() => (hovered = i)}
					onmouseleave={() => (hovered = null)}
					role="presentation"
				/>
			{/each}
			<line class="axis" x1="0" x2="100" y1={HEIGHT} y2={HEIGHT} />
		</svg>

		{#each ticks as tick (tick)}
			<span class="y-label" style:top="{((HEIGHT - y(tick)) / HEIGHT) * 100}%"
				>{tickLabel(tick)}</span
			>
		{/each}
	</div>
	<div class="x-labels">
		{#each points as point, i (point.label)}
			{#if i % labelEvery === 0}
				<span class="x-label" style:left="{i * barSlot + barSlot / 2}%"
					>{point.label}</span
				>
			{/if}
		{/each}
	</div>

	{#if hovered !== null && points[hovered] !== undefined}
		{@const point = points[hovered]!}
		<div class="tooltip">
			<strong>{point.tooltipLabel ?? point.label}</strong>
			<span>{formatHoursMinutes(point.total)}</span>
			{#each segments(point).reverse() as segment (segment.key)}
				<div class="tooltip-row">
					<span class="chip" style:background={segment.color}></span>
					<span class="tooltip-key">{segment.key}</span>
					<span>{formatHoursMinutes(segment.minutes)}</span>
				</div>
			{/each}
		</div>
	{/if}

	{#if series.length > 1}
		<div class="legend">
			{#each series as s (s.key)}
				<span class="legend-item">
					<span class="chip" style:background={s.color}></span>
					{s.key}
				</span>
			{/each}
		</div>
	{/if}
</div>

<style>
	.chart {
		position: relative;
		margin: 0.5em 0;
	}

	.chart {
		padding-left: 2.6em;
	}

	.plot {
		position: relative;
	}

	svg {
		display: block;
		width: 100%;
		height: 200px;
	}

	/* Right edge pinned to the plot's left edge, into the chart's left gutter. */
	.y-label {
		position: absolute;
		right: 100%;
		padding-right: 0.35em;
		transform: translateY(-50%);
		white-space: nowrap;
	}

	.x-labels {
		position: relative;
		height: 1.4em;
	}

	.x-label {
		position: absolute;
		transform: translateX(-50%);
		white-space: nowrap;
	}

	.x-label,
	.y-label {
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}

	.grid {
		stroke: var(--background-modifier-border);
		stroke-width: 0.5;
		stroke-dasharray: 2 2;
	}

	.axis {
		stroke: var(--background-modifier-border);
		stroke-width: 1;
	}

	.hit {
		fill: transparent;
	}

	.tooltip {
		position: absolute;
		top: 0;
		right: 0;
		background: var(--background-secondary);
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-s);
		padding: 0.4em 0.6em;
		font-size: var(--font-ui-smaller);
		display: flex;
		flex-direction: column;
		gap: 0.15em;
		pointer-events: none;
	}

	.tooltip-row {
		display: flex;
		align-items: center;
		gap: 0.4em;
	}

	.tooltip-key {
		flex: 1;
		color: var(--text-muted);
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3em 1em;
		margin-top: 0.25em;
		font-size: var(--font-ui-smaller);
		color: var(--text-normal);
	}

	.legend-item {
		display: inline-flex;
		align-items: center;
		gap: 0.35em;
	}

	.chip {
		width: 10px;
		height: 10px;
		border-radius: 2px;
		display: inline-block;
	}
</style>
