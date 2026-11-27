import {
	describeTagConsolidation,
	describeTagDeletion,
	IRREVERSIBLE_NOTE,
	plural,
} from 'core/confirmations'
import { withTagStyle } from 'core/goalStyle'
import { forgetTag, migrateTags } from 'core/settingsMigration'
import { tagInfos } from 'core/tagManager'
import {
	consolidateTagsInVault,
	deleteTagsInVault,
	previewTagConsolidation,
	previewTagDeletion,
} from 'core/tagOperations'
import { TAG_FORMAT_HELP, typedTag } from 'core/taskEdits'
import { confirmAction } from 'ui/ConfirmActionModal'
import { withProgressNotice } from 'ui/progressNotice'
import { deviceEmojiHint } from 'ui/emojiHint'
import { promptText } from 'ui/TextPromptModal'
import type TaskTimeTracker from '../main'
import { reportOutcome } from './taskActions'

/** Every tag the Tags tab lists, most used first. */
function knownTags(plugin: TaskTimeTracker): string[] {
	return tagInfos(
		plugin.vaultTasks.notes(),
		plugin.settings.tagMappings.map((mapping) => mapping.tag),
		new Date()
	).map((info) => info.tag)
}

/**
 * Rename a tag across every daily note: ask for the new tag, show what
 * the rename does (onto an existing tag it is a merge, with the merge's
 * ritual), run it. Resolves true when it ran.
 */
export async function renameTag(
	plugin: TaskTimeTracker,
	tag: string
): Promise<boolean> {
	const existing = new Set(knownTags(plugin))
	const typed = await promptText(plugin.app, {
		title: `Rename ${tag}`,
		description:
			'Every daily note is updated, task lines and tag goals. Renaming to another tag merges the two.',
		label: 'New tag',
		initialValue: tag,
		confirmText: 'Rename',
		validate: (value) => {
			const target = typedTag(value)
			if (!target) return TAG_FORMAT_HELP
			if (target === tag) return 'That is the current tag.'
			return null
		},
	})
	const target = typed === null ? null : typedTag(typed)
	if (target === null) return false

	const merging = existing.has(target)
	const confirmed = await confirmAction(plugin.app, {
		title: `Rename ${tag}`,
		message: [
			...describeTagConsolidation(
				[tag],
				target,
				previewTagConsolidation(plugin.vaultTasks, [tag], target),
				merging
			),
			...(merging ? [IRREVERSIBLE_NOTE] : []),
		],
		typeToConfirm: merging ? target : undefined,
		confirmText: merging ? 'Merge' : 'Rename',
	})
	if (!confirmed) return false

	await consolidate(plugin, [tag], target)
	return true
}

/**
 * Merge several tags into one across every daily note. The surviving tag
 * is chosen in the confirmation (default: the most used) and typed to
 * confirm. Resolves true when it ran.
 */
export async function mergeTags(
	plugin: TaskTimeTracker,
	tags: string[]
): Promise<boolean> {
	if (tags.length < 2) return false
	const survivorDefault =
		knownTags(plugin).find((tag) => tags.includes(tag)) ?? tags[0]!
	const confirmed = await confirmAction(plugin.app, {
		title: `Merge ${plural(tags.length, 'tag')}`,
		message: [
			// The counts do not depend on which tag survives.
			...describeTagConsolidation(
				tags,
				null,
				previewTagConsolidation(plugin.vaultTasks, tags, survivorDefault),
				true
			),
			IRREVERSIBLE_NOTE,
		],
		choice: { label: 'Surviving tag', options: tags, initial: survivorDefault },
		typeToConfirm: (choice) => choice,
		confirmText: 'Merge',
	})
	if (!confirmed) return false

	await consolidate(plugin, tags, confirmed.choice)
	return true
}

async function consolidate(
	plugin: TaskTimeTracker,
	sourceTags: string[],
	targetTag: string
): Promise<void> {
	const report = await withProgressNotice('Updating notes', (onProgress) =>
		consolidateTagsInVault(
			plugin.app.vault,
			plugin.vaultTasks,
			sourceTags,
			targetTag,
			onProgress
		)
	)
	Object.assign(
		plugin.settings,
		migrateTags(plugin.settings, sourceTags, targetTag)
	)
	await plugin.saveSettings()
	reportOutcome(report, targetTag)
}

/**
 * Remove tags from every task line and delete their tag goals, after the
 * ritual: type the tag for one, the count for several. Their emoji, color
 * and goal settings go with them.
 */
export async function deleteTags(
	plugin: TaskTimeTracker,
	tags: string[]
): Promise<boolean> {
	if (tags.length === 0) return false
	const confirmed = await confirmAction(plugin.app, {
		title:
			tags.length === 1
				? `Delete ${tags[0]}`
				: `Delete ${plural(tags.length, 'tag')}`,
		message: [
			describeTagDeletion(tags, previewTagDeletion(plugin.vaultTasks, tags)),
			IRREVERSIBLE_NOTE,
		],
		typeToConfirm: tags.length === 1 ? tags[0] : String(tags.length),
		confirmText: 'Delete',
	})
	if (!confirmed) return false

	const report = await withProgressNotice('Deleting', (onProgress) =>
		deleteTagsInVault(plugin.app.vault, plugin.vaultTasks, tags, onProgress)
	)
	for (const tag of tags) {
		Object.assign(plugin.settings, forgetTag(plugin.settings, tag))
	}
	await plugin.saveSettings()
	reportOutcome(report, tags[0] && tags.length === 1 ? tags[0] : 'Deletion')
	return true
}

/** Ask for the tag's emoji; empty removes it. Resolves true when it changed. */
export async function chooseTagEmoji(
	plugin: TaskTimeTracker,
	tag: string,
	placeholder?: string
): Promise<boolean> {
	const { settings } = plugin
	const typed = await promptText(plugin.app, {
		title: `Emoji of ${tag}`,
		description: `Shown for ${tag} in the task pickers, on the tracker and on its tag goals. Empty for none.`,
		label: 'Emoji',
		hint: deviceEmojiHint(),
		initialValue:
			settings.tagMappings.find((mapping) => mapping.tag === tag)?.emoji ?? '',
		placeholder,
	})
	if (typed === null) return false
	settings.tagMappings = withTagStyle(settings.tagMappings, tag, {
		emoji: typed.trim(),
	})
	await plugin.saveSettings()
	return true
}

/** Set or clear the color of the tags. */
export async function setTagColors(
	plugin: TaskTimeTracker,
	tags: string[],
	color: string | null
): Promise<void> {
	const { settings } = plugin
	for (const tag of tags) {
		settings.tagMappings = withTagStyle(settings.tagMappings, tag, { color })
	}
	await plugin.saveSettings()
}
