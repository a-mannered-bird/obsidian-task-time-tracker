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
	{#if cell.tooltip}
		<span class="has-tooltip" use:instantTooltip={() => cell.tooltip ?? []}
			>{cell.text}</span
		>
	{:else}
		{cell.text}
	{/if}
{/snippet}

<div class="table-scroll">
	<table class="key-value-table">
		<thead>
			<tr>
				{#each columns as column, i (i)}
					<th class:numeric={column.numeric}>
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
						<td class:numeric={columns[i]?.numeric}>
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
