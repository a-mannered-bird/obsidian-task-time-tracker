import type { App } from 'obsidian'
import type { TimeRequest } from 'core/toggle'
import { describeTypedTime, TIME_PLACEHOLDER } from 'core/typedTime'
import { promptText } from './TextPromptModal'

/**
 * Ask for a time, typed as a time of day or minutes ago, previewing the
 * time it resolves to as the user types. Null when dismissed.
 */
export async function promptTime(
	app: App,
	request: TimeRequest & { confirmText?: string }
): Promise<Date | null> {
	const value = await promptText(app, {
		title: request.title,
		description: request.description,
		label: 'Time',
		placeholder: TIME_PLACEHOLDER,
		confirmText: request.confirmText ?? 'OK',
		validate: (text) => {
			const parsed = request.parse(text)
			return 'error' in parsed ? parsed.error : null
		},
		preview: (text) => {
			const parsed = request.parse(text)
			return 'at' in parsed ? describeTypedTime(parsed.at, new Date()) : null
		},
	})
	if (value === null) return null
	const parsed = request.parse(value)
	return 'at' in parsed ? parsed.at : null
}
