import { Modal, Setting, setIcon, type App } from 'obsidian'
import type { TimeRequest } from 'core/toggle'
import {
	describeOtherDay,
	minutesBefore,
	timeOfDayBefore,
} from 'core/typedTime'
import { formatTimeOfDay } from 'core/timeline'

type Request = TimeRequest & { confirmText?: string }

/** Shift-clicking a stepper moves by this many minutes. */
const BIG_STEP = 5

/**
 * Ask for a time as minutes before the request's reference or as a time of
 * day: one choice shown as two fields kept in step. Null when dismissed.
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
		const { request, contentEl } = this
		this.setTitle(request.title)
		if (request.description) {
			contentEl.createEl('p', { text: request.description })
		}

		const choice = contentEl.createDiv({ cls: 'task-time-tracker-time-choice' })
		this.minutesEl = this.buildMinutes(
			choice.createDiv({ cls: 'task-time-tracker-time-option' })
		)
		choice.createSpan({ cls: 'task-time-tracker-time-or', text: 'or' })
		this.timeEl = this.buildTime(
			choice.createDiv({ cls: 'task-time-tracker-time-option' })
		)

		this.statusEl = contentEl.createEl('p', {
			cls: 'task-time-tracker-prompt-status',
		})

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close())
			)
			.addButton((button) =>
				button
					.setButtonText(request.confirmText ?? 'OK')
					.setCta()
					.onClick(() => this.submit())
			)

		const minutes = this.minutesEl
		window.setTimeout(() => minutes.select())
	}

	onClose(): void {
		this.contentEl.empty()
		if (!this.submitted) this.resolve(null)
	}

	private buildMinutes(option: HTMLElement): HTMLInputElement {
		const label = this.request.minutesLabel ?? 'Minutes ago'
		option.createSpan({ cls: 'task-time-tracker-time-label', text: label })
		const stepper = option.createDiv({ cls: 'task-time-tracker-stepper' })
		const less = stepper.createEl('button', {
			cls: 'clickable-icon',
			attr: { type: 'button', 'aria-label': 'One minute less' },
		})
		setIcon(less, 'minus')
		const input = stepper.createEl('input', {
			cls: 'task-time-tracker-minutes-input',
			attr: { type: 'number', step: '1', 'aria-label': label },
		})
		input.value = '0'
		const more = stepper.createEl('button', {
			cls: 'clickable-icon',
			attr: { type: 'button', 'aria-label': 'One minute more' },
		})
		setIcon(more, 'plus')
		option.createSpan({
			cls: 'task-time-tracker-time-hint',
			text: 'Negative is in the future',
		})

		input.addEventListener('input', () => this.minutesTyped(input.value))
		const step = (sign: number) => (event: MouseEvent) => {
			const current = parseInt(input.value, 10)
			const by = event.shiftKey ? BIG_STEP : 1
			input.value = String((isNaN(current) ? 0 : current) + sign * by)
			this.minutesTyped(input.value)
		}
		less.addEventListener('click', step(-1))
		more.addEventListener('click', step(1))
		this.submitOnEnter(input)
		return input
	}

	private buildTime(option: HTMLElement): HTMLInputElement {
		option.createSpan({ cls: 'task-time-tracker-time-label', text: 'Time' })
		const input = option.createEl('input', {
			cls: 'task-time-tracker-time-input',
			attr: { type: 'time', 'aria-label': 'Time' },
		})
		input.value = formatTimeOfDay(this.request.reference)
		input.addEventListener('input', () => this.timeTyped(input.value))
		this.submitOnEnter(input)
		return input
	}

	private minutesTyped(value: string): void {
		this.typed = value
		const time = timeOfDayBefore(value, this.request.reference)
		if (this.timeEl && time !== null) this.timeEl.value = time
		this.showStatus()
	}

	private timeTyped(value: string): void {
		this.typed = value
		const parsed = this.request.parse(value)
		if (this.minutesEl && 'at' in parsed) {
			this.minutesEl.value = String(
				minutesBefore(parsed.at, this.request.reference)
			)
		}
		this.showStatus()
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
