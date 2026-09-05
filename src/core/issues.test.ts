import { describe, expect, it } from 'vitest'
import { fakeVault } from '../test/fakeVault'
import {
	describeIssue,
	detectIssues,
	editDistance,
	explainOutsideDay,
	issueKey,
	issueKeyNames,
	issuesByTask,
	similarNames,
	visibleIssues,
	type TaskIssue,
} from './issues'
import { VaultTaskIndex } from './vaultTaskIndex'

const now = new Date(2026, 7, 5, 12, 0, 0)

async function issuesOf(notes: Record<string, string>): Promise<TaskIssue[]> {
	const { source } = fakeVault(notes)
	const index = new VaultTaskIndex(source)
	await index.ensureBuilt()
	return detectIssues(index, now)
}

const ofKind = (issues: TaskIssue[], kind: TaskIssue['kind']) =>
	issues.filter((issue) => issue.kind === kind)

describe('editDistance', () => {
	it('counts insertions, deletions, substitutions and transpositions', () => {
		expect(editDistance('deep work', 'deep wok')).toBe(1)
		expect(editDistance('deep work', 'deep wrok')).toBe(1)
		expect(editDistance('deep work', 'deep sleep')).toBeGreaterThan(2)
		expect(editDistance('same', 'same')).toBe(0)
	})

	it('stops early past the limit', () => {
		expect(editDistance('abcdefgh', 'zzzzzzzz', 2)).toBeGreaterThan(2)
	})
})

describe('similarNames', () => {
	it('flags typo-distance pairs on both names, ignoring case and spacing', () => {
		const issues = similarNames(['Deep work', 'Deep  wok', 'Email'])
		expect(issues).toEqual([
			{ kind: 'similar-name', name: 'Deep work', other: 'Deep  wok' },
			{ kind: 'similar-name', name: 'Deep  wok', other: 'Deep work' },
		])
	})

	it('allows one edit for short names and two for longer ones', () => {
		expect(similarNames(['Run', 'Ran'])).toHaveLength(2)
		expect(similarNames(['Runs', 'Rant'])).toHaveLength(0)
		expect(similarNames(['Deep work', 'Deep wrk'])).toHaveLength(2)
		expect(similarNames(['Deep working', 'Deep work'])).toHaveLength(0)
	})

	it('skips pairs whose lengths differ by more than two', () => {
		expect(similarNames(['Email', 'Email to the boss'])).toHaveLength(0)
	})
})

describe('detectIssues: long sessions', () => {
	const clock = (day: string, from: string, to: string) =>
		`      [clock::2026-08-${day}T${from}:00--2026-08-${day}T${to}:00]`

	it('flags a session over five times the median once there are five', async () => {
		const usual = ['01', '02', '03', '04', '05'].map((day) =>
			['- [ ] Deep work', clock(day, '09:00', '09:30')].join('\n')
		)
		const notes = Object.fromEntries(
			usual.map((content, i) => [`2026-08-0${i + 1}.md`, content])
		)
		notes['2026-08-06.md'] = [
			'- [ ] Deep work',
			clock('06', '09:00', '12:00'),
		].join('\n')
		const issues = ofKind(await issuesOf(notes), 'long-session')
		expect(issues).toEqual([
			{
				kind: 'long-session',
				name: 'Deep work',
				path: '2026-08-06.md',
				lineIndex: 1,
				start: new Date(2026, 7, 6, 9, 0, 0),
				minutes: 180,
			},
		])
	})

	it('stays silent on the relative rule below five sessions', async () => {
		const issues = await issuesOf({
			'2026-08-01.md': ['- [ ] Deep work', clock('01', '09:00', '09:30')].join(
				'\n'
			),
			'2026-08-02.md': ['- [ ] Deep work', clock('02', '09:00', '12:00')].join(
				'\n'
			),
		})
		expect(ofKind(issues, 'long-session')).toEqual([])
	})

	it('always flags a session of sixteen hours or more', async () => {
		const issues = await issuesOf({
			'2026-08-01.md': [
				'- [ ] Deep work',
				'      [clock::2026-08-01T06:00:00--2026-08-01T22:00:00]',
			].join('\n'),
		})
		expect(ofKind(issues, 'long-session')).toHaveLength(1)
	})
})

