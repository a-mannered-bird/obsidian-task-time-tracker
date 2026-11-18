import { displayTooltip } from 'obsidian'
import type { HintLine } from 'core/shortcuts'

const LABEL = 'aria-label'

/** Lines shown in the tooltip; null ones are skipped. */
export type TooltipHint = () => (string | HintLine | null)[]

/**
 * Svelte action: show a tooltip as soon as the pointer is over the element,
 * rather than after Obsidian's default delay, with the hint's lines.
 *
 * A button showing text shows the hint alone, its text already saying what
 * it is; an icon-only button shows its aria-label above the hint, being
 * otherwise unnamed on screen. The lines are read when the pointer enters,
 * so they are current.
 *
 * Obsidian's own tooltip shows the aria-label as plain text; this one is
 * built as a fragment, so an aside line can be styled. The element opts
 * out of Obsidian's (`--no-tooltip`, which it checks before showing one)
 * and keeps its aria-label untouched as its accessible name.
 */
export function instantTooltip(el: HTMLElement, hint?: TooltipHint) {
	let currentHint = hint
	let hovered = false
	el.addClass('task-time-tracker-own-tooltip')
	// Obsidian hides tooltips when the pointer leaves an element carrying
	// an aria-label, and only then: a text button gets its text as one.
	if (!el.hasAttribute(LABEL)) {
		const text = el.textContent?.trim()
		if (text) el.setAttribute(LABEL, text)
	}

	const lines = (): (string | HintLine)[] => {
		const extra = (currentHint?.() ?? []).filter((line) => line !== null)
		const showsText = Boolean(el.textContent?.trim())
		const label = el.getAttribute(LABEL)
		return showsText || !label ? extra : [label, ...extra]
	}
	const show = () => {
		const shown = lines()
		if (shown.length === 0) return
		const fragment = new DocumentFragment()
		for (const line of shown) {
			if (typeof line === 'string') fragment.createDiv({ text: line })
			else
				fragment.createDiv({
					text: line.text,
					cls: line.aside ? 'task-time-tracker-tooltip-aside' : undefined,
				})
		}
		// Delay 0 shows it at once, before Obsidian's listener on the body
		// runs; any delay would be a timer that listener cancels.
		displayTooltip(el, fragment, { delay: 0 })
	}

	// The label can change while the pointer is over the element (a time
	// set from the button under it).
	const observer = new MutationObserver(() => {
		if (hovered) show()
	})
	observer.observe(el, { attributes: true, attributeFilter: [LABEL] })
	// Not pointerenter: Obsidian handles tooltips from a pointerover
	// listener on the body, which this one must precede.
	const enter = (event: PointerEvent) => {
		// Like Obsidian's own: no tooltip on touch.
		if (event.pointerType !== 'mouse' || hovered) return
		hovered = true
		show()
	}
	const leave = () => {
		hovered = false
	}
	el.addEventListener('pointerover', enter)
	el.addEventListener('pointerleave', leave)
	return {
		update(next?: TooltipHint) {
			currentHint = next
		},
		destroy() {
			observer.disconnect()
			el.removeEventListener('pointerover', enter)
			el.removeEventListener('pointerleave', leave)
		},
	}
}
