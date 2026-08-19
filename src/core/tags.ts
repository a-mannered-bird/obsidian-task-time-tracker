import type { TagMapping, TagStyle } from 'types/tags'

/**
 * Combine the styles of every mapping matching one of the given tags.
 * A tag row (e.g. in the "tags by time" table) passes its own tag as the only tag.
 */
export function getStyleByTags(
	tags: string[],
	mappings: TagMapping[]
): TagStyle {
	const matching = mappings.filter((mapping) => tags.includes(mapping.tag))
	return {
		bold: matching.some((mapping) => mapping.bold),
		italic: matching.some((mapping) => mapping.italic),
		underline: matching.some((mapping) => mapping.underline),
	}
}
