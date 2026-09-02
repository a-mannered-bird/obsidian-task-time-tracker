import type { ConsolidationPreview } from './taskOperations'

/** Shown by every irreversible operation; the plugin keeps no undo. */
export const IRREVERSIBLE_NOTE =
	'The plugin cannot undo this. As a last resort, the File recovery core plugin keeps snapshots of edited notes.'

/**
 * The type-the-name ritual: the exact name, surrounding whitespace ignored.
 * Case matters — the point is to make the user look at what they type.
 */
export function confirmationMatches(typed: string, expected: string): boolean {
	return typed.trim() === expected
}

/** The name-keyed settings an operation may leave dangling. */
export type ReferenceSettings = {
	quickActions: { name: string; taskName: string }[]
	unassignedTaskName: string
}

/**
 * Warnings for settings pointing at one of the names — shown before a
 * deletion, which never touches them, so the user decides what to do.
 */
export function referenceWarnings(
	settings: ReferenceSettings,
	names: string[]
): string[] {
	const affected = new Set(names)
	const warnings: string[] = []
	for (const action of settings.quickActions) {
		if (affected.has(action.taskName)) {
			warnings.push(
				`The quick action "${action.name}" targets "${action.taskName}".`
			)
		}
	}
	if (affected.has(settings.unassignedTaskName)) {
		warnings.push(
			`"${settings.unassignedTaskName}" is the unassigned task: quick interruptions depend on it.`
		)
	}
	return warnings
}

/** Preview paragraphs of a rename (one source) or merge (several). */
export function describeConsolidation(
	sourceNames: string[],
	targetName: string,
	preview: ConsolidationPreview
): string[] {
	const sources = sourceNames.map(quote).join(', ')
	const notes = plural(preview.notes, 'daily note')
	const paragraphs = [
		sourceNames.length === 1
			? `Rename ${sources} to ${quote(targetName)} across ${notes}.`
			: `Merge ${sources} into ${quote(targetName)} across ${notes}.`,
	]
	const effects: string[] = []
	if (preview.removedTaskLines > 0) {
		effects.push(
			`${plural(preview.removedTaskLines, 'task line')} merged into a single line per note`
		)
	}
	if (preview.removedClockLines > 0) {
		effects.push(
			`${plural(preview.removedClockLines, 'clock line')} removed by joining overlapping, touching or empty clocks`
		)
	}
	if (effects.length > 0) paragraphs.push(`${capitalize(effects.join('; '))}.`)
	return paragraphs
}

export function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function quote(name: string): string {
	return `"${name}"`
}

function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1)
}
