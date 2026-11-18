const pad = (n: number) => String(n).padStart(2, '0')

/** `YYYY-MM-DD` in local time, the fixture vault's daily note format. */
export function isoDate(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `YYYY-MM-DDTHH:MM:SS` in local time, as notes hold clocks and day marks. */
export function isoDateTime(date: Date): string {
	return `${isoDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** The daily note `offset` days from today: its path and date. */
export function dayNote(offset: number): { path: string; date: string } {
	const date = new Date()
	date.setDate(date.getDate() + offset)
	return { path: `${isoDate(date)}.md`, date: isoDate(date) }
}

/**
 * The day `offset` days from today as the time prompt names it under its
 * fields: `Monday, November 16`, with the year when it is not this year.
 */
export function promptDay(offset: number): string {
	const date = new Date()
	date.setDate(date.getDate() + offset)
	const sameYear = date.getFullYear() === new Date().getFullYear()
	return date.toLocaleDateString('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		...(sameYear ? {} : { year: 'numeric' }),
	})
}
