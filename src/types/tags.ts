export type TagMapping = {
	tag: string
	emoji: string
	bold: boolean
	italic: boolean
	underline: boolean
}

export type TagStyle = Pick<TagMapping, 'bold' | 'italic' | 'underline'>
