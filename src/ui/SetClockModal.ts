import { Modal, Setting, type App } from 'obsidian'
import {
	describeClockLength,
	type ClockField,
	type TypedClock,
} from 'core/setClock'
import { formatTimeOfDay } from 'core/timeline'
import type { FinishedClockTimes } from 'types/tasks'
import { focusInput } from './focusInput'

export type SetClockRequest = {
	title: string
	description: string
	/** The times the fields open with. */
	initial: FinishedClockTimes
	parse: (start: string, end: string) => TypedClock
}

/** Ask for a clock's start and end as times of day. Null when dismissed. */
export function promptClock(
	app: App,
	request: SetClockRequest
): Promise<FinishedClockTimes | null> {
	return new Promise((resolve) => {
		new SetClockModal(app, request, resolve).open()
	})
}

class SetClockModal extends Modal {
	private submitted = false
	private inputs: Record<ClockField, HTMLInputElement | null> = {
		start: null,
		end: null,
	}
	private statusEl: HTMLElement | null = null

	constructor(
		app: App,
		private request: SetClockRequest,
		private resolve: (times: FinishedClockTimes | null) => void
	) {
		super(app)
	}

	onOpen(): void {
		const { request, contentEl } = this
		this.setTitle(request.title)
		contentEl.createEl('p', { text: request.description })

		const fields = contentEl.createDiv({
			cls: 'task-time-tracker-clock-fields',
		})
		this.inputs.start = this.buildField(fields, 'Start', request.initial.start)
		this.inputs.end = this.buildField(fields, 'End', request.initial.end)

		this.statusEl = contentEl.createEl('p', {
			cls: 'task-time-tracker-prompt-status',
			attr: { role: 'status' },
		})
		this.showStatus()

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close())
			)
			.addButton((button) =>
				button
					.setButtonText('Add clock')
					.setCta()
					.onClick(() => this.submit())
			)

		focusInput(this.inputs.start, { select: false })
	}

	onClose(): void {
		this.contentEl.empty()
		if (!this.submitted) this.resolve(null)
	}

	private buildField(
		parent: HTMLElement,
		label: string,
		value: Date
	): HTMLInputElement {
		const field = parent.createEl('label', {
			cls: 'task-time-tracker-time-option',
		})
		field.createSpan({ cls: 'task-time-tracker-time-label', text: label })
		const input = field.createEl('input', {
			cls: 'task-time-tracker-time-input',
			attr: { type: 'time', 'aria-label': label },
		})
		input.value = formatTimeOfDay(value)
		input.addEventListener('input', () => this.showStatus())
		input.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault()
				this.submit()
			}
		})
		return input
	}

	private parse(): TypedClock {
		return this.request.parse(
			this.inputs.start?.value ?? '',
			this.inputs.end?.value ?? ''
		)
	}

	/** The clock's length while valid, else what is wrong, as it is typed. */
	private showStatus(): TypedClock {
		const parsed = this.parse()
		const invalid = 'error' in parsed ? parsed.fields : []
		for (const field of ['start', 'end'] as const) {
			this.inputs[field]?.setAttribute(
				'aria-invalid',
				String(invalid.includes(field))
			)
		}
		const isError = 'error' in parsed
		this.statusEl?.toggleClass('is-error', isError)
		this.statusEl?.setText(
			isError ? parsed.error : describeClockLength(parsed.times)
		)
		return parsed
	}

	private submit(): void {
		const parsed = this.showStatus()
		if ('error' in parsed) return
		this.submitted = true
		this.resolve(parsed.times)
		this.close()
	}
}
