import type { Notice } from 'obsidian'
import { describeCrossing, type GoalCrossing } from 'core/goalCrossings'
import { showActionNotice } from './undoNotice'

/** The notice of each goal by card id: a goal crossing again replaces its own. */
const shown = new Map<string, Notice>()

/** One notice per goal behind a sound, kept until dismissed. */
export function showCrossingNotices(crossings: GoalCrossing[]): void {
	for (const crossing of crossings) {
		const id = crossing.card.id
		shown.get(id)?.hide()
		const notice = showActionNotice(
			describeCrossing(crossing),
			[
				{
					label: 'Dismiss',
					run: () => {
						notice.hide()
						if (shown.get(id) === notice) shown.delete(id)
					},
				},
			],
			0
		)
		shown.set(id, notice)
	}
}

export function hideCrossingNotices(): void {
	for (const notice of shown.values()) notice.hide()
	shown.clear()
}
