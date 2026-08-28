import { addDays } from './dailyNotes'

export const RANGE_PRESETS = [
	'today',
	'yesterday',
	'this-week',
	'last-week',
	'this-month',
	'last-month',
	'this-year',
	'last-year',
	'all',
] as const

export type RangePreset = (typeof RANGE_PRESETS)[number]

/**
 * Inclusive range of calendar days, both bounds at local midnight.
 * `start` is null for "all": it starts at the oldest existing daily note.
 */
export type DateRange = {
	start: Date | null
	end: Date
}

const CUSTOM_RANGE = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/
const LAST_X_RANGE = /^last-(\d+)-(day|week|month|year)s?$/

type LastRange = {
	count: number
	unit: 'day' | 'week' | 'month' | 'year'
}

export function isRangePreset(value: string): value is RangePreset {
	return (RANGE_PRESETS as readonly string[]).includes(value)
}

/** Any spec resolveRange accepts: preset, `last-N-<unit>` or custom span. */
export function isRangeSpec(value: string): boolean {
	const trimmed = value.trim()
	return (
		isRangePreset(trimmed) ||
		parseLastRange(trimmed) !== null ||
		CUSTOM_RANGE.test(trimmed)
	)
}

function parseLastRange(spec: string): LastRange | null {
	const match = LAST_X_RANGE.exec(spec)
	if (!match) return null
	const [, countText, unit] = match
	const count = Number(countText)
	if (count < 1) return null
	if (unit !== 'day' && unit !== 'week' && unit !== 'month' && unit !== 'year')
		return null
	return { count, unit }
}

/**
 * Resolve a preset, a `last-N-days/weeks/months/years` window or a custom
 * `YYYY-MM-DD..YYYY-MM-DD` spec relative to `today`. Weeks start on Monday.
 * Returns null for an unknown spec.
 */
export function resolveRange(spec: string, today: Date): DateRange | null {
	const day = startOfDay(today)
	const trimmed = spec.trim()

	const custom = CUSTOM_RANGE.exec(trimmed)
	if (custom) {
		const start = parseDay(custom[1]!)
		const end = parseDay(custom[2]!)
		if (!start || !end) return null
		return start <= end ? { start, end } : { start: end, end: start }
	}

	const last = parseLastRange(trimmed)
	if (last) return resolveLastRange(last, day)

	if (!isRangePreset(trimmed)) return null
	switch (trimmed) {
		case 'today':
			return { start: day, end: day }
		case 'yesterday': {
			const yesterday = addDays(day, -1)
			return { start: yesterday, end: yesterday }
		}
		case 'this-week':
			return { start: startOfWeek(day), end: day }
		case 'last-week': {
			const start = addDays(startOfWeek(day), -7)
			return { start, end: addDays(start, 6) }
		}
		case 'this-month':
			return { start: startOfMonth(day), end: day }
		case 'last-month': {
			const start = addMonths(startOfMonth(day), -1)
			return { start, end: addDays(startOfMonth(day), -1) }
		}
		case 'this-year':
			return { start: new Date(day.getFullYear(), 0, 1), end: day }
		case 'last-year':
			return {
				start: new Date(day.getFullYear() - 1, 0, 1),
				end: new Date(day.getFullYear() - 1, 11, 31),
			}
		case 'all':
			return { start: null, end: day }
	}
}

/**
 * `last-N-days` is a rolling window of N days ending today; for the other
 * units the window covers the current (partial) week/month/year plus the
 * previous N-1 full ones, so `last-1-week` equals `this-week`.
 */
function resolveLastRange({ count, unit }: LastRange, day: Date): DateRange {
	switch (unit) {
		case 'day':
			return { start: addDays(day, -(count - 1)), end: day }
		case 'week':
			return { start: addDays(startOfWeek(day), -7 * (count - 1)), end: day }
		case 'month':
			return { start: addMonths(startOfMonth(day), -(count - 1)), end: day }
		case 'year':
			return {
				start: new Date(day.getFullYear() - (count - 1), 0, 1),
				end: day,
			}
	}
}

/**
 * Range shown after stepping `offset` periods away from the written spec:
 * 0 is the spec itself, negative offsets go into the past. The period is the
 * spec's own unit and length (`this-month` steps by one month, `last-2-weeks`
 * by two weeks, a custom span by its number of days). Once shifted, calendar
 * units cover full weeks/months/years and the end is clamped to today.
 * Returns null for an unknown spec, for a shifted `all` (it has no period),
 * or when the shifted range would start in the future.
 */
export function shiftRange(
	spec: string,
	offset: number,
	today: Date
): DateRange | null {
	const base = resolveRange(spec, today)
	if (!base) return null
	if (offset === 0) return base
	if (!base.start) return null

	const day = startOfDay(today)
	const period = rangePeriod(spec) ?? {
		unit: 'day' as const,
		count: countDays({ start: base.start, end: base.end }),
	}
	const shift = offset * period.count

	let start: Date
	let end: Date
	switch (period.unit) {
		case 'day':
			start = addDays(base.start, shift)
			end = addDays(base.end, shift)
			break
		case 'week':
			start = addDays(startOfWeek(base.start), shift * 7)
			end = addDays(start, period.count * 7 - 1)
			break
		case 'month':
			start = addMonths(startOfMonth(base.start), shift)
			end = addDays(addMonths(start, period.count), -1)
			break
		case 'year':
			start = new Date(base.start.getFullYear() + shift, 0, 1)
			end = new Date(start.getFullYear() + period.count - 1, 11, 31)
			break
	}
	if (start > day) return null
	return { start, end: end < day ? end : day }
}

/** Step unit and length of a spec; null for `all`, custom spans and unknowns. */
function rangePeriod(spec: string): LastRange | null {
	const trimmed = spec.trim()
	const last = parseLastRange(trimmed)
	if (last) return last
	switch (trimmed) {
		case 'today':
		case 'yesterday':
			return { count: 1, unit: 'day' }
		case 'this-week':
		case 'last-week':
			return { count: 1, unit: 'week' }
		case 'this-month':
		case 'last-month':
			return { count: 1, unit: 'month' }
		case 'this-year':
		case 'last-year':
			return { count: 1, unit: 'year' }
		default:
			return null
	}
}

/** Number of calendar days in a resolved range (start must be known). */
export function countDays(range: { start: Date; end: Date }): number {
	const ms = startOfDay(range.end).valueOf() - startOfDay(range.start).valueOf()
	return Math.round(ms / 86400000) + 1
}

export function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: Date): Date {
	const day = startOfDay(date)
	const sinceMonday = (day.getDay() + 6) % 7
	return addDays(day, -sinceMonday)
}

function startOfMonth(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(firstOfMonth: Date, months: number): Date {
	return new Date(
		firstOfMonth.getFullYear(),
		firstOfMonth.getMonth() + months,
		1
	)
}

function parseDay(text: string): Date | null {
	const [year = NaN, month = NaN, day = NaN] = text.split('-').map(Number)
	const date = new Date(year, month - 1, day)
	const valid =
		date.getFullYear() === year &&
		date.getMonth() === month - 1 &&
		date.getDate() === day
	return valid ? date : null
}
