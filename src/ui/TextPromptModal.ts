import {
	ButtonComponent,
	Modal,
	Setting,
	TextComponent,
	type App,
} from 'obsidian'
import { focusInput } from './focusInput'
import { createStepper } from './stepper'

export type PromptCheckbox = {
	label: string
	checked: boolean
	onChange: (checked: boolean) => void
}

type Options = {
	title: string
	description?: string
	label: string
	/** How to fill the input, under its label. */
	hint?: string
	initialValue?: string
	placeholder?: string
	confirmText?: string
	/**
	 * A number field opens the numeric keyboard; it stays a text input so
	 * that `+2` and `,` can be typed.
	 */
	inputType?: 'text' | 'number'
	/**
	 * For a number input: the value one − / + step away from the one typed,
	 * shown as buttons on either side of the input.
	 */
	step?: (value: string, direction: 1 | -1) => string
	/** Error shown under the input for an unacceptable value; null = fine. */
	validate?: (value: string) => string | null
	/** What the value means, shown under the input as it is typed. */
	preview?: (value: string) => string | null
	/** A checkbox under the input, applied as soon as it changes. */
	checkbox?: PromptCheckbox
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
	/** The line under the input: the preview, or the error after a submit. */
	private statusEl: HTMLElement | null = null

	constructor(
		app: App,
		private options: Options,
		private resolve: (value: string | null) => void
	) {
		super(app)
		this.value = options.initialValue ?? ''
	}

	onOpen(): void {
		this.modalEl.addClass('task-time-tracker-text-prompt')
		this.setTitle(this.options.title)
		if (this.options.description) {
			this.contentEl.createEl('p', { text: this.options.description })
		}

		const { label, hint, inputType, step, placeholder } = this.options
		const setting = new Setting(this.contentEl).setName(label)
		if (hint) setting.setDesc(hint)
		const control = setting.controlEl
		const input =
			inputType === 'number' && step
				? createStepper(control, {
						label,
						lessLabel: `Decrease ${label}`,
						moreLabel: `Increase ${label}`,
						onStep: (direction) => {
							input.value = step(input.value, direction)
							this.typed(input.value)
						},
					})
				: new TextComponent(control).inputEl
		if (inputType === 'number') {
			input.type = 'text'
			input.inputMode = 'decimal'
		}
		input.placeholder = placeholder ?? ''
		input.value = this.value
		input.addEventListener('input', () => this.typed(input.value))
		input.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault()
				this.submit()
			}
		})
		focusInput(input, { select: true })

		this.statusEl = this.contentEl.createEl('p', {
			cls: [
				'task-time-tracker-prompt-status',
				...(this.options.preview ? [] : ['mod-errors-only']),
			],
		})
		this.showPreview()

		// Obsidian's own layout for a "don't ask again" box: on the left of
		// the buttons' row.
		const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' })
		const { checkbox } = this.options
		if (checkbox) {
			const label = buttons.createEl('label', { cls: 'mod-checkbox' })
			const box = label.createEl('input', { type: 'checkbox' })
			box.checked = checkbox.checked
			box.addEventListener('change', () => checkbox.onChange(box.checked))
			label.appendText(checkbox.label)
		}
		new ButtonComponent(buttons)
			.setButtonText('Cancel')
			.onClick(() => this.close())
		new ButtonComponent(buttons)
			.setButtonText(this.options.confirmText ?? 'OK')
			.setCta()
			.onClick(() => this.submit())
	}

	onClose(): void {
		this.contentEl.empty()
		if (!this.submitted) this.resolve(null)
	}

	private typed(value: string): void {
		this.value = value
		this.showPreview()
	}

	private showPreview(): void {
		const text = this.options.preview?.(this.value.trim()) ?? null
		this.statusEl?.removeClass('is-error')
		this.statusEl?.setText(text ?? '')
	}

	private submit(): void {
		const value = this.value.trim()
		const error = this.options.validate?.(value) ?? null
		if (error) {
			this.statusEl?.addClass('is-error')
			this.statusEl?.setText(error)
			return
		}
		this.submitted = true
		this.resolve(value)
		this.close()
	}
}
