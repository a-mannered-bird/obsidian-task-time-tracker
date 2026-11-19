import { SuggestModal, type App } from 'obsidian'

export type PickerOption<T> = {
	label: string
	/** Muted text after the label. */
	note?: string
	value: T
}

type Options<T> = {
	placeholder: string
	options: PickerOption<T>[]
	/** An extra row built from the typed text (e.g. a new metric); null for none. */
	create?: (query: string) => PickerOption<T> | null
}

/**
 * Pick one of a short list of options, filtered by the typed text. Resolves
 * with the value picked, or null when dismissed.
 */
export function pickOption<T>(
	app: App,
	options: Options<T>
): Promise<T | null> {
	return new Promise((resolve) => {
		new OptionSuggestModal(app, options, resolve).open()
	})
}

class OptionSuggestModal<T> extends SuggestModal<PickerOption<T>> {
	private chosen = false

	constructor(
		app: App,
		private options: Options<T>,
		private resolve: (value: T | null) => void
	) {
		super(app)
		this.setPlaceholder(options.placeholder)
	}

	getSuggestions(query: string): PickerOption<T>[] {
		const needle = query.trim().toLowerCase()
		const matching = this.options.options.filter((option) =>
			option.label.toLowerCase().includes(needle)
		)
		const exact = matching.some(
			(option) => option.label.toLowerCase() === needle
		)
		const created =
			needle && !exact ? this.options.create?.(query.trim()) : null
		return created ? [...matching, created] : matching
	}

	renderSuggestion(option: PickerOption<T>, el: HTMLElement): void {
		el.createSpan({ text: option.label })
		if (option.note) {
			el.createSpan({ cls: 'task-time-tracker-option-note', text: option.note })
		}
	}

	onChooseSuggestion(option: PickerOption<T>): void {
		this.chosen = true
		this.resolve(option.value)
	}

	onClose(): void {
		super.onClose()
		// Obsidian calls onChooseSuggestion after onClose; wait for it.
		window.setTimeout(() => {
			if (!this.chosen) this.resolve(null)
		})
	}
}
