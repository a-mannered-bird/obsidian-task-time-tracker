import { flip } from 'svelte/animate'
import type { AnimationConfig } from 'svelte/animate'
import {
	crossfade,
	fade,
	slide,
	type TransitionConfig,
} from 'svelte/transition'

const NONE: TransitionConfig = { duration: 0 }
const MOVE_MS = 200
const SECTION_MS = 300

type Move = (
	node: Element,
	params: { key: string }
) => TransitionConfig | (() => TransitionConfig)

/**
 * Transitions for task rows moving between the tracker's lists: a row
 * leaving one list flies to its place in the other (crossfade, paired by
 * task name), the rows staying slide to their new place (flip), and rows
 * with no counterpart fade. Sections opening or closing around them slide,
 * so the rows below move with the flight instead of jumping at its end.
 *
 * Still while the note shown changes (another day, or the first load), so
 * only changes within one note move rows, and under reduced motion.
 */
export function rowMotion() {
	let still = true
	let shownPath: string | null | undefined

	const [send, receive] = crossfade({
		duration: (distance) => Math.min(450, Math.sqrt(distance) * 30),
		fallback: (node) => fade(node, { duration: 150 }),
	})

	const moving = () =>
		!still && !window.matchMedia('(prefers-reduced-motion: reduce)').matches

	// A row of the folded Done list has no box: flying to it would scale by
	// a zero size. Left unpaired, its counterpart fades instead.
	const paired =
		(move: Move): Move =>
		(node, params) =>
			moving() && node.getClientRects().length > 0 ? move(node, params) : NONE

	return {
		send: paired(send),
		receive: paired(receive),
		slide: (
			node: Element,
			fromTo: { from: DOMRect; to: DOMRect }
		): AnimationConfig =>
			moving() ? flip(node, fromTo, { duration: MOVE_MS }) : NONE,
		section: (node: Element): TransitionConfig =>
			moving() ? slide(node, { duration: SECTION_MS }) : NONE,
		/** Call before the tab goes away: it then leaves without moving. */
		stop() {
			still = true
		},
		/** Call before each render with the note shown (null for none yet). */
		show(path: string | null) {
			still = path !== shownPath
			shownPath = path
		},
	}
}
