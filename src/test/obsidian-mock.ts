/**
 * Minimal stand-in for the `obsidian` package in Vitest. The real package
 * ships types only; the runtime lives inside the app. Only what the pure core
 * modules need is provided here.
 */
import moment from 'moment'

export { moment }

export function normalizePath(path: string): string {
	return path
		.replace(/\\/g, '/')
		.replace(/\/+/g, '/')
		.replace(/^\/|\/$/g, '')
}
