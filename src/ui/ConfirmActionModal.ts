import { Modal, Setting, type App, type ButtonComponent } from 'obsidian'
import { confirmationMatches } from 'core/confirmations'

type Options = {
	title: string
	/** Preview paragraphs, e.g. from describeConsolidation. */
	message: string[]
	/** Highlighted lines, e.g. dangling references (see referenceWarnings). */
	warnings?: string[]
	confirmText?: string
	/** Offer a choice (the surviving name of a merge); resolved with it. */
	choice?: {
		label: string
		options: string[]
		initial: string
	}
	/**
	 * The type-the-name ritual: the confirm button stays disabled until the
	 * user types this text — or, given a function, the text for the current
	 * choice. Omit for the light confirmation of non-destructive operations.
	 */
	typeToConfirm?: string | ((choice: string) => string)
}

export type ConfirmedAction = { choice: string }

/**
 * Confirmation of a bulk operation. Resolves with the confirmed choice (an
 * empty string when no choice was offered), or null when cancelled.
 */
export function confirmAction(
	app: App,
	options: Options
): Promise<ConfirmedAction | null> {
	return new Promise((resolve) => {
		new ConfirmActionModal(app, options, resolve).open()
	})
}

class ConfirmActionModal extends Modal {
	private confirmed = false
	private choice: string
	private typed = ''
	private typeSetting: Setting | null = null
	private confirmButton: ButtonComponent | null = null

	constructor(
		app: App,
		private options: Options,
		private resolve: (result: ConfirmedAction | null) => void
	) {
		super(app)
		this.choice = options.choice?.initial ?? ''
	}

	onOpen(): void {
		const { options, contentEl } = this
		this.setTitle(options.title)
		for (const paragraph of options.message) {
			contentEl.createEl('p', { text: paragraph })
		}
		for (const warning of options.warnings ?? []) {
			contentEl.createEl('p', {
				text: `⚠️ ${warning}`,
				cls: 'task-time-tracker-warning',
			})
		}

		if (options.choice) {
			const { label, options: choices } = options.choice
			new Setting(contentEl).setName(label).addDropdown((dropdown) => {
				for (const option of choices) dropdown.addOption(option, option)
				dropdown.setValue(this.choice).onChange((value) => {
					this.choice = value
					this.updateConfirmState()
				})
			})
		}

		if (options.typeToConfirm !== undefined) {
			this.typeSetting = new Setting(contentEl).addText((text) => {
				text.onChange((value) => {
					this.typed = value
					this.updateConfirmState()
				})
				text.inputEl.addEventListener('keydown', (event) => {
					if (event.key === 'Enter' && this.canConfirm()) {
						event.preventDefault()
						this.confirm()
					}
				})
				window.setTimeout(() => text.inputEl.focus())
			})
		}

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close())
			)
			.addButton((button) => {
				this.confirmButton = button
				button
					.setButtonText(options.confirmText ?? 'Confirm')
					.onClick(() => this.confirm())
				// Red only for the destructive ritual; a rename is a plain action.
				if (options.typeToConfirm !== undefined) button.setWarning()
				else button.setCta()
			})
		this.updateConfirmState()
	}

	onClose(): void {
		this.contentEl.empty()
		this.resolve(this.confirmed ? { choice: this.choice } : null)
	}

	private expectedText(): string | undefined {
		const { typeToConfirm } = this.options
		return typeof typeToConfirm === 'function'
			? typeToConfirm(this.choice)
			: typeToConfirm
	}

	private canConfirm(): boolean {
		const expected = this.expectedText()
		return expected === undefined || confirmationMatches(this.typed, expected)
	}

	private updateConfirmState(): void {
		const expected = this.expectedText()
		if (expected !== undefined) {
			this.typeSetting?.setName(`Type "${expected}" to confirm`)
		}
		this.confirmButton?.setDisabled(!this.canConfirm())
	}

	private confirm(): void {
		if (!this.canConfirm()) return
		this.confirmed = true
		this.close()
	}
}
