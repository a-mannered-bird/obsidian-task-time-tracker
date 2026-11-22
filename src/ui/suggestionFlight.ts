/** A suggestion added shorter ago than this still flies to its card. */
const FLIGHT_WINDOW_MS = 2000

type Departure = { from: DOMRect; at: number }

/**
 * A suggested card flying to the goal card it adds (both keyed by the goal
 * id): the suggestion's box is noted when it is added, and the goal card,
 * once the note is rewritten and it renders, grows from there.
 *
 * Plain Web Animations on mount rather than Svelte's crossfade: with in/out
 * transitions on these keyed lists the goal cards sometimes stopped
 * rendering after the note changed under them (seen in the E2E suite).
 * This also keeps outside edits of the note still: only an add flies.
 */
export function suggestionFlight() {
	const suggestions = new Map<string, Element>()
	const departures = new Map<string, Departure>()

	const still = () =>
		window.matchMedia('(prefers-reduced-motion: reduce)').matches

	return {
		/** Svelte action on a suggested card. */
		suggestion(node: Element, id: string) {
			suggestions.set(id, node)
			return {
				destroy() {
					if (suggestions.get(id) === node) suggestions.delete(id)
				},
			}
		},
		/** Note where the suggestions are, right before they are added. */
		depart(ids: string[]) {
			const at = performance.now()
			for (const id of ids) {
				const node = suggestions.get(id)
				if (node) departures.set(id, { from: node.getBoundingClientRect(), at })
			}
		},
		/** Svelte action on a goal card: fly in from its suggestion, if any. */
		arrive(node: HTMLElement, id: string) {
			const departure = departures.get(id)
			departures.delete(id)
			if (!departure || still()) return
			if (performance.now() - departure.at > FLIGHT_WINDOW_MS) return
			const to = node.getBoundingClientRect()
			if (to.width === 0 || to.height === 0) return
			const { from } = departure
			const dx = from.left - to.left
			const dy = from.top - to.top
			node.animate(
				[
					{
						transformOrigin: 'top left',
						transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width}, ${from.height / to.height})`,
						opacity: 0.4,
					},
					{ transformOrigin: 'top left', transform: 'none', opacity: 1 },
				],
				{
					duration: Math.min(450, 150 + Math.sqrt(Math.hypot(dx, dy)) * 15),
					easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
				}
			)
		},
	}
}
