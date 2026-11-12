import { describe, expect, it } from 'vitest'
import {
	describeLostClocks,
	findLostClocks,
	LostClockTracker,
	restoreLostClocks,
} from './lostClocks'
import { parseTasks } from './parser'

const tasks = (lines: string[]) => parseTasks(lines)
const spans = (lost: { taskName: string; start: Date; end: Date | null }[]) =>
	lost.map(
		({ taskName, start, end }) =>
			`${taskName} ${start.getHours()}:${String(start.getMinutes()).padStart(2, '0')}-${end ? `${end.getHours()}:${String(end.getMinutes()).padStart(2, '0')}` : ''}`
	)

const before = [
	'- [ ] Emails #work',
	'      [clock::2026-08-16T09:00:00--2026-08-16T09:30:00]',
	'      [clock::2026-08-16T11:00:00]',
	'- [ ] Walk the dog',
	'      [clock::2026-08-16T10:00:00--2026-08-16T10:30:00]',
]

describe('findLostClocks', () => {
	it('reports the clocks whose time the note no longer tracks', () => {
		const after = [
			'- [ ] Emails #work',
			'      [clock::2026-08-16T11:00:00]',
			'- [ ] Walk the dog',
		]
		expect(spans(findLostClocks(tasks(before), tasks(after)))).toEqual([
			'Emails 9:00-9:30',
			'Walk the dog 10:00-10:30',
		])
	})

	it('reports every clock of a task that is gone', () => {
		const after = before.slice(3)
		expect(spans(findLostClocks(tasks(before), tasks(after)))).toEqual([
			'Emails 9:00-9:30',
			'Emails 11:00-',
		])
	})

	it('accepts a clock merged into a longer one, and a running clock that was closed', () => {
		const after = [
			'- [ ] Emails #work',
			'      [clock::2026-08-16T08:45:00--2026-08-16T09:40:00]',
			'      [clock::2026-08-16T11:00:00--2026-08-16T11:20:00]',
			'- [ ] Walk the dog',
			'      [clock::2026-08-16T10:00:00--2026-08-16T10:30:00]',
		]
		expect(findLostClocks(tasks(before), tasks(after))).toEqual([])
	})

	it('reports a clock that was shortened', () => {
		const after = [
			...before.slice(0, 4),
			'      [clock::2026-08-16T10:00:00--2026-08-16T10:10:00]',
		]
		expect(spans(findLostClocks(tasks(before), tasks(after)))).toEqual([
			'Walk the dog 10:00-10:30',
		])
	})

	it('does not accept the time under another task', () => {
		const after = [
			'- [ ] Emails #work',
			'      [clock::2026-08-16T09:00:00--2026-08-16T09:30:00]',
			'      [clock::2026-08-16T11:00:00]',
			'      [clock::2026-08-16T10:00:00--2026-08-16T10:30:00]',
			'- [ ] Walk the dog',
		]
		expect(spans(findLostClocks(tasks(before), tasks(after)))).toEqual([
			'Walk the dog 10:00-10:30',
		])
	})
})

describe('restoreLostClocks', () => {
	const after = [
		'- [ ] Walk the dog',
		'      [clock::2026-08-16T10:15:00--2026-08-16T10:45:00]',
	]
	const lost = findLostClocks(tasks(before), tasks(after))

	it('puts the clocks back, unioned with the ones there, recreating a missing task', () => {
		// The dog walk's 10:00–10:30 overlaps the 10:15–10:45 the note has:
		// the union is one clock, 10:00–10:45.
		expect(restoreLostClocks(after.join('\n'), lost).split('\n')).toEqual([
			'- [ ] Walk the dog',
			'      [clock::2026-08-16T10:00:00--2026-08-16T10:45:00]',
			'- [ ] Emails #work',
			'      [clock::2026-08-16T09:00:00--2026-08-16T09:30:00]',
			'      [clock::2026-08-16T11:00:00]',
		])
	})

	it('changes nothing when run a second time', () => {
		const once = restoreLostClocks(after.join('\n'), lost)
		expect(restoreLostClocks(once, lost)).toBe(once)
	})
})

describe('describeLostClocks', () => {
	it('lists the first clocks and counts the rest', () => {
		const lost = findLostClocks(
			tasks([
				...before,
				'      [clock::2026-08-16T13:00:00--2026-08-16T13:30:00]',
			]),
			[]
		)
		expect(describeLostClocks('2026-08-16', lost)).toBe(
			'4 clocks disappeared from 2026-08-16 in a change made outside the editor, such as a sync: "Emails" 09:00–09:30, "Emails" running since 11:00, "Walk the dog" 10:00–10:30, and 1 more.'
		)
	})
})

