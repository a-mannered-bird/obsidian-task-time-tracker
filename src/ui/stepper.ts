import { setIcon } from 'obsidian'

type StepperOptions = {
	/** The input's accessible name. */
	label: string
	lessLabel: string
	moreLabel: string
	onStep: (direction: 1 | -1, event: MouseEvent) => void
}

/** A number input between − and + buttons, styled as one field. */
export function createStepper(
	parent: HTMLElement,
	options: StepperOptions
): HTMLInputElement {
	const stepper = parent.createDiv({ cls: 'task-time-tracker-stepper' })
	const less = stepper.createEl('button', {
		cls: 'clickable-icon',
		attr: { type: 'button', 'aria-label': options.lessLabel },
	})
	setIcon(less, 'minus')
	const input = stepper.createEl('input', {
		cls: 'task-time-tracker-stepper-input',
		attr: { type: 'number', 'aria-label': options.label },
	})
	const more = stepper.createEl('button', {
		cls: 'clickable-icon',
		attr: { type: 'button', 'aria-label': options.moreLabel },
	})
	setIcon(more, 'plus')
	less.addEventListener('click', (event) => options.onStep(-1, event))
	more.addEventListener('click', (event) => options.onStep(1, event))
	return input
}
