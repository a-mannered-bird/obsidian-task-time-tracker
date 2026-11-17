import { Modal, Setting, type App } from 'obsidian'
import type { TimeRequest } from 'core/toggle'
import {
	describeOtherDay,
	minutesBefore,
	timeOfDayBefore,
} from 'core/typedTime'
import { formatTimeOfDay } from 'core/timeline'

type Request = TimeRequest & { confirmText?: string }

/**
 * Ask for a time as minutes before the request's reference or as a time of
 * day, two fields kept in step. Null when dismissed.
 */
export function promptTime(app: App, request: Request): Promise<Date | null> {
	return new Promise((resolve) => {
		new TimePromptModal(app, request, resolve).open()
	})
}

class TimePromptModal extends Modal {
	private submitted = false
	/** The field typed in last: its value is the one submitted. */
	private typed = '0'
	private minutesEl: HTMLInputElement | null = null
	private timeEl: HTMLInputElement | null = null
	/** Under the fields: the day when it is not the reference's, or the error. */
	private statusEl: HTMLElement | null = null

	constructor(
		app: App,
		private request: Request,
		private resolve: (at: Date | null) => void
	) {
		super(app)
	}

	onOpen(): void {
		const { request } = this
		this.setTitle(request.title)
		if (request.description) {
			this.contentEl.createEl('p', { text: request.description })
		}

		const minutesLabel = request.minutesLabel ?? 'Minutes ago'
		new Setting(this.contentEl)
			.setName(minutesLabel)
			.setDesc('Negative is in the future.')
			.addText((text) => {
				const input = text.inputEl
				input.type = 'number'
				input.step = '1'
				input.setAttribute('aria-label', minutesLabel)
				text.setValue('0').onChange((value) => {
					this.typed = value
					if (this.timeEl) {
						const time = timeOfDayBefore(value, request.reference)
						if (time !== null) this.timeEl.value = time
					}
					this.showStatus()
				})
				this.submitOnEnter(input)
				this.minutesEl = input
				window.setTimeout(() => input.select())
			})

		new Setting(this.contentEl).setName('Time').addText((text) => {
			const input = text.inputEl
			input.type = 'time'
			input.setAttribute('aria-label', 'Time')
			text.setValue(formatTimeOfDay(request.reference)).onChange((value) => {
				this.typed = value
				const parsed = request.parse(value)
				if (this.minutesEl && 'at' in parsed) {
					this.minutesEl.value = String(
						minutesBefore(parsed.at, request.reference)
					)
				}
				this.showStatus()
			})
			this.submitOnEnter(input)
			this.timeEl = input
		})

		this.statusEl = this.contentEl.createEl('p', {
			cls: 'task-time-tracker-prompt-status',
		})

		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close())
			)
			.addButton((button) =>
				button
					.setButtonText(request.confirmText ?? 'OK')
					.setCta()
					.onClick(() => this.submit())
			)
	}

	onClose(): void {
		this.contentEl.empty()
		if (!this.submitted) this.resolve(null)
	}

	private submitOnEnter(input: HTMLInputElement): void {
		input.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault()
				this.submit()
			}
		})
	}

	private showStatus(): void {
		if (this.typed.trim() === '') {
			this.setStatus('', false)
			return
		}
		const parsed = this.request.parse(this.typed)
		if ('error' in parsed) this.setStatus(parsed.error, true)
		else
			this.setStatus(
				describeOtherDay(parsed.at, this.request.reference) ?? '',
				false
			)
	}

	private setStatus(text: string, isError: boolean): void {
		this.statusEl?.toggleClass('is-error', isError)
		this.statusEl?.setText(text)
	}

	private submit(): void {
		const parsed = this.request.parse(this.typed)
		if ('error' in parsed) {
			this.setStatus(parsed.error, true)
			return
		}
		this.submitted = true
		this.resolve(parsed.at)
		this.close()
	}
}
