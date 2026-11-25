import { setIcon } from 'obsidian'

type StepperOptions = {
	/** The input's accessible name. */
	label: string
	lessLabel: string
	moreLabel: string
	/** From the buttons, or the up and down arrows in the input. */
	onStep: (direction: 1 | -1, event: MouseEvent | KeyboardEvent) => void
}

/** The step of an up or down arrow press; null for any other key. */
export function arrowStep(event: KeyboardEvent): 1 | -1 | null {
	if (event.key === 'ArrowUp') return 1
	if (event.key === 'ArrowDown') return -1
	return null
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
	// The input may be a text one (to take `+n`), which has no arrow steps.
	input.addEventListener('keydown', (event) => {
		const direction = arrowStep(event)
		if (!direction) return
		event.preventDefault()
		options.onStep(direction, event)
	})
	return input
}
