import { Notice } from 'obsidian'
import {
	runBulkEdit,
	type BulkEditReport,
	type BulkTransformResult,
} from 'core/bulkEdit'
import { consolidateTasks, extractTaskBlocks } from 'core/consolidate'
import {
	describeConsolidation,
	describeDeletion,
	describeRetag,
	IRREVERSIBLE_NOTE,
	plural,
	referenceWarnings,
} from 'core/confirmations'
import { parseTaskInput } from 'core/parser'
import { forgetTaskName, migrateTaskNames } from 'core/settingsMigration'
import {
	consolidateInVault,
	deleteInVault,
	previewConsolidation,
	previewDeletion,
	previewRetag,
	retagInVault,
} from 'core/taskOperations'
import { confirmAction } from 'ui/ConfirmActionModal'
import { withProgressNotice } from 'ui/progressNotice'
import { promptRetag } from 'ui/RetagModal'
import { promptText } from 'ui/TextPromptModal'
import type TaskTimeTracker from '../main'
import { NOTICE_DURATION } from './target'

/**
 * Rename a task across every daily note: ask for the new name, show what
 * the rename does (a collision with an existing task merges into it), run
 * it. Resolves true when notes were rewritten.
 */
export async function renameTask(
	plugin: TaskTimeTracker,
	name: string
): Promise<boolean> {
	const existing = new Set(plugin.vaultTasks.snapshot().map((i) => i.name))
	const target = await promptText(plugin.app, {
		title: `Rename "${name}"`,
		description:
			'Every daily note is updated. Renaming to the name of another task merges the two.',
		label: 'New name',
		initialValue: name,
		confirmText: 'Rename',
		validate: (value) => {
			const input = parseTaskInput(value)
			if (!input.name) return 'Please enter a name.'
			if (input.tags.length) return 'Tags are not part of the name.'
			if (input.name === name) return 'That is the current name.'
			return null
		},
	})
	if (target === null) return false

	const preview = previewConsolidation(plugin.vaultTasks, [name], target)
	const confirmed = await confirmAction(plugin.app, {
		title: `Rename "${name}"`,
		message: describeConsolidation([name], target, preview),
		confirmText: 'Rename',
	})
	if (!confirmed) return false

	return consolidate(plugin, [name], target, existing.has(target))
}

/**
 * Merge several tasks into one across every daily note. The surviving name
 * is chosen in the confirmation (default: the most used one) and must be
 * typed to confirm. Resolves true when notes were rewritten.
 */
export async function mergeTasks(
	plugin: TaskTimeTracker,
	names: string[]
): Promise<boolean> {
	if (names.length < 2) return false
	// Snapshot order is usage-first, so the first selected name wins.
	const byUsage = plugin.vaultTasks
		.snapshot()
		.map((info) => info.name)
		.filter((name) => names.includes(name))
	const survivorDefault = byUsage[0] ?? names[0]!

	const confirmed = await confirmAction(plugin.app, {
		title: `Merge ${plural(names.length, 'task')}`,
		message: [
			// The counts do not depend on which name survives.
			...describeConsolidation(
				names,
				null,
				previewConsolidation(plugin.vaultTasks, names, survivorDefault)
			),
			IRREVERSIBLE_NOTE,
		],
		choice: {
			label: 'Surviving name',
			options: names,
			initial: survivorDefault,
		},
		typeToConfirm: (choice) => choice,
		confirmText: 'Merge',
	})
	if (!confirmed) return false

	return consolidate(plugin, names, confirmed.choice, true)
}

/** Run the consolidation with progress, then follow it in the settings. */
async function consolidate(
	plugin: TaskTimeTracker,
	sourceNames: string[],
	targetName: string,
	targetExists: boolean
): Promise<boolean> {
	const report = await withProgressNotice('Updating notes', (onProgress) =>
		consolidateInVault(
			plugin.app.vault,
			plugin.vaultTasks,
			sourceNames,
			targetName,
			onProgress
		)
	)

	Object.assign(
		plugin.settings,
		migrateTaskNames(plugin.settings, sourceNames, targetName, targetExists)
	)
	await plugin.saveSettings()

	reportOutcome(report, `"${targetName}"`)
	return report.changedPaths.length > 0
}

/**
 * Delete tasks from every daily note, clocks included, after the ritual:
 * type the name for one task, the count for several. Their colors and hide
 * flags go with them; quick actions pointing at them are only warned about.
 */
