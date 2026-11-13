import { setTooltip } from 'obsidian'

const LABEL = 'aria-label'

/**
 * In ms. Not 0: Obsidian takes a 0 delay for none given and waits its
 * default second (measured on 1.15).
 */
const DELAY = 1

/**
 * Svelte action: show the element's aria-label as Obsidian's tooltip as
 * soon as the pointer is over it, rather than after the default delay.
 * The label stays in the markup (it names the element); the tooltip
 * follows it when it changes.
 */
export function instantTooltip(el: HTMLElement) {
	let shown: string | null = null
	const apply = () => {
		const label = el.getAttribute(LABEL)
		// setTooltip writes the label back: skip that echo.
		if (label === null || label === shown) return
		shown = label
		setTooltip(el, label, { delay: DELAY })
	}
	apply()
	const observer = new MutationObserver(apply)
	observer.observe(el, { attributes: true, attributeFilter: [LABEL] })
	return {
		destroy() {
			observer.disconnect()
		},
	}
}
