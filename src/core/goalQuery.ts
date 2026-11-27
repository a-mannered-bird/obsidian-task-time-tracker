const GOAL_QUERY_PREFIX = 'goal:'

/** The filter showing the rows with a goal of that metric (`time` for time goals). */
export function metricQuery(metric: string): string {
	return `${GOAL_QUERY_PREFIX}${metric}`
}

/**
 * The rows a `goal:<metric>` query matches, or null when the query is not
 * one. The whole query names the metric, so spaces work (`goal:5k pace`):
 * the rows with a goal of exactly that metric, else, when none has one, the
 * rows with a goal of a metric containing it, case folded, so typing
 * narrows as it goes.
 */
export function filterByGoalQuery<T>(
	rows: T[],
	query: string,
	metricsOf: (row: T) => string[]
): T[] | null {
	const trimmed = query.trim()
	if (!trimmed.startsWith(GOAL_QUERY_PREFIX)) return null
	const metric = trimmed.slice(GOAL_QUERY_PREFIX.length).trim()
	const exact = rows.filter((row) => metricsOf(row).includes(metric))
	if (exact.length > 0) return exact
	const partial = metric.toLowerCase()
	return rows.filter((row) =>
		metricsOf(row).some((name) => name.toLowerCase().includes(partial))
	)
}