export async function deleteTasks(
	plugin: TaskTimeTracker,
	names: string[]
): Promise<boolean> {
	if (names.length === 0) return false
	const preview = previewDeletion(plugin.vaultTasks, names)
	const confirmed = await confirmAction(plugin.app, {
		title:
			names.length === 1
				? `Delete "${names[0]}"`
				: `Delete ${plural(names.length, 'task')}`,
		message: [describeDeletion(names, preview), IRREVERSIBLE_NOTE],
		warnings: referenceWarnings(plugin.settings, names),
		typeToConfirm: names.length === 1 ? names[0] : String(names.length),
		confirmText: 'Delete',
	})
	if (!confirmed) return false

	const report = await withProgressNotice('Deleting', (onProgress) =>
		deleteInVault(plugin.app.vault, plugin.vaultTasks, names, onProgress)
	)
	for (const name of names) {
		Object.assign(plugin.settings, forgetTaskName(plugin.settings, name))
	}
	await plugin.saveSettings()

	reportOutcome(report, names.length === 1 ? `"${names[0]}"` : 'Deletion')
	return report.changedPaths.length > 0
}

/** Set the tags of every line of the tasks through the chip editor. */
export async function changeTags(
	plugin: TaskTimeTracker,
	names: string[]
): Promise<boolean> {
	if (names.length === 0) return false
	const change = await promptRetag(plugin.app, {
		names,
		lineTags: names.flatMap((name) =>
			plugin.vaultTasks.occurrences(name).map(({ task }) => task.tags)
		),
		knownTags: plugin.vaultTasks.allTags(),
	})
	if (!change) return false

	const preview = previewRetag(plugin.vaultTasks, names, change)
	if (preview.taskLines === 0) {
		new Notice('No line of the tasks needs that change.', NOTICE_DURATION)
		return false
	}
	const confirmed = await confirmAction(plugin.app, {
		title:
			names.length === 1
				? `Tags of "${names[0]}"`
				: `Tags of ${plural(names.length, 'task')}`,
		message: [describeRetag(names, change, preview)],
		confirmText: 'Apply',
	})
	if (!confirmed) return false

	const report = await withProgressNotice('Updating notes', (onProgress) =>
		retagInVault(plugin.app.vault, plugin.vaultTasks, names, change, onProgress)
	)
	reportOutcome(report, names.length === 1 ? `"${names[0]}"` : 'Tags')
	return report.changedPaths.length > 0
}

/**
 * Join the overlapping clocks of a task in one note — the consolidation
 * engine on a single note with no other name involved. The modification is
 * explained first, until the user asks not to be told again.
 */
export async function joinOverlappingClocks(
	plugin: TaskTimeTracker,
	name: string,
	path: string
): Promise<boolean> {
	if (!plugin.settings.skipOverlapJoinNotice) {
		const file = plugin.app.vault.getFileByPath(path)
		if (!file) {
			new Notice(`${path} no longer exists.`, NOTICE_DURATION)
			return false
		}
		const content = await plugin.app.vault.cachedRead(file)
		const confirmed = await confirmAction(plugin.app, {
			title: 'Join overlapping clocks',
			message: [`The lines of "${name}" in ${path} change as follows:`],
			diff: {
				before: extractTaskBlocks(content, name),
				after: extractTaskBlocks(
					consolidateTasks(content, [], name).content,
					name
				),
			},
			confirmText: 'Join',
			dontAskAgain: 'Do not show this preview again',
		})
		if (!confirmed) return false
		if (confirmed.dontAskAgain) {
			plugin.settings.skipOverlapJoinNotice = true
			await plugin.saveSettings()
		}
	}
	const report = await runBulkEdit(plugin.app.vault, [path], (content) =>
		consolidateTasks(content, [], name)
	)
	const removed = report.results.reduce(
		(sum, result) => sum + result.removedClockLines,
		0
	)
	if (report.failures.length) {
		new Notice(`Could not update ${path}: ${report.failures[0]!.message}`, 0)
		return false
	}
	new Notice(
		removed
			? `"${name}": ${plural(removed, 'clock line')} joined in ${path}.`
			: `"${name}": nothing to join in ${path}.`,
		NOTICE_DURATION
	)
	return removed > 0
}

/** Open the note in the current leaf, scrolled to and highlighting the line. */
export async function openNoteAtLine(
	plugin: TaskTimeTracker,
	path: string,
	line: number
): Promise<void> {
	const file = plugin.app.vault.getFileByPath(path)
	if (!file) {
		new Notice(`${path} no longer exists.`, NOTICE_DURATION)
		return
	}
	await plugin.app.workspace.getLeaf(false).openFile(file, { eState: { line } })
}

function reportOutcome(
	report: BulkEditReport<BulkTransformResult>,
	subject: string
) {
	const updated = plural(report.changedPaths.length, 'note')
	new Notice(`${subject}: ${updated} updated.`, NOTICE_DURATION)
	if (report.failures.length) {
		const paths = report.failures.map((failure) => failure.path).join(', ')
		new Notice(
			`${plural(report.failures.length, 'note')} could not be updated, run the operation again: ${paths}`,
			0
		)
	}
}
