import type TaskTimeTracker from '../../src/main'

declare module 'wdio-obsidian-service' {
	interface InstalledPlugins {
		obsidianTaskTimeTracker: TaskTimeTracker
	}
}
