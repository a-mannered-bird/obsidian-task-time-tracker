import { Notice } from 'obsidian'
import { NOTICE_ICON } from 'core/noticeText'

const KEEP_OPEN = 'Keep the vault open until this finishes.'

/**
 * Run a long bulk job behind a persistent notice: "<label> 37/121…" on the
 * first line, the keep-the-vault-open warning on its own second line so the
 * notice keeps its size while the counter changes. Hidden when the job
 * settles, whatever the outcome.
 */
export async function withProgressNotice<T>(
	label: string,
	job: (onProgress: (done: number, total: number) => void) => Promise<T>
): Promise<T> {
	const notice = new Notice(progressMessage(label, 0, 0), 0)
	try {
		return await job((done, total) =>
			notice.setMessage(progressMessage(label, done, total))
		)
	} finally {
		notice.hide()
	}
}

function progressMessage(
	label: string,
	done: number,
	total: number
): DocumentFragment {
	const fragment = document.createDocumentFragment()
	const count = total ? ` ${done}/${total}` : ''
	fragment.appendText(`${NOTICE_ICON.progress} ${label}${count}…`)
	fragment.createEl('br')
	fragment.appendText(KEEP_OPEN)
	return fragment
}
