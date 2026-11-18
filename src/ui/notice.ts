import { Notice } from 'obsidian'
import { noticeSegments } from 'core/noticeText'

/**
 * How long every notice about the clocks stays, buttons or not: long
 * enough to reach Change or Undo, and the same for all so none of them
 * reads as more or less important.
 */
export const NOTICE_DURATION = 8000

/** The notice text into `parent`, task names in bold. */
export function appendNoticeText(
	parent: HTMLElement | DocumentFragment,
	text: string
): void {
	for (const segment of noticeSegments(text)) {
		if (segment.isTask) parent.createEl('strong', { text: segment.text })
		else parent.appendText(segment.text)
	}
}

export function showNotice(text: string, duration = NOTICE_DURATION): Notice {
	const fragment = new DocumentFragment()
	appendNoticeText(fragment, text)
	return new Notice(fragment, duration)
}
