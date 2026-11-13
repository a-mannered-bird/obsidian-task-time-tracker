import { describe, expect, it } from 'vitest'
import { parseTasks } from './parser'
import {
	buildPickerEntries,
	createEntryFromQuery,
	entryLabel,
	noteMatchesFirst,
	pickerLabel,
	prepareWordSearch,
	resurfacedEntry,
	sortForPicker,
	withoutNoteTasks,
	groupBreaks,
} from './taskPicker'
import type { VaultTaskInfo } from './vaultTaskIndex'

const tasks = parseTasks([
	'- [x] Done early #routine',
	'      [clock::2026-08-16T08:00:00--2026-08-16T08:30:00]',
	'- [ ] Never started #project',
	'- [ ] Worked on last #chores',
	'      [clock::2026-08-16T10:00:00--2026-08-16T11:00:00]',
	'- [ ] Running now',
	'      [clock::2026-08-16T11:00:00]',
	'- [ ] Worked on first',
	'      [clock::2026-08-16T09:00:00--2026-08-16T09:30:00]',
])

describe('sortForPicker', () => {
	it('orders running, then unticked by last end, then ticked', () => {
		expect(sortForPicker(tasks).map((t) => t.name)).toEqual([
			'Running now',
			'Worked on last',
			'Worked on first',
			'Never started',
			'Done early',
		])
	})

	it('does not mutate the input', () => {
		const names = tasks.map((t) => t.name)
		sortForPicker(tasks)
		expect(tasks.map((t) => t.name)).toEqual(names)
	})
})

describe('pickerLabel', () => {
	const mappings = [
		{
			tag: '#project',
			emoji: '⭐️',
		},
		{
			tag: '#routine',
			emoji: '🔂',
		},
		{ tag: '#chores', emoji: '' },
	]
	const byName = (name: string) => tasks.find((t) => t.name === name)!

	it('marks running and ticked tasks before looking at tags', () => {
		expect(pickerLabel(byName('Running now'), mappings)).toBe('⏳ Running now')
		expect(pickerLabel(byName('Done early'), mappings)).toBe('✅ Done early')
	})

	it('uses the emoji of the first mapped tag, or none', () => {
		expect(pickerLabel(byName('Never started'), mappings)).toBe(
			'⭐️ Never started'
		)
		expect(pickerLabel(byName('Worked on last'), mappings)).toBe(
			'Worked on last'
		)
		expect(pickerLabel(byName('Worked on first'), mappings)).toBe(
			'Worked on first'
		)
	})
})

const info = (name: string, tags: string[] = []): VaultTaskInfo => ({
	name,
	tags,
	noteCount: 1,
	lastUsed: new Date(2026, 7, 15),
	totalMinutes: 0,
})

describe('buildPickerEntries', () => {
	it('lists note tasks in picker order, then unseen vault entries', () => {
		const entries = buildPickerEntries(tasks, [
			info('Deep work'),
			info('Running now'),
			info('Email'),
		])
		expect(
			entries.map((entry) =>
				entry.kind === 'note'
					? `note:${entry.task.name}`
					: `vault:${entry.info.name}`
			)
		).toEqual([
			'note:Running now',
			'note:Worked on last',
			'note:Worked on first',
			'note:Never started',
			'note:Done early',
			'vault:Deep work',
			'vault:Email',
		])
	})
})

describe('withoutNoteTasks', () => {
	it('drops the vault entries the note has, offered or not, visible or hidden', () => {
		const entries = withoutNoteTasks(
			{
				visible: [info('Deep work'), info('Running now')],
				hidden: [info('Old chore'), info('Emails')],
			},
			['Running now', 'Emails']
		)
		expect(entries.visible.map((entry) => entry.name)).toEqual(['Deep work'])
		expect(entries.hidden.map((entry) => entry.name)).toEqual(['Old chore'])
	})
})

describe('entryLabel', () => {
	const mappings = [
		{
			tag: '#project',
			emoji: '⭐️',
		},
	]

	it('labels vault entries with the mapped tag emoji, or none', () => {
		expect(
			entryLabel({ kind: 'vault', info: info('Plan', ['#project']) }, mappings)
		).toBe('⭐️ Plan')
		expect(entryLabel({ kind: 'vault', info: info('Plan') }, mappings)).toBe(
			'Plan'
		)
	})

	it('delegates note entries to pickerLabel', () => {
		const task = tasks.find((t) => t.name === 'Running now')!
		expect(entryLabel({ kind: 'note', task }, mappings)).toBe('⏳ Running now')
	})
})