describe('detectIssues: tag drift', () => {
	it('flags a task whose lines carry different tag sets, order aside', async () => {
		const issues = await issuesOf({
			'2026-08-01.md': '- [ ] Deep work #project #focus',
			'2026-08-02.md': '- [ ] Deep work #focus #project',
			'2026-08-03.md': '- [ ] Deep work #focus',
			'2026-08-04.md': '- [ ] Email',
		})
		expect(ofKind(issues, 'tag-drift')).toEqual([
			{
				kind: 'tag-drift',
				name: 'Deep work',
				tagSets: [['#focus', '#project'], ['#focus']],
			},
		])
	})
})

describe('detectIssues: clock overlap', () => {
	it('flags overlapping clocks of a task within a note, not touching ones', async () => {
		const issues = await issuesOf({
			'2026-08-01.md': [
				'- [ ] Deep work',
				'      [clock::2026-08-01T09:00:00--2026-08-01T10:00:00]',
				'      [clock::2026-08-01T10:00:00--2026-08-01T11:00:00]',
				'- [ ] Deep work',
				'      [clock::2026-08-01T10:30:00--2026-08-01T11:30:00]',
			].join('\n'),
		})
		expect(ofKind(issues, 'clock-overlap')).toEqual([
			{
				kind: 'clock-overlap',
				name: 'Deep work',
				path: '2026-08-01.md',
				lineIndex: 4,
				start: new Date(2026, 7, 1, 10, 30, 0),
			},
		])
	})

	it('does not compare clocks across notes', async () => {
		const issues = await issuesOf({
			'2026-08-01.md': [
				'- [ ] Deep work',
				'      [clock::2026-08-01T09:00:00--2026-08-01T10:00:00]',
			].join('\n'),
			'2026-08-02.md': [
				'- [ ] Deep work',
				'      [clock::2026-08-01T09:30:00--2026-08-01T10:30:00]',
			].join('\n'),
		})
		expect(ofKind(issues, 'clock-overlap')).toEqual([])
	})
})

describe('detectIssues: stale running clocks', () => {
	it('flags a running clock in a past note only', async () => {
		const issues = await issuesOf({
			'2026-08-04.md': [
				'- [ ] Deep work',
				'      [clock::2026-08-04T09:00:00]',
			].join('\n'),
			'2026-08-05.md': [
				'- [ ] Email',
				'      [clock::2026-08-05T09:00:00]',
			].join('\n'),
		})
		expect(ofKind(issues, 'stale-clock')).toEqual([
			{
				kind: 'stale-clock',
				name: 'Deep work',
				path: '2026-08-04.md',
				lineIndex: 1,
				start: new Date(2026, 7, 4, 9, 0, 0),
			},
		])
	})
})

describe('issuesByTask', () => {
	it('groups issues under their task name', () => {
		const grouped = issuesByTask([
			{ kind: 'similar-name', name: 'A', other: 'B' },
			{ kind: 'tag-drift', name: 'A', tagSets: [] },
			{ kind: 'similar-name', name: 'B', other: 'A' },
		])
		expect([...grouped.keys()]).toEqual(['A', 'B'])
		expect(grouped.get('A')).toHaveLength(2)
	})
})

