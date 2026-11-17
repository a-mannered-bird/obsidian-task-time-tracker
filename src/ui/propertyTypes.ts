import type { App } from 'obsidian'

/**
 * Obsidian's property type registry is not part of the public API.
 * Verified on 1.15.1: `getAssignedWidget(name)` is the type the user gave
 * the property, null when Obsidian infers it, and `setType(name, type)`
 * assigns one (Obsidian's own `property:set` CLI handler calls it).
 */
type PropertyTypes = {
	getAssignedWidget(name: string): string | null
	setType(name: string, type: string): Promise<void>
}

function hasPropertyTypes(
	app: App
): app is App & { metadataTypeManager: PropertyTypes } {
	if (!('metadataTypeManager' in app)) return false
	const manager = app.metadataTypeManager
	return (
		typeof manager === 'object' &&
		manager !== null &&
		'getAssignedWidget' in manager &&
		typeof manager.getAssignedWidget === 'function' &&
		'setType' in manager &&
		typeof manager.setType === 'function'
	)
}

/**
 * Give the properties the "Date & time" type, unless the user already
 * chose one for them. Does nothing on a version without the registry.
 */
export async function assignDateTimeType(
	app: App,
	names: string[]
): Promise<void> {
	if (!hasPropertyTypes(app)) return
	for (const name of names) {
		if (app.metadataTypeManager.getAssignedWidget(name) === null) {
			await app.metadataTypeManager.setType(name, 'datetime')
		}
	}
}
