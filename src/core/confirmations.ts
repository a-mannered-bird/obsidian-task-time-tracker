import type { MetricEditPreview } from './metricOperations'
import type { TagEditPreview } from './tagOperations'
import type { TagChange } from './taskEdits'
import type {
	ConsolidationPreview,
	DeletionPreview,
	RetagPreview,
} from './taskOperations'
import { INTERRUPTION_TASK } from './toggle'

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

/**
 * Warnings shown before a deletion about names the plugin itself relies on,
 * so the user decides with that in mind.
 */
export function referenceWarnings(names: string[]): string[] {
	return names.includes(INTERRUPTION_TASK)
		? [
				`"${INTERRUPTION_TASK}" holds the time of quick interruptions not assigned to a task yet.`,
			]
		: []
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
	if (preview.combinedGoalLines > 0) {
		paragraphs.push(
			`${plural(preview.combinedGoalLines, 'goal')} will be combined on ${plural(preview.notesCombiningGoals, 'day')}.`
		)
	}
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

/**
 * Preview paragraphs of a tag rename (one source onto a new tag) or merge
 * (several, or onto a tag that exists). A null target stands for "the tag
 * chosen in the dialog".
 */
export function describeTagConsolidation(
	sourceTags: string[],
	targetTag: string | null,
	preview: TagEditPreview,
	targetExists: boolean
): string[] {
	const target = targetTag ?? 'the surviving tag'
	const scope = `${plural(preview.taskLines, 'task line')} and ${plural(preview.goals, 'tag goal')} across ${plural(preview.notes, 'daily note')}`
	const paragraphs = [
		sourceTags.length === 1 && !targetExists
			? `Rename ${sourceTags[0]} to ${target} on ${scope}.`
			: `Merge ${sourceTags.join(', ')} into ${target} on ${scope}. A line carrying several of them keeps the tag once.`,
	]
	if (preview.notesCombiningGoals > 0) {
		paragraphs.push(
			`Tag goals meet on ${plural(preview.notesCombiningGoals, 'day')}: targets of the same kind add up, otherwise the surviving tag's goal is kept.`
		)
	}
	return paragraphs
}

/** Preview paragraph of a tag deletion. */
export function describeTagDeletion(
	tags: string[],
	preview: TagEditPreview
): string {
	return `Remove ${tags.join(', ')} from ${plural(preview.taskLines, 'task line')} and delete ${plural(preview.goals, 'tag goal')} across ${plural(preview.notes, 'daily note')}. The tasks stay, and so do their other tags.`
}

/**
 * Preview paragraphs of a metric rename (one source onto a new metric) or
 * merge (several, or onto a metric that exists). A null target stands for
 * "the metric chosen in the dialog".
 */
export function describeMetricConsolidation(
	sourceMetrics: string[],
	targetMetric: string | null,
	preview: MetricEditPreview,
	targetExists: boolean
): string[] {
	const target =
		targetMetric === null ? 'the surviving metric' : quote(targetMetric)
	const scope = goalLineScope(preview)
	return [
		sourceMetrics.length === 1 && !targetExists
			? `Rename ${quote(sourceMetrics[0]!)} to ${target} on ${scope}.`
			: `Merge ${sourceMetrics.map(quote).join(', ')} into ${target} on ${scope}. Units are never converted.`,
		...combinedGoals(preview, "the surviving metric's rule"),
	]
}

/**
 * Preview paragraph of a metric deletion; one no goal line uses only
 * loses its settings.
 */
export function describeMetricDeletion(
	metrics: string[],
	preview: MetricEditPreview
): string {
	const names = metrics.map(quote).join(', ')
	return preview.goalLines === 0
		? `No goal line uses ${names}: only ${metrics.length === 1 ? 'its' : 'their'} settings are deleted.`
		: `Delete ${plural(preview.goalLines, 'goal line')} of ${names} across ${plural(preview.notes, 'daily note')}, results included, along with ${metrics.length === 1 ? 'its' : 'their'} settings. The tasks stay, and so do their other goals.`
}

/** Preview paragraphs of a unit change: the text only, never the values. */
export function describeUnitChange(
	metric: string,
	fromUnits: string[],
	toUnit: string,
	preview: MetricEditPreview
): string[] {
	const from = fromUnits.map(unitName).join(', ')
	return [
		`Change the unit of ${quote(metric)} from ${from} to ${unitName(toUnit)} on ${goalLineScope(preview)}. Values are not converted.`,
		...combinedGoals(preview, `the rule of ${quote(metric)}`),
	]
}

function goalLineScope(preview: MetricEditPreview): string {
	return `${plural(preview.goalLines, 'goal line')} across ${plural(preview.notes, 'daily note')}`
}

function combinedGoals(preview: MetricEditPreview, rule: string): string[] {
	return preview.combinedGoalLines > 0
		? [
				`${plural(preview.combinedGoalLines, 'goal')} will be combined on ${plural(preview.notesCombiningGoals, 'day')}: on a task line, results and targets in the same unit combine with ${rule}.`,
			]
		: []
}

function unitName(unit: string): string {
	return unit || 'no unit'
}

/** Quoted names, the tail folded into a count past a handful. */
export function listNames(names: string[], shown = 5): string {
	const quoted = names.slice(0, shown).map(quote)
	const rest = names.length - quoted.length
	return rest > 0
		? `${quoted.join(', ')} and ${plural(rest, 'other task')}`
		: quoted.join(', ')
}

/**
 * Removing a task from one note (the tracker row's Delete task): other
 * notes keep their lines of that name, unlike the vault-wide deletion.
 */
export function describeNoteTaskRemoval(name: string, clocks: number): string {
	const what = clocks ? `and its ${plural(clocks, 'clock')} are` : 'is'
	return `${quote(name)} ${what} removed from this note. Other daily notes keep theirs.`
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
