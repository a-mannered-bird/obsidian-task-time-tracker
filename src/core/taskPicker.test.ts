import { describe, expect, it } from 'vitest'
import { parseTasks } from './parser'
import { pickerLabel, sortForPicker } from './taskPicker'

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
			bold: false,
			italic: false,
			underline: false,
		},
		{
			tag: '#routine',
			emoji: '🔂',
			bold: false,
			italic: false,
			underline: false,
		},
		{ tag: '#chores', emoji: '', bold: false, italic: false, underline: false },
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
