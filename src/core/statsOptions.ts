import { isRangeSpec } from './ranges'
import type { GroupBy } from './stats'

export const METRICS = ['total', 'average', 'per-day', 'time-of-day'] as const
export type Metric = (typeof METRICS)[number]

/** Options of a `task-stats` code block, after validation and defaults. */
export type StatsBlockOptions = {
	range: string
	groupBy: GroupBy
	filter: string[]
	metrics: Metric[]
	skipEmptyDays: boolean
	/** Keep only the N biggest keys and fold the rest into "Other"; null = all. */
	top: number | null
}

export const DEFAULT_STATS_OPTIONS: StatsBlockOptions = {
	range: 'this-week',
	groupBy: 'task',
	filter: [],
	metrics: [...METRICS],
	skipEmptyDays: false,
	top: null,
}

export type NormalizedOptions =
	| { ok: true; options: StatsBlockOptions }
	| { ok: false; errors: string[] }

/**
 * Validate the parsed YAML of a code block. Unknown keys and wrong values
 * are reported with the accepted alternatives, so the note shows what to fix.
 */
export function normalizeStatsOptions(raw: unknown): NormalizedOptions {
	const errors: string[] = []
	const options: StatsBlockOptions = { ...DEFAULT_STATS_OPTIONS }
	if (raw === null || raw === undefined) return { ok: true, options }
	if (typeof raw !== 'object' || Array.isArray(raw)) {
		return { ok: false, errors: ['Expected `key: value` lines.'] }
	}

	for (const [key, value] of Object.entries(raw)) {
		switch (key) {
			case 'range': {
				const range = String(value)
				if (isRangeSpec(range)) {
					options.range = range
				} else {
					errors.push(
						`range: "${range}" is not a preset (today, yesterday, this-week, last-week, this-month, last-month, this-year, last-year, all), a last-N-days/weeks/months/years window, nor a YYYY-MM-DD..YYYY-MM-DD span.`
					)
				}
				break
			}
			case 'groupBy':
				if (isGroupBy(value)) options.groupBy = value
				else
					errors.push(
						`groupBy: expected "task" or "tag", got "${String(value)}".`
					)
				break
			case 'filter': {
				const list = asStringList(value)
				if (list) options.filter = list
				else errors.push('filter: expected a list of task names or #tags.')
				break
			}
			case 'metrics': {
				const list = asStringList(value)
				const unknown = list?.filter((m) => !isMetric(m)) ?? []
				if (list && unknown.length === 0)
					options.metrics = list.filter(isMetric)
				else
					errors.push(`metrics: expected a list among ${METRICS.join(', ')}.`)
				break
			}
			case 'skipEmptyDays':
				if (typeof value === 'boolean') options.skipEmptyDays = value
				else errors.push('skipEmptyDays: expected true or false.')
				break
			case 'top':
				if (typeof value === 'number' && Number.isInteger(value) && value > 0)
					options.top = value
				else errors.push('top: expected a positive whole number.')
				break
			default:
				errors.push(`Unknown option "${key}".`)
		}
	}

	return errors.length ? { ok: false, errors } : { ok: true, options }
}

function isMetric(value: string): value is Metric {
	return (METRICS as readonly string[]).includes(value)
}

/** Accepts a YAML list or a single scalar (one-item list). */
function asStringList(value: unknown): string[] | null {
	if (typeof value === 'string') return [value]
	if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
		return value
	}
	return null
}

function isGroupBy(value: unknown): value is GroupBy {
	return value === 'task' || value === 'tag'
}
