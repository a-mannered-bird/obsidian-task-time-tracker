const pad = (n: number) => n.toString().padStart(2, '0')

/** Local `YYYY-MM-DDTHH:mm:ss`, the timestamp format written in daily notes. */
export function formatLocalDateTime(date: Date): string {
	return (
		`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
		`T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
	)
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

export function getMinutesBetween(from: Date, to: Date): number {
	return Math.floor((to.valueOf() - from.valueOf()) / 60000)
}

export function addMinutes(date: Date, minutes: number): Date {
	return new Date(date.valueOf() + minutes * 60000)
}

/**
 * "125m - (2h 5m)" plus " - 12.5%" of `total` when a positive total is given.
 */
export function formatDuration(minutes: number, total?: number): string {
	const rounded = Math.floor(minutes)
	const hours = Math.floor(rounded / 60)
	const mins = rounded % 60
	const percentage = total
		? ` - ${Math.floor((rounded / total) * 1000) / 10}%`
		: ''
	return `${rounded}m - (${hours}h ${mins}m)${percentage}`
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
