import { Menu } from 'obsidian'
import { CHART_COLOR_PRESETS } from 'core/chartColors'

/**
 * Menu behind a color swatch: the theme palette presets, a native picker for
 * a custom hex, and a remove entry when a color is set (or `removable`).
 * `onPick` receives the chosen CSS color, or null to clear it.
 */
export function openColorMenu(
	event: MouseEvent,
	current: string | undefined,
	onPick: (color: string | null) => void,
	/** Offer removal even without a single current color (bulk edits). */
	removable = current !== undefined
): void {
	// Created ahead of the click so the browser has laid the input out by the
	// time the native picker anchors to it (a first-use race misplaced it).
	ensureColorInput(event)

	const menu = new Menu()
	for (const preset of CHART_COLOR_PRESETS) {
		menu.addItem((item) =>
			item
				.setTitle(preset.name)
				.setChecked(preset.value === current)
				.onClick(() => onPick(preset.value))
		)
	}
	menu.addSeparator()
	menu.addItem((item) =>
		item
			.setTitle('Custom color…')
			.setIcon('palette')
			.onClick(() => pickCustomColor(event, current, onPick))
	)
	if (removable) {
		menu.addItem((item) =>
			item
				.setTitle('Remove color')
				.setIcon('trash')
				.onClick(() => onPick(null))
		)
	}
	menu.showAtMouseEvent(event)
}

/** One hidden reused input; `change` only fires when the picker is closed. */
let colorInput: HTMLInputElement | null = null

/**
 * The input must live inside the modal the swatch was clicked in: parked on
 * the body it sits below the modal stack, and the focus pull of a stacked
 * modal (settings under the manager) closes the native picker right away.
 */
function ensureColorInput(event: MouseEvent): HTMLInputElement {
	if (!colorInput) {
		colorInput = document.createElement('input')
		colorInput.type = 'color'
		colorInput.addClass('task-time-tracker-color-input')
	}
	const host =
		event.target instanceof HTMLElement
			? (event.target.closest('.modal') ?? document.body)
			: document.body
	if (colorInput.parentElement !== host) host.appendChild(colorInput)
	return colorInput
}

function pickCustomColor(
	event: MouseEvent,
	current: string | undefined,
	onPick: (color: string) => void
): void {
	const input = ensureColorInput(event)
	// The native picker pops up anchored to the input, so put the invisible
	// input where the user clicked.
	input.style.left = `${event.clientX}px`
	input.style.top = `${event.clientY}px`
	// Force the layout flush; clicking with a dirty layout anchors the picker
	// to a stale position.
	input.getBoundingClientRect()
	if (current && /^#[0-9a-fA-F]{6}$/.test(current)) input.value = current
	input.onchange = () => onPick(input.value)
	input.click()
}
