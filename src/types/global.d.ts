import type { App } from 'obsidian'

declare global {
	interface Window {
		app: App
	}
}

// For Svelte components, if you want to extend the global this context
declare module 'svelte' {
	interface SvelteComponent {
		app?: App
	}
}

export {}

/** Stylesheet imports are bundled by esbuild into styles.css. */
declare module '*.css'
