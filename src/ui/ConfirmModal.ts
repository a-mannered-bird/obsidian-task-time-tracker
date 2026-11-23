import { Modal, Setting, type App } from 'obsidian'

type Options = {
	title: string
	/** Paragraphs shown above the list. */
	message: string[]
	/** Items listed as bullets (e.g. what will be deleted). */
	items?: string[]
	/** Shown in warning colors above the buttons, its items as bullets. */
	warning?: { message: string; items: string[] } | null
	confirmText?: string
}

/** A group of checkboxes below the items, every box off. */
type Choices = {
	heading: string
	note: string
	options: { value: string; label: string }[]
}

/** Resolves true when confirmed, false when cancelled or dismissed. */
export function confirm(app: App, options: Options): Promise<boolean> {
	return new Promise((resolve) => {
		new ConfirmModal(app, options, null, (chosen) =>
			resolve(chosen !== null)
		).open()
	})
}

/**
 * Like confirm, with a group of checkboxes: resolves the values ticked when
 * confirmed, null when cancelled or dismissed.
 */
export function confirmChoosing(
	app: App,
	options: Options & { choices: Choices }
): Promise<string[] | null> {
	return new Promise((resolve) => {
		new ConfirmModal(app, options, options.choices, resolve).open()
	})
}

class ConfirmModal extends Modal {
	private confirmed = false
	private chosen = new Set<string>()

	constructor(
		app: App,
		private options: Options,
		private choices: Choices | null,
		private resolve: (chosen: string[] | null) => void
	) {
		super(app)
	}

	onOpen(): void {
		this.setTitle(this.options.title)
		for (const paragraph of this.options.message) {
			this.contentEl.createEl('p', { text: paragraph })
		}
		if (this.options.items?.length) {
			const list = this.contentEl.createEl('ul')
			for (const item of this.options.items) {
				list.createEl('li', { text: item })
			}
		}
		if (this.choices?.options.length) this.renderChoices(this.choices)
		const { warning } = this.options
		if (warning) {
			this.contentEl.createEl('p', {
				text: warning.message,
				cls: 'task-time-tracker-warning',
			})
			const list = this.contentEl.createEl('ul')
			for (const item of warning.items) list.createEl('li', { text: item })
		}

		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close())
			)
			.addButton((button) =>
				button
					.setButtonText(this.options.confirmText ?? 'Confirm')
					.setCta()
					.onClick(() => {
						this.confirmed = true
						this.close()
					})
			)
	}

	private renderChoices(choices: Choices): void {
		const group = this.contentEl.createEl('fieldset', {
			cls: 'task-time-tracker-confirm-choices',
		})
		group.createEl('legend', { text: choices.heading })
		group.createEl('p', { text: choices.note })
		for (const option of choices.options) {
			const label = group.createEl('label')
			const box = label.createEl('input', { type: 'checkbox' })
			box.addEventListener('change', () => {
				if (box.checked) this.chosen.add(option.value)
				else this.chosen.delete(option.value)
			})
			label.appendText(option.label)
		}
	}

	onClose(): void {
		this.contentEl.empty()
		this.resolve(this.confirmed ? [...this.chosen] : null)
	}
}
