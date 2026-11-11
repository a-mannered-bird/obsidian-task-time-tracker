import { Notice, type TFile } from 'obsidian'
import { rewriteNote } from 'core/noteRewrite'
import { describeClockEdit, retimeClock } from 'core/timeline'
import { BUSY_NOTICE } from 'core/trackingRun'
import type { ClockKey, ClockTimes } from 'types/tasks'
import { showUndoNotice } from 'ui/undoNotice'
import type TaskTimeTracker from '../main'
import { NOTICE_DURATION, noteIo } from './target'

const GONE_NOTICE = 'The clock changed elsewhere, nothing was written.'

/** Only the latest edit can be undone; its notice goes when another lands. */
let undoNotice: Notice | null = null

/**
 * Write new times to one clock line, found by what it held when the
 * timeline read it. True when the note now holds the new times.
 */
export async function retimeClockLine(
	plugin: TaskTimeTracker,
	file: TFile,
	key: ClockKey,
	times: ClockTimes,
	undoable = true
): Promise<boolean> {
	const outcome = await rewriteNote(noteIo(plugin, file), (content) =>
		retimeClock(content, key, times)
	)
	if (outcome === 'gone') new Notice(GONE_NOTICE, NOTICE_DURATION)
	if (outcome === 'busy') new Notice(BUSY_NOTICE, NOTICE_DURATION)
	if (outcome !== 'written') return outcome === 'unchanged'

	undoNotice?.hide()
	undoNotice = null
	if (undoable) {
		const notice = showUndoNotice(
			describeClockEdit(key.taskName, key, times),
			() => {
				undoNotice = null
				void retimeClockLine(
					plugin,
					file,
					{ taskName: key.taskName, ...times },
					{ start: key.start, end: key.end },
					false
				)
			}
		)
		undoNotice = notice
	}
	return true
}
