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

/** The lines of a property: its key line and the indented ones below it. */
function entryLines(
	lines: string[],
	end: number,
	key: string
): { start: number; count: number } | null {
	const start = lines.findIndex(
		(line, index) => index > 0 && index < end && isKeyLine(line, key)
	)
	if (start === -1) return null
	let next = start + 1
	// Indented lines, or `- item` ones: YAML lets a block list start at the key's indent.
	while (next < end && /^(\s|-\s)/.test(lines[next]!)) next++
	return { start, count: next - start }
}

/**
 * A list property's items as written, unquoted: a block list (`- item`
 * lines) or a flow one (`[a, b]`); undefined when the note has none.
 */
export function readFrontmatterList(
	content: string,
	key: string
): string[] | undefined {
	const lines = content.split('\n')
	const end = closingLine(lines)
	if (end === -1) return undefined
	const entry = entryLines(lines, end, key)
	if (!entry) return undefined
	const inline = lines[entry.start]!.slice(key.length + 1).trim()
	const items = inline
		? (/^\[(.*)\]$/.exec(inline)?.[1]?.split(',') ?? [inline])
		: lines
				.slice(entry.start + 1, entry.start + entry.count)
				.map((line) => /^\s*-\s*(.*)$/.exec(line)?.[1] ?? '')
	return items.map(unquote).filter((item) => item !== '')
}

function unquote(text: string): string {
	const value = text.trim()
	const quoted = /^(['"])(.*)\1$/.exec(value)
	return quoted ? quoted[2]! : value
}

/**
 * The note with the list property holding exactly `items`, written as a
 * block list of double-quoted strings (a `#tag` unquoted would start a
 * YAML comment); removed when `items` is empty, with the frontmatter when
 * nothing else is left in it; the frontmatter created when missing.
 */
export function setFrontmatterList(
	content: string,
	key: string,
	items: string[]
): string {
	const lines = content.split('\n')
	const end = closingLine(lines)
	const block = [
		`${key}:`,
		...items.map((item) => `  - ${JSON.stringify(item)}`),
	]
	if (end === -1) {
		return items.length ? ['---', ...block, '---', content].join('\n') : content
	}
	const entry = entryLines(lines, end, key)
	const replacement = items.length ? block : []
	if (entry) lines.splice(entry.start, entry.count, ...replacement)
	else lines.splice(end, 0, ...replacement)
	if (lines[1] === '---') lines.splice(0, 2)
	return lines.join('\n')
}
