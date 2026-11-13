import { describe, expect, it } from 'vitest'
import { planCompletion } from './complete'
import { TaskNote } from './note'
import { parseTasks } from './parser'
import {
	addTaskLine,
	describeCompletion,
	pausedByInterruption,
	startActions,
	trackerLayout,
} from './tracker'

const names = (tasks: { name: string }[]) => tasks.map((task) => task.name)

describe('trackerLayout', () => {
	it('splits running, open and done tasks, each in note order', () => {
		const layout = trackerLayout(
			parseTasks([
				'- [x] Breakfast',
				'      [clock::2026-11-12T07:30:00--2026-11-12T07:50:00]',
				'- [ ] Write blog post',
				'      [clock::2026-11-12T09:00:00--2026-11-12T10:00:00]',
				'- [ ] Chores',
				'      [clock::2026-11-12T10:42:00]',
				'- [ ] Email',
				'- [x] Read news',
			]),
			'Unassigned'
		)
		expect(names(layout.running)).toEqual(['Chores'])
		expect(names(layout.open)).toEqual(['Write blog post', 'Email'])
		expect(names(layout.done)).toEqual(['Breakfast', 'Read news'])
		expect(layout.doneUnfolded).toBe(false)
	})

	it('unfolds the done tasks when nothing else is left', () => {
		const layout = trackerLayout(
			parseTasks([
				'- [x] Breakfast',
				'      [clock::2026-11-12T07:30:00--2026-11-12T07:50:00]',
				'- [x] Read news',
			]),
			'Unassigned'
		)
		expect(layout.doneUnfolded).toBe(true)
	})

	it('keeps the done tasks folded while a task runs', () => {
		const layout = trackerLayout(
			parseTasks([
				'- [x] Breakfast',
				'- [ ] Chores',
				'      [clock::2026-11-12T10:42:00]',
			]),
			'Unassigned'
		)
		expect(layout.doneUnfolded).toBe(false)
	})

	it('keeps a ticked task that still runs among the running ones', () => {
		const layout = trackerLayout(
			parseTasks(['- [x] Chores', '      [clock::2026-11-12T10:42:00]']),
			'Unassigned'
		)
		expect(names(layout.running)).toEqual(['Chores'])
		expect(layout.done).toEqual([])
	})

	it('leaves out the unassigned task once its time went elsewhere', () => {
		const layout = trackerLayout(
			parseTasks([
				'- [ ] Email',
				'- [ ] Unassigned',
				'- [ ] Phone call',
				'      [clock::2026-11-12T11:02:00--2026-11-12T11:10:00]',
			]),
			'Unassigned'
		)
		expect(names(layout.open)).toEqual(['Email', 'Phone call'])
	})
})

describe('startActions', () => {
	it('offers a plain start while nothing runs', () => {
		expect(startActions([])).toEqual({ primary: 'start', alongside: false })
	})

	it('switches, or starts alongside, while something runs', () => {
		const running = parseTasks([
			'- [ ] Chores',
			'  [clock::2026-11-12T10:42:00]',
		])
		expect(startActions(running)).toEqual({
			primary: 'switch',
			alongside: true,
		})
	})
})

describe('pausedByInterruption', () => {
	it('lists the tasks the running interruption stopped', () => {
		const tasks = parseTasks([
			'- [ ] Email',
			'      [clock::2026-11-12T09:00:00--2026-11-12T09:30:00]',
			'- [ ] Chores',
			'      [clock::2026-11-12T10:42:00--2026-11-12T11:02:00]',
			'- [ ] German podcast',
			'      [clock::2026-11-12T10:36:00--2026-11-12T11:02:00]',
			'- [ ] Unassigned',
			'      [clock::2026-11-12T11:02:00]',
		])
		expect(names(pausedByInterruption(tasks, 'Unassigned'))).toEqual([
			'Chores',
			'German podcast',
		])
	})

	it('is empty when no interruption runs', () => {
		const tasks = parseTasks([
			'- [ ] Chores',
			'      [clock::2026-11-12T10:42:00--2026-11-12T11:02:00]',
		])
		expect(pausedByInterruption(tasks, 'Unassigned')).toEqual([])
	})
})

describe('addTaskLine', () => {
	it('adds an unticked task line after the last task, without a clock', () => {
		const content = [
			'- [ ] Email',
			'      [clock::2026-11-12T09:00:00--2026-11-12T09:30:00]',
			'',
			'Notes below.',
		].join('\n')
		expect(addTaskLine(content, 'Call the bank', ['#admin'])).toBe(
			[
				'- [ ] Email',
				'      [clock::2026-11-12T09:00:00--2026-11-12T09:30:00]',
				'- [ ] Call the bank #admin',
				'',
				'Notes below.',
			].join('\n')
		)
	})

	it('leaves the note as it is when the task is already there', () => {
		const content = '- [ ] Email\n'
		expect(addTaskLine(content, 'Email', [])).toBe(content)
	})
})

describe('describeCompletion', () => {
	it('says what will be closed, ticked and deleted', () => {
		const plan = planCompletion(
			new TaskNote(
				[
					'- [ ] Chores',
					'      [clock::2026-11-12T10:42:00]',
					'- [ ] Email',
					'      [clock::2026-11-12T09:00:00--2026-11-12T09:30:00]',
					'- [ ] Run',
				].join('\n')
			)
		)
		expect(describeCompletion(plan)).toEqual([
			'1 running clock will be closed.',
			'2 tasks will be ticked.',
			'These tasks were never clocked and will be deleted:',
		])
	})
})
