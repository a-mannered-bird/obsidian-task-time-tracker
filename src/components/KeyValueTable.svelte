<script lang="ts">
	type Props = {
		columns: {
			label: string
		}[]
		rows: string[][]
	}

	const { columns, rows }: Props = $props()
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
		{#each rows as row}
			<tr>
				{#each row as cell}
					<td>{cell}</td>
				{/each}
			</tr>
		{/each}
	</tbody>
</table>
