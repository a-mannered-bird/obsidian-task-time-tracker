import { describe, expect, it } from 'vitest'
import { forgetTaskName, migrateTaskNames } from './settingsMigration'

const settings = {
	taskColors: { 'Deep wok': '#123456', 'Task A': 'var(--color-blue)' },
	hiddenTasks: ['Deep wok', 'Task B'],
	quickActions: [
		{ name: 'Focus', taskName: 'Deep wok', verb: 'toggle' },
		{ name: 'Lunch', taskName: 'Lunch', verb: 'toggle' },
	],
	unassignedTaskName: 'Deep wok',
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
		expect(migrated.quickActions).toEqual([
			{ name: 'Focus', taskName: 'Deep work', verb: 'toggle' },
			{ name: 'Lunch', taskName: 'Lunch', verb: 'toggle' },
		])
		expect(migrated.unassignedTaskName).toBe('Deep work')
	})

	it('lets an existing target keep its own color and visibility', () => {
		const migrated = migrateTaskNames(
			settings,
			['Deep wok', 'Task B'],
			'Task A',
			true
		)
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
	it('drops the color and hide flag only', () => {
		const forgotten = forgetTaskName(settings, 'Deep wok')
		expect(forgotten.taskColors).toEqual({ 'Task A': 'var(--color-blue)' })
		expect(forgotten.hiddenTasks).toEqual(['Task B'])
		expect(forgotten.quickActions).toEqual(settings.quickActions)
		expect(forgotten.unassignedTaskName).toBe('Deep wok')
	})
})
