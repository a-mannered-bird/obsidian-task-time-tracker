import { addIcon } from 'obsidian'

export const STOP_AT_ICON = 'task-time-tracker-stop-at'
export const START_AT_ICON = 'task-time-tracker-start-at'

/** Lucide's clock, left open at the bottom right for a badge (as in `clock-arrow-up`). */
const OPEN_CLOCK =
	'<path d="M13.227 21.925a10 10 0 1 1 8.767-9.588"/><path d="M12 6v6l1.56.78"/>'

/**
 * Drawn on Lucide's 24-unit grid with its round caps and joins, then scaled
 * to the 100-unit box `addIcon` requires. The stroke width is left to
 * Obsidian's icon CSS, so the scale applies to it as it does to Lucide's.
 */
function lucideStyle(paths: string): string {
	return `<g transform="scale(${100 / 24})" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`
}

/** Stop and start at a chosen time: the row's stop and play glyphs on a clock. */
export function registerCustomIcons() {
	addIcon(
		STOP_AT_ICON,
		lucideStyle(
			`${OPEN_CLOCK}<rect x="15" y="15" width="7" height="7" rx="1"/>`
		)
	)
	addIcon(
		START_AT_ICON,
		lucideStyle(
			`${OPEN_CLOCK}<path d="M15.5 14.8v7.4a.6.6 0 0 0 .9.5l5.6-3.7a.6.6 0 0 0 0-1l-5.6-3.7a.6.6 0 0 0-.9.5z"/>`
		)
	)
}
