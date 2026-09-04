import { AbstractInputSuggest, type App } from 'obsidian'

/**
 * Autocomplete over the vault's known tags; a new tag is typed as-is. A
 * picked suggestion fills the input, then `onPick` runs (e.g. to submit).
 */
export class TagSuggest extends AbstractInputSuggest<string> {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		private tags: string[],
		onPick?: (tag: string) => void
	) {
		super(app, inputEl)
		this.onSelect((tag) => {
			this.setValue(tag)
			this.close()
			onPick?.(tag)
		})
	}

	protected getSuggestions(query: string): string[] {
		const needle = query.trim().replace(/^#/, '').toLowerCase()
		return this.tags.filter((tag) => tag.toLowerCase().includes(needle))
	}

	renderSuggestion(tag: string, el: HTMLElement): void {
		el.setText(tag)
	}
}
