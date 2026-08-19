import { Modal, Setting, type App } from 'obsidian'

type Options = {
	title: string
	description?: string
	defaultValue?: number
}

/**
 * Ask for a number of minutes. Resolves with the integer entered, or null
 * when the prompt is dismissed. Invalid input keeps the prompt open.
 */
export function promptMinutes(
	app: App,
	options: Options
): Promise<number | null> {
	return new Promise((resolve) => {
		new MinutesPromptModal(app, options, resolve).open()
	})
}

class MinutesPromptModal extends Modal {
	private submitted = false
	private value = ''
	private errorEl: HTMLElement | null = null

	constructor(
		app: App,
		private options: Options,
		private resolve: (minutes: number | null) => void
	) {
		super(app)
		this.value = options.defaultValue?.toString() ?? ''
	}

	onOpen(): void {
		this.setTitle(this.options.title)
		if (this.options.description) {
			this.contentEl.createEl('p', { text: this.options.description })
		}

		new Setting(this.contentEl).setName('Minutes').addText((text) => {
			text.inputEl.type = 'number'
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

		new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText('OK')
				.setCta()
				.onClick(() => this.submit())
		)
	}

	onClose(): void {
		this.contentEl.empty()
		if (!this.submitted) this.resolve(null)
	}

	private submit(): void {
		const minutes = parseInt(this.value, 10)
		if (isNaN(minutes)) {
			this.errorEl?.setText('Please enter a whole number of minutes.')
			return
		}
		this.submitted = true
		this.resolve(minutes)
		this.close()
	}
}
