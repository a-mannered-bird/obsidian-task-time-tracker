<script lang="ts">
	import { getStyleByTag } from 'utils/tracker'

	type Props = {
		columns: {
			label: string
		}[]
		rows: string[][]
		rowClasses: Record<string, boolean>[]
	}

	const { columns, rows, rowClasses }: Props = $props()
</script>

<table>
	<thead>
		<tr>
			{#each columns as column}
				<th>{column.label}</th>
			{/each}
		</tr>
	</thead>
	<tbody>
		{#each rows as row, i}
			<tr class={rowClasses[i]}>
				{#each row as cell, i}
					<td>{cell}</td>
				{/each}
			</tr>
		{/each}
	</tbody>
</table>

<style>
	.italic {
		font-style: italic;
	}

	.bold {
		font-weight: bold;
	}

	.underline {
		text-decoration: underline;
	}
</style>
