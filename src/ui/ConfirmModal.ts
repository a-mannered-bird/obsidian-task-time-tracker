import { Modal, Setting, type App } from 'obsidian'

type Options = {
	title: string
	/** Paragraphs shown above the list. */
	message: string[]
	/** Items listed as bullets (e.g. what will be deleted). */
	items?: string[]
	confirmText?: string
}

/** Resolves true when confirmed, false when cancelled or dismissed. */
export function confirm(app: App, options: Options): Promise<boolean> {
	return new Promise((resolve) => {
		new ConfirmModal(app, options, resolve).open()
	})
}

class ConfirmModal extends Modal {
	private confirmed = false

	constructor(
		app: App,
		private options: Options,
		private resolve: (confirmed: boolean) => void
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

	onClose(): void {
		this.contentEl.empty()
		this.resolve(this.confirmed)
	}
}
