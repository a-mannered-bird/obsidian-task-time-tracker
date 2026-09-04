import { describe, expect, it } from 'vitest'
import {
	confirmationMatches,
	describeConsolidation,
	describeDeletion,
	describeRetag,
	listNames,
	referenceWarnings,
} from './confirmations'

describe('confirmationMatches', () => {
	it('ignores surrounding whitespace but not casing', () => {
		expect(confirmationMatches('  Deep work ', 'Deep work')).toBe(true)
		expect(confirmationMatches('deep work', 'Deep work')).toBe(false)
		expect(confirmationMatches('Deep wor', 'Deep work')).toBe(false)
	})
})

describe('referenceWarnings', () => {
	const settings = {
		quickActions: [
			{ name: 'Start focus', taskName: 'Deep work' },
			{ name: 'Lunch', taskName: 'Lunch' },
		],
		unassignedTaskName: 'Unassigned',
	}

	it('names the quick actions and the unassigned task pointing at the names', () => {
		expect(referenceWarnings(settings, ['Deep work', 'Unassigned'])).toEqual([
			'The quick action "Start focus" targets "Deep work".',
			'"Unassigned" is the unassigned task: quick interruptions depend on it.',
		])
	})

	it('is empty when nothing references the names', () => {
		expect(referenceWarnings(settings, ['Email'])).toEqual([])
	})
})

describe('describeConsolidation', () => {
	it('describes a plain rename without effects', () => {
		expect(
			describeConsolidation(['Deep wok'], 'Deep work', {
				notes: 1,
				removedTaskLines: 0,
				removedClockLines: 0,
			})
		).toEqual(['Rename "Deep wok" to "Deep work" across 1 daily note.'])
	})

	it('describes a merge with its line effects', () => {
		expect(
			describeConsolidation(['Task A', 'Task B'], null, {
				notes: 12,
				removedTaskLines: 12,
				removedClockLines: 3,
			})
		).toEqual([
			'Merge "Task A", "Task B" into the surviving name across 12 daily notes.',
			'12 task lines merged into a single line per note; 3 clock lines removed by joining overlapping, touching or empty clocks.',
		])
	})
})

describe('listNames', () => {
	it('quotes a few names and folds the rest into a count', () => {
		expect(listNames(['A', 'B'])).toBe('"A", "B"')
		expect(listNames(['A', 'B', 'C', 'D'], 2)).toBe(
			'"A", "B" and 2 other tasks'
		)
		expect(listNames(['A', 'B', 'C'], 2)).toBe('"A", "B" and 1 other task')
	})
})

describe('describeDeletion / describeRetag', () => {
	it('spells out the deletion counts', () => {
		expect(
			describeDeletion(['Deep wok'], { notes: 3, taskLines: 3, clockLines: 1 })
		).toBe(
			'Delete "Deep wok" from 3 daily notes: 3 task lines and 1 clock line are removed.'
		)
	})

	it('describes a tag change as setting the tags, naming the removed ones', () => {
		expect(
			describeRetag(
				['Deep work'],
				{ add: ['#focus', '#deep'], remove: ['#project'] },
				{ notes: 2, taskLines: 3 }
			)
		).toBe(
			'Set the tags of "Deep work" to "#focus", "#deep" on 3 task lines across 2 daily notes (removing "#project").'
		)
		expect(
			describeRetag(
				['Deep work'],
				{ add: [], remove: ['#focus'] },
				{ notes: 1, taskLines: 1 }
			)
		).toBe(
			'Remove every tag of "Deep work" on 1 task line across 1 daily note (removing "#focus").'
		)
	})
})
