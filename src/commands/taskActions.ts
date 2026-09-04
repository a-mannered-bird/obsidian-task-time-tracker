import { Notice } from 'obsidian'
import type { BulkEditReport, BulkTransformResult } from 'core/bulkEdit'
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
 * Delete a task from every daily note, clocks included, after the
 * type-the-name ritual. Its color and hide flag go with it; quick actions
 * pointing at it are only warned about.
 */
export async function deleteTask(
	plugin: TaskTimeTracker,
	name: string
): Promise<boolean> {
	const preview = previewDeletion(plugin.vaultTasks, name)
	const confirmed = await confirmAction(plugin.app, {
		title: `Delete "${name}"`,
		message: [describeDeletion(name, preview), IRREVERSIBLE_NOTE],
		warnings: referenceWarnings(plugin.settings, [name]),
		typeToConfirm: name,
		confirmText: 'Delete',
	})
	if (!confirmed) return false

	const report = await withProgressNotice('Deleting', (onProgress) =>
		deleteInVault(plugin.app.vault, plugin.vaultTasks, name, onProgress)
	)
	Object.assign(plugin.settings, forgetTaskName(plugin.settings, name))
	await plugin.saveSettings()

	reportOutcome(report, `"${name}"`)
	return report.changedPaths.length > 0
}

/** Add a tag to, or remove one from, every line of a task. */
export async function changeTags(
	plugin: TaskTimeTracker,
	name: string
): Promise<boolean> {
	const change = await promptRetag(plugin.app, {
		name,
		lineTags: plugin.vaultTasks.occurrences(name).map(({ task }) => task.tags),
		knownTags: plugin.vaultTasks.allTags(),
	})
	if (!change) return false

	const preview = previewRetag(plugin.vaultTasks, name, change)
	if (preview.taskLines === 0) {
		new Notice('No line of the task needs that change.', NOTICE_DURATION)
		return false
	}
	const confirmed = await confirmAction(plugin.app, {
		title: `Tags of "${name}"`,
		message: [describeRetag(name, change, preview)],
		confirmText: 'Apply',
	})
	if (!confirmed) return false

	const report = await withProgressNotice('Updating notes', (onProgress) =>
		retagInVault(plugin.app.vault, plugin.vaultTasks, name, change, onProgress)
	)
	reportOutcome(report, `"${name}"`)
	return report.changedPaths.length > 0
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
