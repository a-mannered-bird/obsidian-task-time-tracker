const pad = (n: number) => String(n).padStart(2, '0')

/** `YYYY-MM-DD` in local time, the fixture vault's daily note format. */
export function isoDate(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** The daily note `offset` days from today: its path and date. */
export function dayNote(offset: number): { path: string; date: string } {
	const date = new Date()
	date.setDate(date.getDate() + offset)
	return { path: `${isoDate(date)}.md`, date: isoDate(date) }
}
