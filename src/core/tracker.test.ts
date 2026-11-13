import { describe, expect, it } from 'vitest'
import { planCompletion } from './complete'
import { TaskNote } from './note'
import { parseTasks } from './parser'
import {
	addTaskLine,
	describeCompletion,
	dropMove,
	dropSlot,
	moveTaskLine,
	pausedByInterruption,
	barAction,
	removeTaskLine,
	rowActions,
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
			])
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
			])
		)
		expect(layout.doneUnfolded).toBe(true)
	})

	it('keeps the done tasks folded while a task runs', () => {
		const layout = trackerLayout(
			parseTasks([
				'- [x] Breakfast',
				'- [ ] Chores',
				'      [clock::2026-11-12T10:42:00]',
			])
		)
		expect(layout.doneUnfolded).toBe(false)
	})

	it('keeps a ticked task that still runs among the running ones', () => {
		const layout = trackerLayout(
			parseTasks(['- [x] Chores', '      [clock::2026-11-12T10:42:00]'])
		)
		expect(names(layout.running)).toEqual(['Chores'])
		expect(layout.done).toEqual([])
	})

	it('lists the interruption task only while it runs', () => {
		const idle = trackerLayout(
			parseTasks([
				'- [ ] Email',
				'- [ ] Interruption',
				'      [clock::2026-11-12T10:00:00--2026-11-12T10:05:00]',
				'- [x] Phone call',
				'      [clock::2026-11-12T11:02:00--2026-11-12T11:10:00]',
			])
		)
		expect(names(idle.open)).toEqual(['Email'])
		expect(names(idle.done)).toEqual(['Phone call'])

		const running = trackerLayout(
			parseTasks([
				'- [ ] Email',
				'- [ ] Interruption',
				'      [clock::2026-11-12T11:02:00]',
			])
		)
		expect(names(running.running)).toEqual(['Interruption'])
		expect(names(running.open)).toEqual(['Email'])
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

describe('barAction', () => {
	const idle = startActions([])
	const busy = startActions(
		parseTasks(['- [ ] Chores', '  [clock::2026-11-12T10:42:00]'])
	)

	it('starts alongside once chosen, while something runs', () => {
		expect(barAction('alongside', busy)).toBe('alongside')
		expect(barAction('primary', busy)).toBe('switch')
	})

	it('falls back to a plain start when nothing runs', () => {
		expect(barAction('alongside', idle)).toBe('start')
	})

	it('plans whether or not something runs', () => {
		expect(barAction('plan', idle)).toBe('plan')
		expect(barAction('plan', busy)).toBe('plan')
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
			'- [ ] Interruption',
			'      [clock::2026-11-12T11:02:00]',
		])
		expect(names(pausedByInterruption(tasks))).toEqual([
			'Chores',
			'German podcast',
		])
	})

	it('is empty when no interruption runs', () => {
		const tasks = parseTasks([
			'- [ ] Chores',
			'      [clock::2026-11-12T10:42:00--2026-11-12T11:02:00]',
		])
		expect(pausedByInterruption(tasks)).toEqual([])
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

describe('rowActions', () => {
	const tasks = parseTasks([
		'- [ ] Write blog post',
		'      [clock::2026-11-12T09:00:00--2026-11-12T10:00:00]',
		'- [ ] Chores',
		'      [clock::2026-11-12T09:30:00]',
		'- [ ] Email',
		'      [clock::2026-11-12T10:30:00]',
		'- [ ] Plan trip',
		'- [ ] Call bank',
		'- [x] Breakfast',
	])
	const actionsOf = (name: string) =>
		rowActions(tasks.find((task) => task.name === name)!, tasks)

	it('offers to stop at the last task end only when it is after the start', () => {
		// Write blog post ended at 10:00: after Chores started, before Email.
		expect(actionsOf('Chores')[0]).toBe('stop-from-last-end')
		expect(actionsOf('Email')).toEqual([
			'change-start',
			'set-stop',
			'set-duration',
			'migrate-clock',
			'show-task',
			'show-clock',
			'delete-clock',
			'delete-task',
		])
	})

	it('offers clock actions on idle rows only when they have a clock', () => {
		expect(actionsOf('Write blog post')).toContain('delete-last-clock')
		expect(actionsOf('Plan trip')).toEqual([
			'start-from-last-end',
			'move-up',
			'move-down',
			'move-to-bottom',
			'move-to-top',
			'show-task',
			'delete-task',
		])
	})

	it('moves only within the section, as far as it goes', () => {
		// The plan lists Write blog post, Plan trip, Call bank.
		expect(actionsOf('Write blog post')).not.toContain('move-up')
		expect(actionsOf('Call bank')).not.toContain('move-down')
		expect(actionsOf('Breakfast').filter((a) => a.startsWith('move'))).toEqual(
			[]
		)
	})

	it('does not offer to start from the last task end before any ended', () => {
		const fresh = parseTasks(['- [ ] Email'])
		expect(rowActions(fresh[0]!, fresh)[0]).toBe('show-task')
	})
})

describe('moveTaskLine', () => {
	const content = [
		'- [ ] Write blog post',
		'      [clock::2026-11-12T09:00:00--2026-11-12T10:00:00]',
		'- [x] Breakfast',
		'- [ ] Chores',
		'      [clock::2026-11-12T10:42:00]',
		'Some notes',
		'- [ ] Email',
		'- [ ] Plan trip',
	].join('\n')

	it('moves a block above the previous task of its section', () => {
		// Breakfast (Done) and Chores (running) are not in the plan: Email
		// goes right above Write blog post.
		expect(moveTaskLine(content, 'Email', 'up')?.split('\n')).toEqual([
			'- [ ] Email',
			'- [ ] Write blog post',
			'      [clock::2026-11-12T09:00:00--2026-11-12T10:00:00]',
			'- [x] Breakfast',
			'- [ ] Chores',
			'      [clock::2026-11-12T10:42:00]',
			'Some notes',
			'- [ ] Plan trip',
		])
	})

	it('moves a block with its clocks to the bottom, leaving other lines', () => {
		expect(
			moveTaskLine(content, 'Write blog post', 'bottom')?.split('\n')
		).toEqual([
			'- [x] Breakfast',
			'- [ ] Chores',
			'      [clock::2026-11-12T10:42:00]',
			'Some notes',
			'- [ ] Email',
			'- [ ] Plan trip',
			'- [ ] Write blog post',
			'      [clock::2026-11-12T09:00:00--2026-11-12T10:00:00]',
		])
	})

	it('leaves the note as it is at the edge of the section', () => {
		expect(moveTaskLine(content, 'Plan trip', 'down')).toBe(content)
		expect(moveTaskLine(content, 'Write blog post', 'top')).toBe(content)
	})

	it('moves a block next to the task it was dropped on', () => {
		expect(
			moveTaskLine(content, 'Plan trip', {
				next: 'Email',
				side: 'before',
			})?.split('\n')
		).toEqual([
			'- [ ] Write blog post',
			'      [clock::2026-11-12T09:00:00--2026-11-12T10:00:00]',
			'- [x] Breakfast',
			'- [ ] Chores',
			'      [clock::2026-11-12T10:42:00]',
			'Some notes',
			'- [ ] Plan trip',
			'- [ ] Email',
		])
	})

	it('does not move a task next to one of another section', () => {
		// Breakfast is in Done, Write blog post in the plan.
		expect(
			moveTaskLine(content, 'Write blog post', {
				next: 'Breakfast',
				side: 'after',
			})
		).toBe(content)
	})

	it('tells when the task is gone', () => {
		expect(moveTaskLine(content, 'Read news', 'up')).toBeNull()
	})
})

describe('dropSlot', () => {
	it('counts the rows whose middle is above the pointer', () => {
		const middles = [10, 30, 50]
		expect(dropSlot(middles, 5)).toBe(0)
		expect(dropSlot(middles, 31)).toBe(2)
		expect(dropSlot(middles, 80)).toBe(3)
	})
})

describe('dropMove', () => {
	const names = ['Email', 'Plan trip', 'Write blog post']

	it('drops before the task under the slot', () => {
		expect(dropMove(names, 'Write blog post', 0)).toEqual({
			next: 'Email',
			side: 'before',
		})
		expect(dropMove(names, 'Email', 2)).toEqual({
			next: 'Write blog post',
			side: 'before',
		})
	})

	it('drops after the last task below the list', () => {
		expect(dropMove(names, 'Email', 3)).toEqual({
			next: 'Write blog post',
			side: 'after',
		})
	})

	it('does nothing when the task would land where it is', () => {
		expect(dropMove(names, 'Plan trip', 1)).toBeNull()
		expect(dropMove(names, 'Plan trip', 2)).toBeNull()
	})
})

describe('removeTaskLine', () => {
	it('removes the task line with its clocks only', () => {
		const content = [
			'- [ ] Write blog post',
			'      [clock::2026-11-12T09:00:00--2026-11-12T10:00:00]',
			'      [clock::2026-11-12T11:00:00--2026-11-12T11:30:00]',
			'Some notes',
		].join('\n')
		expect(removeTaskLine(content, 'Write blog post')).toBe('Some notes')
		expect(removeTaskLine(content, 'Email')).toBeNull()
	})
})
