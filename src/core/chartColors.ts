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
 * Color of a chart series: the task's custom color when the key is a task
 * name with one, otherwise the rank-based cycle. Tag keys simply never match
 * the map. Custom colors may collide with cycled ones; accepted for now.
 */
export function resolveSeriesColor(
	key: string,
	index: number,
	taskColors: Record<string, string>
): string {
	return taskColors[key] ?? seriesColor(index)
}