describe('detectIssues: clocks outside the day window', () => {
	const note = (body: string[], wake?: string, bed?: string) =>
		[
			'---',
			...(wake ? [`wake_time: ${wake}`] : []),
			...(bed ? [`bed_time: ${bed}`] : []),
			'---',
			...body,
		].join('\n')

	it('flags clocks wholly before wake or after bed, touching ones included in the day', async () => {
		const issues = await issuesOf({
			'2026-08-01.md': note(
				[
					'- [ ] Night feed',
					'      [clock::2026-08-01T03:00:00--2026-08-01T03:20:00]',
					'- [ ] Deep work',
					'      [clock::2026-08-01T06:30:00--2026-08-01T07:00:00]',
					'      [clock::2026-08-01T09:00:00--2026-08-01T10:00:00]',
					'      [clock::2026-08-01T22:30:00--2026-08-01T23:00:00]',
					'- [ ] Late call',
					'      [clock::2026-08-01T23:30:00--2026-08-01T23:45:00]',
				],
				'2026-08-01T07:00:00',
				'2026-08-01T23:00:00'
			),
		})
		// Issues come in task order (alphabetical here: equal usage).
		expect(ofKind(issues, 'outside-day')).toEqual([
			{
				kind: 'outside-day',
				name: 'Late call',
				path: '2026-08-01.md',
				lineIndex: 11,
				start: new Date(2026, 7, 1, 23, 30, 0),
				end: new Date(2026, 7, 1, 23, 45, 0),
				boundary: new Date(2026, 7, 1, 23, 0, 0),
				side: 'after-bed',
			},
			{
				kind: 'outside-day',
				name: 'Night feed',
				path: '2026-08-01.md',
				lineIndex: 5,
				start: new Date(2026, 7, 1, 3, 0, 0),
				end: new Date(2026, 7, 1, 3, 20, 0),
				boundary: new Date(2026, 7, 1, 7, 0, 0),
				side: 'before-wake',
			},
		])
	})

	it('accepts clocks past midnight when the bed time is too', async () => {
		const issues = await issuesOf({
			'2026-08-01.md': note(
				[
					'- [ ] Deep work',
					'      [clock::2026-08-02T00:30:00--2026-08-02T00:50:00]',
					'      [clock::2026-08-02T01:30:00]',
				],
				'2026-08-01T07:00:00',
				'2026-08-02T01:00:00'
			),
		})
		expect(ofKind(issues, 'outside-day')).toEqual([
			{
				kind: 'outside-day',
				name: 'Deep work',
				path: '2026-08-01.md',
				lineIndex: 6,
				start: new Date(2026, 7, 2, 1, 30, 0),
				end: null,
				boundary: new Date(2026, 7, 2, 1, 0, 0),
				side: 'after-bed',
			},
		])
	})

	it('checks nothing without the corresponding wake or bed time', async () => {
		const body = [
			'- [ ] Deep work',
			'      [clock::2026-08-01T03:00:00--2026-08-01T03:20:00]',
			'      [clock::2026-08-01T23:30:00--2026-08-01T23:45:00]',
		]
		const noTimes = await issuesOf({ '2026-08-01.md': note(body) })
		expect(ofKind(noTimes, 'outside-day')).toEqual([])
		const wakeOnly = await issuesOf({
			'2026-08-01.md': note(body, '2026-08-01T07:00:00'),
		})
		expect(
			ofKind(wakeOnly, 'outside-day').map(
				(i) => i.kind === 'outside-day' && i.side
			)
		).toEqual(['before-wake'])
	})
})

describe('describeIssue', () => {
	it('phrases the note-free kinds and both sides of the day window', () => {
		expect(
			describeIssue({
				kind: 'similar-name',
				name: 'Deep wok',
				other: 'Deep work',
			})
		).toBe('Name close to "Deep work"')
		expect(
			describeIssue({
				kind: 'clock-overlap',
				name: 'Deep work',
				path: 'Journal/2026-08-01.md',
				lineIndex: 2,
				start: new Date(2026, 7, 1, 9, 0, 0),
			})
		).toBe('Overlapping clocks in 2026-08-01')
		const outside = (side: 'before-wake' | 'after-bed') =>
			describeIssue({
				kind: 'outside-day',
				name: 'Deep work',
				path: '2026-08-01.md',
				lineIndex: 2,
				start: new Date(2026, 7, 1, 9, 0, 0),
				end: new Date(2026, 7, 1, 9, 30, 0),
				boundary: new Date(2026, 7, 1, 9, 15, 0),
				side,
			})
		expect(outside('before-wake')).toBe('Before the wake time in 2026-08-01')
		expect(outside('after-bed')).toBe('After the bed time in 2026-08-01')
	})

	it('names the note by its path and formats the specifics', () => {
		expect(
			describeIssue({
				kind: 'long-session',
				name: 'Deep work',
				path: 'Journal/2026-08-06.md',
				lineIndex: 1,
				start: new Date(2026, 7, 6, 9, 0, 0),
				minutes: 180,
			})
		).toBe('3h 00m session in 2026-08-06')
		expect(
			describeIssue({
				kind: 'tag-drift',
				name: 'Deep work',
				tagSets: [['#focus', '#project'], []],
			})
		).toBe('Tags differ across notes: #focus #project | no tag')
		expect(
			describeIssue({
				kind: 'stale-clock',
				name: 'Deep work',
				path: '2026-08-04.md',
				lineIndex: 1,
				start: new Date(2026, 7, 4, 9, 0, 0),
			})
		).toBe('Still running since 2026-08-04 09:00:00 in 2026-08-04')
	})
})

