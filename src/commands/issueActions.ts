import type { IssueKind } from 'core/issues'
import type TaskTimeTracker from '../main'

/** Remember not to show these warnings again, or a whole kind of them. */
export async function dismissIssues(
	plugin: TaskTimeTracker,
	keys: string[],
	kind?: IssueKind
): Promise<void> {
	const { settings } = plugin
	if (kind && !settings.ignoredIssueKinds.includes(kind)) {
		settings.ignoredIssueKinds = [...settings.ignoredIssueKinds, kind]
	}
	settings.dismissedIssues = [
		...new Set([...settings.dismissedIssues, ...keys]),
	]
	await plugin.saveSettings()
}
