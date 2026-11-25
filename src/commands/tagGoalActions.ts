import type { TFile } from 'obsidian'
import type { TagGoal } from 'types/goals'
import { describeTagGoalDeleted, describeTagGoalSet } from 'core/goalCards'
import {
	parseTypedTimeTarget,
	parseTypedTimeTargetEdit,
	timeTargetAfter,
} from 'core/goalEdits'
import { recordWrites, rewriteNote } from 'core/noteRewrite'
import { NOTICE_ICON } from 'core/noticeText'
import {
	noteTagGoals,
	removeTagGoal,
	setTagGoals,
	updateTagGoal,
} from 'core/tagGoals'
import { typedTag } from 'core/taskEdits'
import { pickOption } from 'ui/OptionSuggestModal'
import { promptText } from 'ui/TextPromptModal'
import { showNotice } from 'ui/notice'
import { showUndoNotice } from 'ui/undoNotice'
import type TaskTimeTracker from '../main'
import { currentTarget, noteIo, readNoteContent, targetIo } from './target'
import { wrote } from './timelineEdits'
import { undoNoteWrite } from './undo'

/** Set a tag goal's target typed in its card: a duration, `<` for at most. */
export async function setTagGoalTarget(
	plugin: TaskTimeTracker,
	file: TFile,
	tag: string,
	typed: string
): Promise<void> {
	const time = parseTypedTimeTargetEdit(typed)
	if ('error' in time) {
		showNotice(`${NOTICE_ICON.warning} ${time.error}.`)
		return
	}
	wrote(
		await rewriteNote(noteIo(plugin, file), (content) =>
			updateTagGoal(content, tag, (goal) => ({
				...goal,
				...timeTargetAfter(goal, time),
			}))
		)
	)
}

/** Remove the tag goal from the note's `tag_goals`, with Undo. */
export async function deleteTagGoal(
	plugin: TaskTimeTracker,
	file: TFile,
	tag: string
): Promise<void> {
	const io = noteIo(plugin, file)
	const recorder = recordWrites(io)
	let deleted: TagGoal | null = null
	const outcome = await rewriteNote(recorder.io, (content) => {
		deleted = noteTagGoals(content).find((goal) => goal.tag === tag) ?? null
		return removeTagGoal(content, tag)
	})
	const write = recorder.written()
	if (!wrote(outcome) || !write || !deleted) return
	showUndoNotice(describeTagGoalDeleted(deleted), undoNoteWrite(io, write))
}

/**
 * Set tag goal…: pick a tag (those used in the vault, most recent first,
 * minus those with a goal on this day; or type a new one), then its time
 * target. Written to the note's `tag_goals`, with Change and Undo.
 */
export async function setTagGoalFlow(plugin: TaskTimeTracker): Promise<void> {
	const target = currentTarget(plugin)
	await plugin.vaultTasks.ensureBuilt()
	const content = target.file ? await readNoteContent(plugin, target.file) : ''
	const taken = new Set(noteTagGoals(content).map((goal) => goal.tag))
	const tag = await pickOption(plugin.app, {
		placeholder: 'Set a time goal for which tag?',
		options: plugin.vaultTasks
			.tagsByRecency()
			.filter((t) => !taken.has(t))
			.map((t) => ({ label: t, value: t })),
		create: (query) => {
			const typed = typedTag(query)
			return typed && !taken.has(typed)
				? { label: `➕ New tag "${typed}"`, value: typed }
				: null
		},
	})
	if (tag) await promptTagGoal(plugin, tag)
}

/** Ask for the tag's time target and write it to the command target's note. */
async function promptTagGoal(
	plugin: TaskTimeTracker,
	tag: string
): Promise<void> {
	const typed = await promptText(plugin.app, {
		title: `Time goal for ${tag}`,
		description:
			'Time covered by the tasks carrying the tag. Put < in front for at most, like <2h.',
		label: 'Target',
		placeholder: '6h',
		validate: (text) => {
			const time = parseTypedTimeTarget(text)
			return 'error' in time ? time.error : null
		},
	})
	if (typed === null) return
	const time = parseTypedTimeTarget(typed)
	if ('error' in time) return
	const goal: TagGoal = { tag, ...time }

	const target = currentTarget(plugin)
	const io = targetIo(plugin, target)
	const recorder = recordWrites(io)
	const outcome = await rewriteNote(recorder.io, (current) =>
		setTagGoals(current, [goal])
	)
	const write = recorder.written()
	if (!wrote(outcome) || !write) return
	showUndoNotice(describeTagGoalSet(goal), undoNoteWrite(io, write), [
		{ label: 'Change', run: () => void promptTagGoal(plugin, tag) },
	])
}

export function registerTagGoalCommands(plugin: TaskTimeTracker) {
	plugin.addCommand({
		id: 'set-tag-goal',
		name: 'Set tag goal…',
		icon: 'tags',
		callback: () => void setTagGoalFlow(plugin),
	})
}
