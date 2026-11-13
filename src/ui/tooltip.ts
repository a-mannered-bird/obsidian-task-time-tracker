import { setTooltip } from 'obsidian'

const LABEL = 'aria-label'

/**
 * In ms. Not 0: Obsidian takes a 0 delay for none given and waits its
 * default second (measured on 1.15).
 */
const DELAY = 1

/** A line shown under the label, or null for none. */
export type TooltipHint = () => string | null

/**
 * Svelte action: show the element's aria-label as Obsidian's tooltip as
 * soon as the pointer is over it, rather than after the default delay.
 * The label stays in the markup (it names the element); the tooltip
 * follows it when it changes.
 *
 * With a `hint`, the tooltip adds its line under the label (or under the
 * text of a button without a label). Obsidian shows the aria-label as the
 * tooltip, so the hint is only written there while the pointer is over the
 * element, and read then, so it is current; leaving puts the label back,
 * keeping the element's name the label alone.
 */
export function instantTooltip(el: HTMLElement, hint?: TooltipHint) {
	let currentHint = hint
	let label = el.getAttribute(LABEL)
	/** What this action last wrote to the attribute. */
	let written: string | null = label
	let hovered = false

	const write = (text: string | null) => {
		if (text === written) return
		written = text
		if (text === null) el.removeAttribute(LABEL)
		// setTooltip writes the text to aria-label, which Obsidian shows.
		else setTooltip(el, text, { delay: DELAY })
	}
	const render = () => {
		const line = hovered ? currentHint?.() : null
		const name = label ?? el.textContent?.trim() ?? ''
		write(line && name ? `${name}\n${line}` : label)
	}

	if (label !== null) setTooltip(el, label, { delay: DELAY })
	const observer = new MutationObserver(() => {
		const current = el.getAttribute(LABEL)
		// Our own write, not a new label from the markup.
		if (current === written) return
		label = current
		written = current
		render()
	})
	observer.observe(el, { attributes: true, attributeFilter: [LABEL] })
	const enter = () => {
		hovered = true
		render()
	}
	const leave = () => {
		hovered = false
		render()
	}
	el.addEventListener('pointerenter', enter)
	el.addEventListener('pointerleave', leave)
	return {
		update(next?: TooltipHint) {
			currentHint = next
		},
		destroy() {
			observer.disconnect()
			el.removeEventListener('pointerenter', enter)
			el.removeEventListener('pointerleave', leave)
		},
	}
}
