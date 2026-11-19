/** The nearest ancestor that scrolls vertically, or the document. */
export function findScroller(element: HTMLElement): HTMLElement {
	for (let node = element.parentElement; node; node = node.parentElement) {
		const { overflowY } = getComputedStyle(node)
		if (overflowY === 'auto' || overflowY === 'scroll') return node
	}
	return document.documentElement
}

/** Gap kept between a fitted popover and the bottom of its scroller. */
const FIT_MARGIN_PX = 8

/**
 * Svelte action capping a popover's height to the room left below its top
 * in the scroller, which clips it otherwise. The room is measured again
 * whenever the scroller resizes: on mobile, it shrinks once the keyboard
 * opens, which happens after the popover shows.
 */
export function fitInScroller(el: HTMLElement) {
	const scroller = findScroller(el)
	const fit = () => {
		const room =
			scroller.getBoundingClientRect().bottom -
			el.getBoundingClientRect().top -
			FIT_MARGIN_PX
		el.style.setProperty('--fit-height', `${Math.max(room, 0)}px`)
	}
	const observer = new ResizeObserver(fit)
	observer.observe(scroller)
	fit()
	return {
		destroy() {
			observer.disconnect()
		},
	}
}