describe('issueKey / visibleIssues', () => {
	const overlap: TaskIssue = {
		kind: 'clock-overlap',
		name: 'Deep work',
		path: '2026-08-01.md',
		lineIndex: 4,
		start: new Date(2026, 7, 1, 10, 30, 0),
	}
	const similar: TaskIssue = {
		kind: 'similar-name',
		name: 'Deep wok',
		other: 'Deep work',
	}
	const drift: TaskIssue = {
		kind: 'tag-drift',
		name: 'Deep work',
		tagSets: [['#focus'], ['#focus', '#project']],
	}

	it('keys clock issues by their start, not their line', () => {
		expect(issueKey({ ...overlap, lineIndex: 9 })).toBe(issueKey(overlap))
		expect(issueKey(overlap)).toBe(
			'["clock-overlap","Deep work","2026-08-01.md","2026-08-01T10:30:00"]'
		)
	})

	it('keys a similar pair the same from either side', () => {
		expect(issueKey(similar)).toBe(
			issueKey({ kind: 'similar-name', name: 'Deep work', other: 'Deep wok' })
		)
	})

	it('names the tasks a key refers to', () => {
		expect(issueKeyNames(issueKey(similar))).toEqual(['Deep wok', 'Deep work'])
		expect(issueKeyNames(issueKey(drift))).toEqual(['Deep work'])
		expect(issueKeyNames('not json')).toEqual([])
	})

	it('hides switched-off kinds and dismissed warnings', () => {
		const shown = visibleIssues([overlap, similar, drift], {
			ignoredIssueKinds: ['tag-drift'],
			dismissedIssues: [issueKey(similar)],
		})
		expect(shown).toEqual([overlap])
	})
})

describe('explainOutsideDay', () => {
	it('spells out the clock and the boundary it falls outside of', () => {
		expect(
			explainOutsideDay({
				kind: 'outside-day',
				name: 'Night feed',
				path: 'Journal/2026-08-01.md',
				lineIndex: 5,
				start: new Date(2026, 7, 1, 3, 0, 0),
				end: new Date(2026, 7, 1, 3, 20, 0),
				boundary: new Date(2026, 7, 1, 7, 0, 0),
				side: 'before-wake',
			})
		).toBe(
			'"Night feed" clocked 2026-08-01 03:00–03:20 ends before the wake time of 2026-08-01, 2026-08-01 07:00. Either the clock belongs to another note, or the wake time is wrong.'
		)
		expect(
			explainOutsideDay({
				kind: 'outside-day',
				name: 'Deep work',
				path: '2026-08-01.md',
				lineIndex: 6,
				start: new Date(2026, 7, 2, 1, 30, 0),
				end: null,
				boundary: new Date(2026, 7, 2, 1, 0, 0),
				side: 'after-bed',
			})
		).toBe(
			'"Deep work" clocked 2026-08-02 01:30, still running starts after the bed time of 2026-08-01, 2026-08-02 01:00. Either the clock belongs to another note, or the bed time is wrong.'
		)
	})
})
