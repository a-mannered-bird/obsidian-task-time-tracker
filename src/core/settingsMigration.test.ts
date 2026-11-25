import { describe, expect, it } from 'vitest'
import {
	forgetTaskName,
	migrateTaskNames,
	type NameKeyedSettings,
} from './settingsMigration'

const settings: NameKeyedSettings = {
	taskColors: { 'Deep wok': '#123456', 'Task A': 'var(--color-blue)' },
	hiddenTasks: ['Deep wok', 'Task B'],
	dismissedIssues: [
		'["similar-name","Deep wok","Deep work"]',
		'["tag-drift","Task A","#project"]',
	],
	dismissedGoalSuggestions: [
		{ day: '2026-08-03', taskName: 'Deep wok', metric: null, unit: '' },
		{ day: '2026-08-03', taskName: 'Task A', metric: 'pages', unit: '' },
	],
	streakSkipsMissingDays: [
		{ taskName: 'Deep wok', metric: 'pages', unit: '' },
		{ taskName: 'Task A', metric: 'pages', unit: '' },
	],
	hiddenGoalBars: [
		{ taskName: 'Deep wok', metric: null, unit: '' },
		{ taskName: 'Task A', metric: null, unit: '' },
	],
	goalBadges: [
		{ key: { taskName: 'Deep wok', metric: null, unit: '' }, badge: 'star' },
		{
			key: { taskName: 'Deep wok', metric: 'pages', unit: '' },
			badge: 'flame',
		},
		{ key: { taskName: 'Task A', metric: 'pages', unit: '' }, badge: 'random' },
	],
}

describe('migrateTaskNames', () => {
	it('moves every entry of a renamed task to the new name', () => {
		const migrated = migrateTaskNames(
			settings,
			['Deep wok'],
			'Deep work',
			false
		)
		expect(migrated.taskColors).toEqual({
			'Deep work': '#123456',
			'Task A': 'var(--color-blue)',
		})
		expect(migrated.hiddenTasks).toEqual(['Task B', 'Deep work'])
		// The dismissal about the old name is dropped; the other one stays.
		expect(migrated.dismissedIssues).toEqual([
			'["tag-drift","Task A","#project"]',
		])
		expect(migrated.goalBadges).toEqual([
			{ key: { taskName: 'Deep work', metric: null, unit: '' }, badge: 'star' },
			{
				key: { taskName: 'Deep work', metric: 'pages', unit: '' },
				badge: 'flame',
			},
			{
				key: { taskName: 'Task A', metric: 'pages', unit: '' },
				badge: 'random',
			},
		])
		expect(migrated.hiddenGoalBars).toEqual([
			{ taskName: 'Deep work', metric: null, unit: '' },
			{ taskName: 'Task A', metric: null, unit: '' },
		])
		// A suggestion dismissed for the old name stays dismissed.
		expect(migrated.dismissedGoalSuggestions).toEqual([
			{ day: '2026-08-03', taskName: 'Deep work', metric: null, unit: '' },
			{ day: '2026-08-03', taskName: 'Task A', metric: 'pages', unit: '' },
		])
	})

	it('lets an existing target keep its own color and visibility', () => {
		const migrated = migrateTaskNames(
			settings,
			['Deep wok', 'Task B'],
			'Task A',
			true
		)
		// Both had the setting for pages: the target keeps one.
		expect(migrated.streakSkipsMissingDays).toEqual([
			{ taskName: 'Task A', metric: 'pages', unit: '' },
		])
		expect(migrated.hiddenGoalBars).toEqual([
			{ taskName: 'Task A', metric: null, unit: '' },
		])
		// The target's own badge for pages wins; the time goal's moves over.
		expect(migrated.goalBadges).toEqual([
			{ key: { taskName: 'Task A', metric: null, unit: '' }, badge: 'star' },
			{
				key: { taskName: 'Task A', metric: 'pages', unit: '' },
				badge: 'random',
			},
		])
		expect(migrated.taskColors).toEqual({ 'Task A': 'var(--color-blue)' })
		// Task A was visible; the hidden sources do not hide it.
		expect(migrated.hiddenTasks).toEqual([])
	})

	it('hides a brand-new target only when every source was hidden', () => {
		const allHidden = migrateTaskNames(
			settings,
			['Deep wok', 'Task B'],
			'Merged',
			false
		)
		expect(allHidden.hiddenTasks).toEqual(['Merged'])

		const mixed = migrateTaskNames(
			settings,
			['Deep wok', 'Task A'],
			'Merged',
			false
		)
		expect(mixed.hiddenTasks).toEqual(['Task B'])
		// Deep wok's color transfers, being the first source with one.
		expect(mixed.taskColors).toEqual({ Merged: '#123456' })
	})
})

describe('forgetTaskName', () => {
	it("drops the deleted task's entries", () => {
		const forgotten = forgetTaskName(settings, 'Deep wok')
		expect(forgotten.taskColors).toEqual({ 'Task A': 'var(--color-blue)' })
		expect(forgotten.hiddenTasks).toEqual(['Task B'])
		expect(forgotten.dismissedIssues).toEqual([
			'["tag-drift","Task A","#project"]',
		])
		expect(forgotten.dismissedGoalSuggestions).toEqual([
			{ day: '2026-08-03', taskName: 'Task A', metric: 'pages', unit: '' },
		])
		expect(forgotten.streakSkipsMissingDays).toEqual([
			{ taskName: 'Task A', metric: 'pages', unit: '' },
		])
		expect(forgotten.hiddenGoalBars).toEqual([
			{ taskName: 'Task A', metric: null, unit: '' },
		])
		expect(forgotten.goalBadges).toEqual([
			{
				key: { taskName: 'Task A', metric: 'pages', unit: '' },
				badge: 'random',
			},
		])
	})
})
