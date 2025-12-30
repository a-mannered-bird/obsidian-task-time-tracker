import { type App } from 'obsidian'

export async function getFileByPath(app: App, path: string) {
	const file = app.vault.getFileByPath(path)

	if (!file) {
		throw new Error(`File not found: ${path}`)
	}
	return file
}
