export type DailyViewTab = 'tracker' | 'goals' | 'timeline'

/**
 * The daily view's tabs in the tab bar's order, each with the command that
 * shows it. Command ids are permanent once released.
 */
export const DAILY_VIEW_TABS: readonly {
	id: DailyViewTab
	label: string
	command: { id: string; name: string; icon: string }
}[] = [
	{
		id: 'tracker',
		label: 'Tracker',
		command: {
			id: 'open-tracker-tab',
			name: 'Open tracker tab',
			icon: 'timer',
		},
	},
	{
		id: 'goals',
		label: 'Goals',
		command: { id: 'open-goals-tab', name: 'Open goals tab', icon: 'target' },
	},
	{
		id: 'timeline',
		label: 'Timeline',
		command: {
			id: 'open-timeline-tab',
			name: 'Open timeline tab',
			icon: 'calendar-range',
		},
	},
]

export function isDailyViewTab(value: unknown): value is DailyViewTab {
	return DAILY_VIEW_TABS.some((tab) => tab.id === value)
}
