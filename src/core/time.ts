/** Frontmatter properties holding the day's start and end of daytamps. */
export const DAY_START_PROPERTY = 'day_start'
export const DAY_END_PROPERTY = 'day_end'

const pad = (n: number) => n.toString().padStart(2, '0')

/** Local `YYYY-MM-DDTHH:mm:ss`, the timestamp format written in daily notes. */
export function formatLocalDateTime(date: Date): string {
	return (
		`${formatLocalDate(date)}` +
		`T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
	)
}

/** Local `YYYY-MM-DD`. */
export function formatLocalDate(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Parse a local timestamp as written in daily notes. Returns null when the
 * text is not a valid date. An ISO string without offset is parsed as local
 * time by the Date constructor, which matches how the timestamps are written.
 */
export function parseLocalDateTime(text: string): Date | null {
	const date = new Date(text.trim())
	return isNaN(date.valueOf()) ? null : date
}

/**
 * Frontmatter value of a "Date & time" property. Depending on how the YAML
 * was parsed it is either a Date or the timestamp string; anything else
 * (missing, wrong type, unparsable) is null.
 */
export function readFrontmatterTime(value: unknown): Date | null {
	if (value instanceof Date) return isNaN(value.valueOf()) ? null : value
	if (typeof value === 'string') return parseLocalDateTime(value)
	return null
}

/**
 * Whole minutes since the epoch. Durations count the minutes between the
 * truncated ends rather than truncating the difference, so a clock lasts what
 * its displayed `HH:mm` range says (14:47:43–15:00 is 13m, not 12m) and
 * clocks that touch add up to their union, as the stats sweep requires.
 */
export function toEpochMinute(date: Date): number {
	return Math.floor(date.valueOf() / 60000)
}

export function getMinutesBetween(from: Date, to: Date): number {
	return toEpochMinute(to) - toEpochMinute(from)
}

export function addMinutes(date: Date, minutes: number): Date {
	return new Date(date.valueOf() + minutes * 60000)
}

/**
 * `2h 05m` (`45m` under an hour) plus ` - 12.5%` of `total` when a positive
 * total is given.
 */
export function formatDuration(minutes: number, total?: number): string {
	const rounded = Math.floor(minutes)
	const percentage = total
		? ` - ${Math.floor((rounded / total) * 1000) / 10}%`
		: ''
	return `${formatHoursMinutes(rounded)}${percentage}`
}

/** `07:30` for 450 minutes; values past 24h wrap (1470 → `00:30`). */
export function formatClockMinutes(minutes: number): string {
	const rounded = Math.round(minutes) % (24 * 60)
	const h = Math.floor(rounded / 60)
	const m = rounded % 60
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** `2h 05m`, or `45m` under an hour. */
export function formatHoursMinutes(minutes: number): string {
	const rounded = Math.round(minutes)
	const h = Math.floor(rounded / 60)
	const m = rounded % 60
	return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}
