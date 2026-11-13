import { AbstractInputSuggest, type App } from 'obsidian'

/**
 * Autocomplete over known tags, in the order given; a new tag is typed
 * as-is. A picked suggestion fills the input, then `onPick` runs (e.g. to
 * submit). `tags` may be a function, read at each keystroke, when the
 * offered tags change while the editor is open.
 */
export class TagSuggest extends AbstractInputSuggest<string> {
	private readonly tags: () => string[]

	constructor(
		app: App,
		inputEl: HTMLInputElement,
		tags: string[] | (() => string[]),
		onPick?: (tag: string) => void
	) {
		super(app, inputEl)
		this.tags = typeof tags === 'function' ? tags : () => tags
		this.onSelect((tag) => {
			this.setValue(tag)
			this.close()
			onPick?.(tag)
		})
	}

	protected getSuggestions(query: string): string[] {
		const needle = query.trim().replace(/^#/, '').toLowerCase()
		return this.tags().filter((tag) => tag.toLowerCase().includes(needle))
	}

	renderSuggestion(tag: string, el: HTMLElement): void {
		el.setText(tag)
	}
}
