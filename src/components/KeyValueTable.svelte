<script lang="ts">
	import type { FooterRow, TableCell, TableColumn } from 'core/statsTable'
	import { instantTooltip } from 'ui/tooltip'

	type Row = {
		cells: TableCell[]
		/** CSS color of the row's chart series, shown before its first cell. */
		swatch?: string
	}

	type Props = {
		columns: TableColumn[]
		rows: Row[]
		footer?: FooterRow[]
	}

	const { columns, rows, footer = [] }: Props = $props()
</script>

{#snippet content(cell: TableCell)}
	{#if cell.dots}
		<span class="dots" role="img" aria-label={cell.text}>
			{#each cell.dots as dot, d (d)}
				<span
					class="dot is-{dot.status}"
					use:instantTooltip={() => [
						[{ text: `${dot.label} · ${dot.status}` }],
					]}
				></span>
			{/each}
		</span>
	{:else if cell.tooltip}
		<span
			class="has-tooltip"
			class:is-good={cell.tone === 'good'}
			use:instantTooltip={() => cell.tooltip ?? []}>{cell.text}</span
		>
	{:else}
		<span class:is-good={cell.tone === 'good'}>{cell.text}</span>
	{/if}
{/snippet}

<div class="table-scroll">
	<table class="key-value-table">
		<thead>
			<tr>
				{#each columns as column, i (i)}
					<th class:numeric={column.numeric} class:centered={column.centered}>
						{#if column.tooltip}
							<span
								class="has-tooltip"
								use:instantTooltip={() => column.tooltip ?? []}
								>{column.label}</span
							>
						{:else}
							{column.label}
						{/if}
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each rows as row, r (r)}
				<tr>
					{#each row.cells as cell, i (i)}
						<td
							class:numeric={columns[i]?.numeric}
							class:centered={columns[i]?.centered}
						>
							{#if i === 0 && row.swatch}
								<span class="named">
									<span class="swatch" style:background={row.swatch}></span>
									<span>{@render content(cell)}</span>
								</span>
							{:else}
								{@render content(cell)}
							{/if}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
		{#if footer.length}
			<tfoot>
				{#each footer as row, r (r)}
					<tr class:emphasis={row.emphasis}>
						{#each row.cells as cell, i (i)}
							<td class:numeric={columns[i]?.numeric}>
								{@render content(cell)}
							</td>
						{/each}
					</tr>
				{/each}
			</tfoot>
		{/if}
	</table>
</div>

<style>
	.table-scroll {
		overflow-x: auto;
		margin: 0.5em 0;
	}

	/* Overrides the theme's table look inside the block. */
	.key-value-table {
		border-collapse: collapse;
		width: 100%;
		margin: 0;
		font-size: var(--font-ui-small);
		font-variant-numeric: tabular-nums;
	}

	.key-value-table th,
	.key-value-table td {
		border: none;
		border-bottom: 1px solid var(--background-modifier-border);
		background: none;
		padding: var(--size-4-1) var(--size-4-2) var(--size-4-1) 0;
		text-align: left;
		white-space: nowrap;
	}

	/* Names wrap so the numbers stay visible in a narrow pane. */
	.key-value-table th,
	.key-value-table td:first-child {
		white-space: normal;
		overflow-wrap: break-word;
	}

	.named {
		display: inline-flex;
		align-items: baseline;
	}

	.key-value-table th:last-child,
	.key-value-table td:last-child {
		padding-right: 0;
	}

	.key-value-table th {
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
		font-weight: var(--font-semibold);
	}

	.key-value-table .numeric {
		text-align: right;
	}

	/* Centered value columns wrap, so a narrow pane keeps the streak in view. */
	.key-value-table .centered {
		text-align: center;
		white-space: normal;
	}

	.is-good {
		color: var(--color-green);
	}

	/* A streak: filled met, hollow missed, faint without a goal or pending. */
	.dots {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 3px;
		/* Seven dots per line, a week when there is one per day. */
		max-width: calc(7 * 8px + 6 * 3px);
		white-space: normal;
		vertical-align: middle;
	}

	.dot {
		width: 8px;
		height: 8px;
		box-sizing: border-box;
		border-radius: 50%;
	}

	.dot.is-met {
		background: var(--color-green);
	}

	.dot.is-missed {
		border: 1.5px solid var(--color-red);
	}

	.dot.is-none,
	.dot.is-pending {
		background: var(--background-modifier-border);
	}

	.key-value-table tfoot td {
		color: var(--text-muted);
		border-bottom: none;
	}

	.key-value-table tfoot tr.emphasis td {
		color: var(--text-normal);
	}

	.swatch {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 2px;
		flex: none;
		margin-right: var(--size-4-2);
	}

	.has-tooltip {
		text-decoration: underline dotted var(--text-faint);
		text-underline-offset: 3px;
		cursor: help;
	}
</style>
