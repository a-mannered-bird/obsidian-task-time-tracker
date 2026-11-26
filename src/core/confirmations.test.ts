import { describe, expect, it } from 'vitest'
import {
	confirmationMatches,
	describeConsolidation,
	describeDeletion,
	describeNoteTaskRemoval,
	describeRetag,
	describeMetricConsolidation,
	describeMetricDeletion,
	describeTagConsolidation,
	describeUnitChange,
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
	it('warns about the interruption task among the names', () => {
		expect(referenceWarnings(['Deep work', 'Interruption'])).toEqual([
			'"Interruption" holds the time of quick interruptions not assigned to a task yet.',
		])
	})

	it('is empty when the plugin relies on none of the names', () => {
		expect(referenceWarnings(['Email'])).toEqual([])
	})
})

describe('describeTagConsolidation', () => {
	const preview = { notes: 3, taskLines: 4, goals: 1, notesCombiningGoals: 0 }

	it('calls a rename onto an existing tag a merge', () => {
		expect(
			describeTagConsolidation(['#job'], '#fitness', preview, false)
		).toEqual([
			'Rename #job to #fitness on 4 task lines and 1 tag goal across 3 daily notes.',
		])
		expect(
			describeTagConsolidation(['#job'], '#work', preview, true)[0]
		).toMatch(/^Merge #job into #work/)
	})

	it('explains how tag goals meeting in a note combine', () => {
		const combining = { ...preview, notesCombiningGoals: 2 }
		expect(
			describeTagConsolidation(['#a', '#b'], null, combining, true)
		).toEqual([
			'Merge #a, #b into the surviving tag on 4 task lines and 1 tag goal across 3 daily notes. A line carrying several of them keeps the tag once.',
			"Tag goals meet on 2 days: targets of the same kind add up, otherwise the surviving tag's goal is kept.",
		])
	})
})

describe('metric confirmations', () => {
	const preview = {
		notes: 9,
		goalLines: 14,
		combinedGoalLines: 0,
		notesCombiningGoals: 0,
	}

	it('calls a rename onto an existing metric a merge', () => {
		expect(
			describeMetricConsolidation(['distnce'], 'distance', preview, false)
		).toEqual([
			'Rename "distnce" to "distance" on 14 goal lines across 9 daily notes.',
		])
		expect(
			describeMetricConsolidation(['km'], 'distance', preview, true)[0]
		).toMatch(/^Merge "km" into "distance"/)
	})

	it('says how many goals combine, and on how many days', () => {
		const combining = {
			...preview,
			combinedGoalLines: 3,
			notesCombiningGoals: 2,
		}
		expect(
			describeMetricConsolidation(['km', 'dist'], null, combining, true)[1]
		).toMatch(/^3 goals will be combined on 2 days/)
		expect(
			describeUnitChange('laps', ['lengths'], 'laps', combining)
		).toHaveLength(2)
	})

	it('only deletes the settings of a metric no goal line uses', () => {
		const unused = { ...preview, notes: 0, goalLines: 0 }
		expect(describeMetricDeletion(['steps'], unused)).toBe(
			'No goal line uses "steps": only its settings are deleted.'
		)
		expect(describeMetricDeletion(['km'], preview)).toMatch(
			/^Delete 14 goal lines of "km" across 9 daily notes, results included/
		)
	})

	it('names a missing unit and never promises a conversion', () => {
		expect(
			describeUnitChange('pace', ['', 'mn/km'], 'min/km', preview)
		).toEqual([
			'Change the unit of "pace" from no unit, mn/km to min/km on 14 goal lines across 9 daily notes. Values are not converted.',
		])
	})
})

describe('describeConsolidation', () => {
	it('describes a plain rename without effects', () => {
		expect(
			describeConsolidation(['Deep wok'], 'Deep work', {
				notes: 1,
				removedTaskLines: 0,
				removedClockLines: 0,
				combinedGoalLines: 0,
				notesCombiningGoals: 0,
			})
		).toEqual(['Rename "Deep wok" to "Deep work" across 1 daily note.'])
	})

	it('describes a merge with its line effects', () => {
		expect(
			describeConsolidation(['Task A', 'Task B'], null, {
				notes: 12,
				removedTaskLines: 12,
				removedClockLines: 3,
				combinedGoalLines: 0,
				notesCombiningGoals: 0,
			})
		).toEqual([
			'Merge "Task A", "Task B" into the surviving name across 12 daily notes.',
			'12 task lines merged into a single line per note; 3 clock lines removed by joining overlapping, touching or empty clocks.',
		])
	})
})

describe('describeConsolidation: goals', () => {
	it('says how many goals combine on how many days', () => {
		expect(
			describeConsolidation(['Jog'], 'Run', {
				notes: 3,
				removedTaskLines: 2,
				removedClockLines: 0,
				combinedGoalLines: 3,
				notesCombiningGoals: 2,
			}).at(-1)
		).toBe('3 goals will be combined on 2 days.')
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

describe('describeNoteTaskRemoval', () => {
	it('counts the clocks going with the task, when it has any', () => {
		expect(describeNoteTaskRemoval('Email', 2)).toBe(
			'"Email" and its 2 clocks are removed from this note. Other daily notes keep theirs.'
		)
		expect(describeNoteTaskRemoval('Email', 0)).toBe(
			'"Email" is removed from this note. Other daily notes keep theirs.'
		)
	})
})
