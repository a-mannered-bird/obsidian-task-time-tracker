import { Modal, Setting, type App } from 'obsidian'

type Options = {
	title: string
	description?: string
	label: string
	initialValue?: string
	confirmText?: string
	/** Error shown under the input for an unacceptable value; null = fine. */
	validate?: (value: string) => string | null
}

/**
 * Ask for one line of text. Resolves with the trimmed value, or null when
 * dismissed. A value the validator rejects keeps the prompt open.
 */
export function promptText(app: App, options: Options): Promise<string | null> {
	return new Promise((resolve) => {
		new TextPromptModal(app, options, resolve).open()
	})
}

class TextPromptModal extends Modal {
	private submitted = false
	private value: string
	private errorEl: HTMLElement | null = null

	constructor(
		app: App,
		private options: Options,
		private resolve: (value: string | null) => void
	) {
		super(app)
		this.value = options.initialValue ?? ''
	}

	onOpen(): void {
		this.setTitle(this.options.title)
		if (this.options.description) {
			this.contentEl.createEl('p', { text: this.options.description })
		}

		new Setting(this.contentEl).setName(this.options.label).addText((text) => {
			text.setValue(this.value).onChange((value) => (this.value = value))
			text.inputEl.addEventListener('keydown', (event) => {
				if (event.key === 'Enter') {
					event.preventDefault()
					this.submit()
				}
			})
			window.setTimeout(() => text.inputEl.select())
		})

		this.errorEl = this.contentEl.createEl('p', {
			cls: 'task-time-tracker-prompt-error',
		})

		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close())
			)
			.addButton((button) =>
				button
					.setButtonText(this.options.confirmText ?? 'OK')
					.setCta()
					.onClick(() => this.submit())
			)
	}

	onClose(): void {
		this.contentEl.empty()
		if (!this.submitted) this.resolve(null)
	}

	private submit(): void {
		const value = this.value.trim()
		const error = this.options.validate?.(value) ?? null
		if (error) {
			this.errorEl?.setText(error)
			return
		}
		this.submitted = true
		this.resolve(value)
		this.close()
	}
}