describe('LostClockTracker', () => {
	const path = '2026-08-16.md'
	const withoutDogWalk = before.slice(0, 4)
	const withoutEmails = before.slice(3)
	/** A previous state of the note, saved at `mtime`. */
	const saved = (lines: string[], mtime = 1000) => ({
		tasks: tasks(lines),
		mtime,
	})
	/** The user's last editor change, at `at`, leaving the note as `lines`. */
	const editedAt = (at: number, lines: string[]) => ({
		at,
		content: () => lines.join('\n'),
	})

	it('reports clocks lost in an outside change', () => {
		const tracker = new LostClockTracker()
		const lost = tracker.noteChanged(path, saved(before), tasks(withoutDogWalk))
		expect(spans(lost)).toEqual(['Walk the dog 10:00-10:30'])
	})

	it('ignores a change without a known previous state', () => {
		const tracker = new LostClockTracker()
		expect(tracker.noteChanged(path, null, tasks(withoutDogWalk))).toEqual([])
	})

	it('ignores clocks the user removed in an editor since the note was last saved', () => {
		const tracker = new LostClockTracker()
		expect(
			tracker.noteChanged(
				path,
				saved(before, 1000),
				tasks(withoutDogWalk),
				editedAt(1001, before)
			)
		).toEqual([])
	})

	it("ignores the user's save when its change comes in after a newer write stamped the previous state", () => {
		// The change of an earlier write arrived late, so the store stamped
		// that state with the mtime of the save that followed it, which is
		// later than the edit: only the content tells the save apart.
		const tracker = new LostClockTracker()
		expect(
			tracker.noteChanged(
				path,
				saved(before, 1000),
				tasks(withoutDogWalk),
				editedAt(999, withoutDogWalk)
			)
		).toEqual([])
	})

	it('reports an outside change when the last editor change was already saved', () => {
		const tracker = new LostClockTracker()
		const lost = tracker.noteChanged(
			path,
			saved(before, 1000),
			tasks(withoutDogWalk),
			editedAt(999, before)
		)
		expect(spans(lost)).toEqual(['Walk the dog 10:00-10:30'])
	})

	it('ignores clocks the plugin removed itself', () => {
		const tracker = new LostClockTracker()
		tracker.acknowledge(path, withoutDogWalk.join('\n'))
		expect(
			tracker.noteChanged(path, saved(before), tasks(withoutDogWalk))
		).toEqual([])
	})

	it('measures the next outside change against what the plugin wrote', () => {
		const tracker = new LostClockTracker()
		tracker.acknowledge(path, before.join('\n'))
		// The store never saw the plugin's write: its previous state is older.
		const lost = tracker.noteChanged(path, saved([]), tasks(withoutDogWalk))
		expect(spans(lost)).toEqual(['Walk the dog 10:00-10:30'])
	})

	it('ignores two writes of the plugin whose changes both come in after them', () => {
		// The plugin stops the running Emails clock, then deletes the dog
		// walk, before the first write's change reaches the watch.
		const stopped = [
			'- [ ] Emails #work',
			'      [clock::2026-08-16T09:00:00--2026-08-16T09:30:00]',
			'      [clock::2026-08-16T11:00:00--2026-08-16T11:30:00]',
			'- [ ] Walk the dog',
			'      [clock::2026-08-16T10:00:00--2026-08-16T10:30:00]',
		]
		const tracker = new LostClockTracker()
		tracker.acknowledge(path, stopped.join('\n'))
		tracker.acknowledge(path, stopped.slice(0, 3).join('\n'))

		expect(tracker.noteChanged(path, saved(before), tasks(stopped))).toEqual([])
		expect(
			tracker.noteChanged(path, saved(stopped), tasks(stopped.slice(0, 3)))
		).toEqual([])
	})

	it('measures an outside change after two writes against the last one', () => {
		const tracker = new LostClockTracker()
		tracker.acknowledge(path, ['- [ ] Emails #work'].join('\n'))
		tracker.acknowledge(path, before.join('\n'))
		// The second write's change never came alone: a sync removed the dog
		// walk right after it.
		const lost = tracker.noteChanged(path, saved([]), tasks(withoutDogWalk))
		expect(spans(lost)).toEqual(['Walk the dog 10:00-10:30'])
	})

	it('keeps earlier losses until they come back, are restored or dismissed', () => {
		const tracker = new LostClockTracker()
		tracker.noteChanged(path, saved(before), tasks(withoutDogWalk))
		const both = tracker.noteChanged(
			path,
			saved(withoutDogWalk),
			tasks(['- [ ] Walk the dog'])
		)
		expect(spans(both)).toEqual([
			'Walk the dog 10:00-10:30',
			'Emails 9:00-9:30',
			'Emails 11:00-',
		])

		// A later sync brings the dog walk back.
		const cameBack = tracker.noteChanged(
			path,
			saved(['- [ ] Walk the dog']),
			tasks(withoutEmails)
		)
		expect(spans(cameBack)).toEqual(['Emails 9:00-9:30', 'Emails 11:00-'])

		tracker.forget(path)
		expect(
			tracker.noteChanged(path, saved(withoutEmails), tasks(withoutEmails))
		).toEqual([])
	})
})
