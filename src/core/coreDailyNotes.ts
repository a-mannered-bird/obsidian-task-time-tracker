import type { App } from 'obsidian'
import type { DailyNotesConfig } from './dailyNotes'

/** Also the core plugin's own defaults for unset options. */
export const DEFAULT_DAILY_NOTES: DailyNotesConfig = {
	folder: '',
	format: 'YYYY-MM-DD',
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

/**
 * Folder and format configured in the core Daily notes plugin.
 * `app.internalPlugins` is not part of the public API, so every step is
 * checked at runtime and missing pieces fall back to the defaults.
 */
export function getCoreDailyNotesConfig(app: App): DailyNotesConfig {
	const { internalPlugins } = app as App & { internalPlugins?: unknown }
	if (!isRecord(internalPlugins)) return DEFAULT_DAILY_NOTES
	const { getPluginById } = internalPlugins
	if (typeof getPluginById !== 'function') return DEFAULT_DAILY_NOTES

	const plugin: unknown = getPluginById.call(internalPlugins, 'daily-notes')
	if (!isRecord(plugin) || !isRecord(plugin.instance))
		return DEFAULT_DAILY_NOTES
	const { options } = plugin.instance
	if (!isRecord(options)) return DEFAULT_DAILY_NOTES

	const folder = typeof options.folder === 'string' ? options.folder.trim() : ''
	const format = typeof options.format === 'string' ? options.format.trim() : ''
	return {
		folder,
		format: format || DEFAULT_DAILY_NOTES.format,
	}
}
