import type { TagMapping } from 'types/tags'

/**
 * Fixed assignment order, validated for color-vision separation on the
 * default themes (see PLAN); the user's theme provides the actual colors.
 */
export const CHART_COLORS = [
	'var(--color-blue)',
	'var(--color-orange)',
	'var(--color-purple)',
	'var(--color-green)',
	'var(--color-red)',
	'var(--color-cyan)',
	'var(--color-yellow)',
	'var(--color-pink)',
]

/** The same palette with names, for color pickers offering the presets. */
export const CHART_COLOR_PRESETS = [
	{ name: 'Blue', value: 'var(--color-blue)' },
	{ name: 'Orange', value: 'var(--color-orange)' },
	{ name: 'Purple', value: 'var(--color-purple)' },
	{ name: 'Green', value: 'var(--color-green)' },
	{ name: 'Red', value: 'var(--color-red)' },
	{ name: 'Cyan', value: 'var(--color-cyan)' },
	{ name: 'Yellow', value: 'var(--color-yellow)' },
	{ name: 'Pink', value: 'var(--color-pink)' },
]

/**
 * Beyond the theme colors, cycle the same hue order through deterministic
 * variants: paler (mixed with the surface), then deeper (mixed with the
 * ink), mixing harder on each round. Adapts to light and dark themes.
 */
export function seriesColor(index: number): string {
	const base = CHART_COLORS[index % CHART_COLORS.length]!
	const round = Math.floor(index / CHART_COLORS.length)
	if (round === 0) return base
	const towards =
		round % 2 === 1 ? 'var(--background-primary)' : 'var(--text-normal)'
	const amount = Math.min(35 + Math.floor((round - 1) / 2) * 15, 70)
	return `color-mix(in srgb, ${base} ${100 - amount}%, ${towards})`
}

/**
 * Color of a chart series: its own color (see taskColor, tagColor) when it
 * has one, otherwise the rank-based cycle. Own colors may collide with
 * cycled ones; accepted for now.
 */
export function resolveSeriesColor(
	color: string | undefined,
	index: number
): string {
	return color ?? seriesColor(index)
}

/** The tag's color set in its tag mapping, if any. */
export function tagColor(
	tag: string,
	mappings: TagMapping[]
): string | undefined {
	return mappings.find((mapping) => mapping.tag === tag)?.color || undefined
}

/**
 * A task's color: its own (set in the task manager), else that of its first
 * tag, in line order, that has one.
 */
export function taskColor(
	name: string,
	tags: string[],
	taskColors: Record<string, string>,
	mappings: TagMapping[]
): string | undefined {
	return (
		taskColors[name] ?? tags.map((tag) => tagColor(tag, mappings)).find(Boolean)
	)
}
