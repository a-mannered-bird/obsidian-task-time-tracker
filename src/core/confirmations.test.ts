import { describe, expect, it } from 'vitest'
import {
	confirmationMatches,
	describeConsolidation,
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
			describeConsolidation(['Task A', 'Task B'], 'Task A', {
				notes: 12,
				removedTaskLines: 12,
				removedClockLines: 3,
			})
		).toEqual([
			'Merge "Task A", "Task B" into "Task A" across 12 daily notes.',
			'12 task lines merged into a single line per note; 3 clock lines removed by joining overlapping, touching or empty clocks.',
		])
	})
})
