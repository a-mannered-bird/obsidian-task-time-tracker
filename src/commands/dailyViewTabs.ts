import { DAILY_VIEW_TABS } from 'core/dailyViewTabs'
import type TaskTimeTracker from '../main'

export function registerDailyViewTabCommands(plugin: TaskTimeTracker) {
	for (const tab of DAILY_VIEW_TABS) {
		plugin.addCommand({
			...tab.command,
			callback: () => void plugin.openDailyViewTab(tab.id),
		})
	}
}
