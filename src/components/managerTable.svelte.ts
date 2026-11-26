import { SearchComponent } from 'obsidian'

export type ManagerTab = 'tasks' | 'tags'

/**
 * Ticked rows of a management table, by key. A shift-click ticks every row
 * between the last plain click and this one, in the table's current order.
 */
export class RowSelection {
	// Runes go in the constructor and the fields are `declare`d: the es2018
	// build target lowers class fields to define calls, where Svelte rejects
	// `$state`, and an emitted field would shadow the reactive accessors.
	declare selected: string[]
	private anchor: string | null = null

	constructor() {
		this.selected = $state([])
	}

	has(key: string): boolean {
		return this.selected.includes(key)
	}

	toggle(key: string, shift: boolean, order: string[]) {
		if (shift && this.anchor !== null) {
			const [from, to] = [order.indexOf(this.anchor), order.indexOf(key)]
			if (from !== -1 && to !== -1) {
				const range = order.slice(Math.min(from, to), Math.max(from, to) + 1)
				this.selected = [...new Set([...this.selected, ...range])]
				return
			}
		}
		this.anchor = key
		this.selected = this.has(key)
			? this.selected.filter((other) => other !== key)
			: [...this.selected, key]
	}

	/** Tick every key, or clear when they all are already. */
	toggleAll(keys: string[]) {
		this.selected = this.allOf(keys) ? [] : [...keys]
		this.anchor = null
	}

	allOf(keys: string[]): boolean {
		return keys.length > 0 && keys.every((key) => this.has(key))
	}

	clear() {
		this.selected = []
		this.anchor = null
	}
}

/** The sorted column of a table and its direction. */
export class TableSort<Key extends string> {
	// Declared only, as in RowSelection.
	declare key: Key
	declare ascending: boolean

	constructor(
		key: Key,
		private naturallyAscending: (key: Key) => boolean
	) {
		this.key = $state(key)
		this.ascending = $state(naturallyAscending(key))
	}

	/** Sort by the column, or flip its direction when it already sorts. */
	set(key: Key) {
		if (this.key === key) {
			this.ascending = !this.ascending
		} else {
			this.key = key
			this.ascending = this.naturallyAscending(key)
		}
	}

	ariaSort(key: Key): 'ascending' | 'descending' | undefined {
		if (this.key !== key) return undefined
		return this.ascending ? 'ascending' : 'descending'
	}
}

/**
 * Svelte action mounting Obsidian's search field (for its clear button),
 * kept in sync both ways with a query that may also change from elsewhere.
 */
export function searchField(
	container: HTMLElement,
	options: {
		placeholder: string
		label: string
		get: () => string
		set: (query: string) => void
	}
) {
	const search = new SearchComponent(container)
		.setPlaceholder(options.placeholder)
		.onChange(options.set)
	search.inputEl.setAttribute('aria-label', options.label)
	// Obsidian leaves its clear button unnamed.
	search.clearButtonEl.setAttribute('aria-label', 'Clear filter')
	$effect(() => {
		const query = options.get()
		if (search.getValue() === query) return
		search.setValue(query)
		// Shows or hides the clear button for the new value.
		search.onChanged()
	})
}
