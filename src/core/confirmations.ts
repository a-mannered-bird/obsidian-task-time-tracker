import type { TagChange } from './taskEdits'
import type {
	ConsolidationPreview,
	DeletionPreview,
	RetagPreview,
} from './taskOperations'

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

/**
 * Preview paragraphs of a rename (one source) or merge (several). A null
 * target stands for "the name chosen in the dialog".
 */
export function describeConsolidation(
	sourceNames: string[],
	targetName: string | null,
	preview: ConsolidationPreview
): string[] {
	const sources = sourceNames.map(quote).join(', ')
	const target = targetName === null ? 'the surviving name' : quote(targetName)
	const notes = plural(preview.notes, 'daily note')
	const paragraphs = [
		sourceNames.length === 1
			? `Rename ${sources} to ${target} across ${notes}.`
			: `Merge ${sources} into ${target} across ${notes}.`,
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

/** Preview paragraph of a deletion. */
export function describeDeletion(
	names: string[],
	preview: DeletionPreview
): string {
	return `Delete ${listNames(names)} from ${plural(preview.notes, 'daily note')}: ${plural(preview.taskLines, 'task line')} and ${plural(preview.clockLines, 'clock line')} are removed.`
}

/**
 * Preview paragraph of a tag change, phrased as the normalization it is:
 * every affected line ends up with exactly the added tags.
 */
export function describeRetag(
	names: string[],
	change: TagChange,
	preview: RetagPreview
): string {
	const scope = `${plural(preview.taskLines, 'task line')} across ${plural(preview.notes, 'daily note')}`
	const removed = change.remove.length
		? ` (removing ${change.remove.map(quote).join(', ')})`
		: ''
	return change.add.length
		? `Set the tags of ${listNames(names)} to ${change.add.map(quote).join(', ')} on ${scope}${removed}.`
		: `Remove every tag of ${listNames(names)} on ${scope}${removed}.`
}

/** Quoted names, the tail folded into a count past a handful. */
export function listNames(names: string[], shown = 5): string {
	const quoted = names.slice(0, shown).map(quote)
	const rest = names.length - quoted.length
	return rest > 0
		? `${quoted.join(', ')} and ${plural(rest, 'other task')}`
		: quoted.join(', ')
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
