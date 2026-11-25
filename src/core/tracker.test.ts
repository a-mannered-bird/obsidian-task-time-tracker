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
	holdAlt,
	keepFlip,
	pressBarButton,
	releaseFlip,
	rowStart,
	dayButtons,
	findDuplicateTask,
	removeTaskLine,
	rowActions,
	startActions,
	trackerLayout,
	type BarMode,
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

describe('findDuplicateTask', () => {
	it('returns the second line bearing a name already listed', () => {
		const duplicate = findDuplicateTask(
			parseTasks([
				'- [ ] Write blog post #writing',
				'- [ ] Chores',
				'- [x] Write blog post',
				'      [clock::2026-11-12T09:00:00--2026-11-12T10:00:00]',
			])
		)
		expect(duplicate).toMatchObject({ name: 'Write blog post', lineIndex: 2 })
	})

	it('tells names apart by case', () => {
		const duplicate = findDuplicateTask(
			parseTasks(['- [ ] Chores', '- [ ] chores'])
		)
		expect(duplicate).toBeNull()
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

describe('bar mode', () => {
	const idle = startActions([])
	const busy = startActions(
		parseTasks(['- [ ] Chores', '  [clock::2026-11-12T10:42:00]'])
	)
	const switching: BarMode = { start: 'primary', planning: false, flip: 'off' }
	const alongside: BarMode = {
		start: 'alongside',
		planning: false,
		flip: 'off',
	}
	const planning: BarMode = { start: 'alongside', planning: true, flip: 'off' }

	it('starts alongside once chosen, while something runs', () => {
		expect(barAction(alongside, busy)).toBe('alongside')
		expect(barAction(switching, busy)).toBe('switch')
	})

	it('starts alongside again once something runs after nothing did', () => {
		expect(barAction(alongside, idle)).toBe('start')
		// Start, the only way of starting while nothing runs, keeps the choice.
		const started = pressBarButton(alongside, 'primary', idle)
		expect(barAction(started, busy)).toBe('alongside')
	})

	it('switches once Switch is pressed while something runs', () => {
		const pressed = pressBarButton(alongside, 'primary', busy)
		expect(barAction(pressed, busy)).toBe('switch')
		expect(barAction(pressed, idle)).toBe('start')
	})

	it('comes back from planning to the way of starting chosen before', () => {
		expect(barAction(planning, busy)).toBe('plan')
		expect(barAction(planning, idle)).toBe('plan')
		const back = pressBarButton(planning, 'primary', idle)
		expect(barAction(back, busy)).toBe('alongside')
	})

	it('leads the rows like the bar, planning included', () => {
		expect(rowStart(alongside, busy)).toBe('alongside')
		expect(rowStart(alongside, idle)).toBe('start')
		expect(rowStart(planning, busy)).toBe('alongside')
		expect(rowStart({ ...switching, planning: true }, busy)).toBe('switch')
	})

	it('swaps switching and toggling while Alt is held', () => {
		const held = holdAlt(switching, true, busy)
		expect(barAction(held, busy)).toBe('alongside')
		expect(rowStart(held, busy)).toBe('alongside')
		expect(barAction(holdAlt(alongside, true, busy), busy)).toBe('switch')
		expect(barAction(holdAlt(held, false, busy), busy)).toBe('switch')
	})

	it('keeps the swap once the field is clicked, until it loses the focus', () => {
		const kept = keepFlip(holdAlt(switching, true, busy))
		expect(barAction(holdAlt(kept, false, busy), busy)).toBe('alongside')
		expect(barAction(releaseFlip(kept), busy)).toBe('switch')
	})

	it('keeps nothing when the field is clicked without Alt', () => {
		expect(barAction(releaseFlip(keepFlip(switching)), busy)).toBe('switch')
	})

	it('swaps nothing while planning or while nothing runs', () => {
		expect(barAction(holdAlt(planning, true, busy), busy)).toBe('plan')
		expect(barAction(holdAlt(switching, true, idle), busy)).toBe('switch')
	})

	it('ends the swap when a button is pressed', () => {
		const kept = keepFlip(holdAlt(switching, true, busy))
		expect(barAction(pressBarButton(kept, 'primary', busy), busy)).toBe(
			'switch'
		)
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
	const content = [
		'- [ ] Email',
		'      [goal::<30m]',
		'      [clock::2026-11-12T09:00:00--2026-11-12T09:30:00]',
		'',
		'Notes below.',
	].join('\n')

	it('adds an unticked task line after the last task, without a clock', () => {
		expect(addTaskLine(content, 'Call the bank', ['#admin'])).toBe(
			[
				'- [ ] Email',
				'      [goal::<30m]',
				'      [clock::2026-11-12T09:00:00--2026-11-12T09:30:00]',
				'- [ ] Call the bank #admin',
				'',
				'Notes below.',
			].join('\n')
		)
	})

	it('gives the line the targets of the goals carried over', () => {
		const [earlier] = parseTasks(['- [ ] Anki', '  [goal::cards 140/200]'])
		expect(
			addTaskLine(content, 'Anki', [], earlier!.goals).split('\n').slice(3, 5)
		).toEqual(['- [ ] Anki', '      [goal::cards /200]'])
	})

	it('leaves the note as it is when the task is already there', () => {
		const [earlier] = parseTasks(['- [ ] Email', '  [goal::1h]'])
		expect(addTaskLine(content, 'Email', [], earlier!.goals)).toBe(content)
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
					'- [ ] Anki',
					'      [goal::cards /200]',
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
		rowActions(tasks.find((task) => task.name === name)!, tasks, 'switch')

	it('offers to stop at the last task end only when it is after the start', () => {
		// Write blog post ended at 10:00: after Chores started, before Email.
		expect(actionsOf('Chores')[0]).toBe('stop-from-last-end')
		expect(actionsOf('Email')).toEqual([
			'change-start',
			'set-stop',
			'migrate-clock',
			'show-task',
			'show-clock',
			'show-in-manager',
			'delete-clock',
			'delete-task',
		])
	})

	it('offers clock actions on idle rows only when they have a clock', () => {
		expect(actionsOf('Write blog post')).toContain('delete-last-clock')
		expect(actionsOf('Plan trip')).toEqual([
			'start-alongside',
			'start-from-last-end',
			'move-up',
			'move-down',
			'move-to-bottom',
			'move-to-top',
			'show-task',
			'show-in-manager',
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
		expect(rowActions(fresh[0]!, fresh, 'start')[0]).toBe('show-task')
	})

	it('offers the way of starting that the row buttons do not', () => {
		const planTrip = tasks.find((task) => task.name === 'Plan trip')!
		expect(rowActions(planTrip, tasks, 'alongside')[0]).toBe('switch-to')
		expect(rowActions(planTrip, tasks, 'start')[0]).toBe('start-from-last-end')
	})
})

describe('moveTaskLine', () => {
	const content = [
		'- [ ] Write blog post',
		'      [goal::1h]',
		'      [clock::2026-11-12T09:00:00--2026-11-12T10:00:00]',
		'- [x] Breakfast',
		'- [ ] Chores',
		'      [clock::2026-11-12T10:42:00]',
		'Some notes',
		'- [ ] Email',
		'      [goal::<30m]',
		'- [ ] Plan trip',
	].join('\n')

	it('moves a block above the previous task of its section', () => {
		// Breakfast (Done) and Chores (running) are not in the plan: Email
		// goes right above Write blog post.
		expect(moveTaskLine(content, 'Email', 'up')?.split('\n')).toEqual([
			'- [ ] Email',
			'      [goal::<30m]',
			'- [ ] Write blog post',
			'      [goal::1h]',
			'      [clock::2026-11-12T09:00:00--2026-11-12T10:00:00]',
			'- [x] Breakfast',
			'- [ ] Chores',
			'      [clock::2026-11-12T10:42:00]',
			'Some notes',
			'- [ ] Plan trip',
		])
	})

	it('moves a block with its goals and clocks to the bottom, leaving other lines', () => {
		expect(
			moveTaskLine(content, 'Write blog post', 'bottom')?.split('\n')
		).toEqual([
			'- [x] Breakfast',
			'- [ ] Chores',
			'      [clock::2026-11-12T10:42:00]',
			'Some notes',
			'- [ ] Email',
			'      [goal::<30m]',
			'- [ ] Plan trip',
			'- [ ] Write blog post',
			'      [goal::1h]',
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
			'      [goal::1h]',
			'      [clock::2026-11-12T09:00:00--2026-11-12T10:00:00]',
			'- [x] Breakfast',
			'- [ ] Chores',
			'      [clock::2026-11-12T10:42:00]',
			'Some notes',
			'- [ ] Plan trip',
			'- [ ] Email',
			'      [goal::<30m]',
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
	it('removes the task line with its goals and clocks only', () => {
		const content = [
			'- [ ] Write blog post',
			'      [goal::1h]',
			'      [clock::2026-11-12T09:00:00--2026-11-12T10:00:00]',
			'      [clock::2026-11-12T11:00:00--2026-11-12T11:30:00]',
			'Some notes',
		].join('\n')
		expect(removeTaskLine(content, 'Write blog post')).toBe('Some notes')
		expect(removeTaskLine(content, 'Email')).toBeNull()
	})
})

describe('dayButtons', () => {
	const dayStart = new Date(2026, 10, 12, 8, 0)

	it('offers both once the day started and a task runs', () => {
		const tasks = parseTasks([
			'- [ ] Chores',
			'      [clock::2026-11-12T10:42:00]',
		])
		expect(dayButtons(tasks, dayStart)).toEqual({
			interruption: null,
			endDay: null,
		})
	})

	it('has nothing to interrupt while no task runs', () => {
		const tasks = parseTasks([
			'- [ ] Chores',
			'      [clock::2026-11-12T10:00:00--2026-11-12T10:42:00]',
		])
		expect(dayButtons(tasks, dayStart)).toEqual({
			interruption: 'Nothing to interrupt: start a task first',
			endDay: null,
		})
	})

	it('cannot end a day without a start or a task', () => {
		expect(dayButtons(parseTasks(['- [ ] Chores']), null).endDay).toBe(
			'The day has not started: set its start first'
		)
		expect(dayButtons([], dayStart).endDay).toBe(
			'The day has not started: add a task first'
		)
		expect(dayButtons([], null).endDay).toBe(
			'The day has not started: set its start and add a task first'
		)
	})
})
