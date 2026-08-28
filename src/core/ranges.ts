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
