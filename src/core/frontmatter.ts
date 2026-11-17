/**
 * One `key: value` line of a note's leading `---` block, read and set on
 * the note's text. Used where a property must change in the same write as
 * the clocks it follows, so one Undo restores both; other property writes
 * go through Obsidian's `processFrontMatter`. Values are plain scalars.
 */

/** Index of the closing `---` line, or -1 when the note has no frontmatter. */
function closingLine(lines: string[]): number {
	if (lines[0] !== '---') return -1
	return lines.indexOf('---', 1)
}

function isKeyLine(line: string, key: string): boolean {
	return line.startsWith(`${key}:`)
}

/** The property's value, unquoted; undefined when it is not there. */
export function readFrontmatterValue(
	content: string,
	key: string
): string | undefined {
	const lines = content.split('\n')
	const end = closingLine(lines)
	if (end === -1) return undefined
	const line = lines.slice(1, end).find((l) => isKeyLine(l, key))
	if (line === undefined) return undefined
	const value = line.slice(key.length + 1).trim()
	const quoted = /^(['"])(.*)\1$/.exec(value)
	return quoted ? quoted[2] : value
}

/** The note with the property set, its frontmatter created when missing. */
export function setFrontmatterValue(
	content: string,
	key: string,
	value: string
): string {
	const entry = `${key}: ${value}`
	const lines = content.split('\n')
	const end = closingLine(lines)
	if (end === -1) return ['---', entry, '---', content].join('\n')
	const existing = lines.findIndex(
		(line, index) => index > 0 && index < end && isKeyLine(line, key)
	)
	if (existing === -1) lines.splice(end, 0, entry)
	else lines[existing] = entry
	return lines.join('\n')
}
