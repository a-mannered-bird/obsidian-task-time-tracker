/** A run of text; strong runs show bold (task names in tooltips). */
export type TextRun = { text: string; strong?: boolean }

/** One line of a tooltip, as runs. */
export type RichLine = TextRun[]

export const strong = (text: string): TextRun => ({ text, strong: true })

/** The line as it reads without formatting. */
export function plainLine(line: RichLine): string {
	return line.map((run) => run.text).join('')
}
