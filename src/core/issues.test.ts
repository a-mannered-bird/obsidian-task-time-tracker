import { describe, expect, it } from 'vitest'
import { fakeVault } from '../test/fakeVault'
import {
	detectIssues,
	editDistance,
	issuesByTask,
	similarNames,
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
				side: 'after-bed',
			},
			{
				kind: 'outside-day',
				name: 'Night feed',
				path: '2026-08-01.md',
				lineIndex: 5,
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