describe('createEntryFromQuery', () => {
	const existing = ['Deep work', 'Email']

	it('offers the trimmed name with the typed tags', () => {
		expect(
			createEntryFromQuery('  Write   blog post #project #writing ', existing)
		).toEqual({
			name: 'Write blog post',
			tags: ['#project', '#writing'],
		})
	})

	it('offers nothing when the name matches an existing task, whatever the casing or tags', () => {
		expect(createEntryFromQuery('Deep work', existing)).toBeNull()
		expect(createEntryFromQuery('deep WORK', existing)).toBeNull()
		expect(createEntryFromQuery('Deep work #new', existing)).toBeNull()
	})

	it('offers nothing for an empty or tags-only query', () => {
		expect(createEntryFromQuery('', existing)).toBeNull()
		expect(createEntryFromQuery('   ', existing)).toBeNull()
		expect(createEntryFromQuery('#project', existing)).toBeNull()
	})

	it('still offers a near-miss so existing tasks never block new ones', () => {
		expect(createEntryFromQuery('Deep working', existing)).toEqual({
			name: 'Deep working',
			tags: [],
		})
	})
})

describe('resurfacedEntry', () => {
	const hidden = [info('Old project', ['#archive'])]

	it('returns the hidden task named exactly, whatever the casing', () => {
		expect(resurfacedEntry('old PROJECT', hidden)).toBe(hidden[0])
		expect(resurfacedEntry('  Old   project ', hidden)).toBe(hidden[0])
	})

	it('ignores partial matches and empty queries', () => {
		expect(resurfacedEntry('Old proj', hidden)).toBeNull()
		expect(resurfacedEntry('', hidden)).toBeNull()
	})
})

describe('noteMatchesFirst', () => {
	it('moves note matches ahead of vault ones without reordering within', () => {
		const note = (name: string) => ({
			item: {
				kind: 'note' as const,
				task: tasks.find((t) => t.name === name)!,
			},
		})
		const vault = (name: string) => ({
			item: { kind: 'vault' as const, info: info(name) },
		})
		const ranked = [
			vault('Deep work'),
			note('Worked on last'),
			vault('Deep dive'),
			note('Done early'),
		]
		expect(
			noteMatchesFirst(ranked).map((m) =>
				m.item.kind === 'note'
					? `note:${m.item.task.name}`
					: `vault:${m.item.info.name}`
			)
		).toEqual([
			'note:Worked on last',
			'note:Done early',
			'vault:Deep work',
			'vault:Deep dive',
		])
	})
})

describe('prepareWordSearch', () => {
	// Stand-in for the fuzzy matcher: a case-insensitive substring search
	// scoring the negated match position.
	const prepareWord = (word: string) => (text: string) => {
		const start = text.toLowerCase().indexOf(word.toLowerCase())
		if (start < 0) return null
		return {
			score: -start,
			matches: [[start, start + word.length] as [number, number]],
		}
	}

	it('matches words typed in another order than the text has them', () => {
		const search = prepareWordSearch('report weekly', prepareWord)
		expect(search('Weekly report')).toEqual({
			score: -7,
			matches: [
				[0, 6],
				[7, 13],
			],
		})
	})

	it('rejects a text missing one of the words', () => {
		const search = prepareWordSearch('weekly budget', prepareWord)
		expect(search('Weekly report')).toBeNull()
	})

	it('merges the highlights of words matching overlapping ranges', () => {
		const search = prepareWordSearch('port report repo', prepareWord)
		expect(search('Weekly report')?.matches).toEqual([[7, 13]])
	})

	it('matches every text when the query has no word', () => {
		const search = prepareWordSearch('  ', prepareWord)
		expect(search('Weekly report')).toEqual({ score: 0, matches: [] })
	})
})

describe('groupBreaks', () => {
	it('heads each group and separates the create row', () => {
		expect(groupBreaks(['note', 'note', 'vault', 'create'], 'Today')).toEqual(
			new Map([
				[0, { heading: 'Today' }],
				[2, { heading: 'Other notes' }],
				[3, { separator: true }],
			])
		)
	})

	it('leaves a lone create row without a separator', () => {
		expect(groupBreaks(['create'], 'Today')).toEqual(new Map())
	})
})
