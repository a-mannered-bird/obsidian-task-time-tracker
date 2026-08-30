import { describe, expect, it } from 'vitest'
import type { Task } from 'types/tasks'
import { TaskNote } from './note'
import { getLastEndedTasks, toggleTasks, type Prompts } from './toggle'

const now = new Date(2026, 7, 16, 12, 0, 0)
const at = (h: number, m = 0) =>
	`2026-08-16T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`

const content = [
	'- [ ] Write plugin #project',
	'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
	'- [ ] Walk the dog #routine',
	'- [ ] Emails',
	'      [clock::2026-08-16T11:00:00]',
	'- [ ] Unassigned',
].join('\n')

type Script = {
	pick?: (string | null)[]
	minutes?: (number | null)[]
}

/** Prompts answering from a script; records every notice. */
function scripted(script: Script = {}) {
	const picks = [...(script.pick ?? [])]
	const minutes = [...(script.minutes ?? [])]
	const notices: string[] = []
	const offered: string[][] = []
	const vaultFlags: (boolean | undefined)[] = []
	const prompts: Prompts = {
		pickTask: (tasks: Task[], _placeholder, options) => {
			offered.push(tasks.map((t) => t.name))
			vaultFlags.push(options?.includeVault)
			const name = picks.shift() ?? null
			return Promise.resolve(
				name === null ? null : (tasks.find((t) => t.name === name) ?? null)
			)
		},
		promptMinutes: () => Promise.resolve(minutes.shift() ?? null),
		notify: (message) => notices.push(message),
	}
	return { prompts, notices, offered, vaultFlags }
}

async function run(
	options: Parameters<typeof toggleTasks>[1],
	script?: Script
) {
	const note = new TaskNote(content)
	const { prompts, notices, offered, vaultFlags } = scripted(script)
	const changed = await toggleTasks(note, options, {
		prompts,
		unassignedTaskName: 'Unassigned',
		now,
	})
	return {
		changed,
		lines: note.toString().split('\n'),
		notices,
		offered,
		vaultFlags,
		note,
	}
}

describe('toggleTasks', () => {
	it('starts a picked task that is off, and stops a picked task that is on', async () => {
		const on = await run({}, { pick: ['Walk the dog'] })
		expect(on.changed).toBe(true)
		expect(on.lines[3]).toBe(`      [clock::${at(12)}]`)

		const off = await run({}, { pick: ['Emails'] })
		expect(off.lines[4]).toBe(`      [clock::${at(11)}--${at(12)}]`)
		expect(off.notices[0]).toMatch(
			/"Emails" toggled off at 12:00:00 \(60 \/ 60m\)/
		)
	})

	it('does nothing when the picker is dismissed', async () => {
		const result = await run({}, { pick: [null] })
		expect(result.changed).toBe(false)
		expect(result.lines.join('\n')).toBe(content)
	})

	it('ticks the toggled task', async () => {
		const result = await run({ tick: true }, { pick: ['Walk the dog'] })
		expect(result.lines[2]).toBe('- [x] Walk the dog #routine')
	})

	it('time travel toggles in the past, from last task toggles at the last end', async () => {
		const past = await run(
			{ timeTravel: true },
			{ pick: ['Walk the dog'], minutes: [15] }
		)
		expect(past.lines[3]).toBe(`      [clock::${at(11, 45)}]`)

		const fromLast = await run(
			{ fromLastTask: true },
			{ pick: ['Walk the dog'] }
		)
		expect(fromLast.lines[3]).toBe(`      [clock::${at(10)}]`)
	})

	it('switch closes running tasks, offers only off tasks, and ticks only the closed ones', async () => {
		const result = await run(
			{ switch: true, tick: true },
			{ pick: ['Walk the dog'] }
		)
		expect(result.offered[0]).toEqual([
			'Write plugin',
			'Walk the dog',
			'Unassigned',
		])
		expect(result.lines).toEqual([
			'- [ ] Write plugin #project',
			'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
			'- [ ] Walk the dog #routine',
			`      [clock::${at(12)}]`,
			'- [x] Emails',
			`      [clock::${at(11)}--${at(12)}]`,
			'- [ ] Unassigned',
		])
	})

	it('switches to a preset task and keeps it running if it already is', async () => {
		const result = await run({ switch: true, taskName: 'Emails' })
		expect(result.changed).toBe(false)
		expect(result.notices).toEqual(['"Emails" is already running.'])
	})

	it('switch to previous restarts the last ended task(s) and closes the running ones', async () => {
		const result = await run({ switch: true, previous: true })
		expect(result.lines[2]).toBe(`      [clock::${at(12)}]`)
		expect(result.lines[5]).toBe(`      [clock::${at(11)}--${at(12)}]`)
	})

	it('targetState only acts when the state differs', async () => {
		const noop = await run({ taskName: 'Emails', targetState: 'on' })
		expect(noop.changed).toBe(false)
		expect(noop.notices).toEqual(['"Emails" is already on.'])

		const act = await run({ taskName: 'Emails', targetState: 'off' })
		expect(act.changed).toBe(true)
	})

	it('reports a missing preset task', async () => {
		const result = await run({ taskName: 'Nope' })
		expect(result.changed).toBe(false)
		expect(result.notices).toEqual(['Couldn\'t find "Nope".'])
	})

	it('sets the duration of a running task from its start', async () => {
		const result = await run(
			{ setDuration: true },
			{ pick: ['Emails'], minutes: [25] }
		)
		expect(result.offered[0]).toEqual(['Emails'])
		expect(result.lines[4]).toBe(`      [clock::${at(11)}--${at(11, 25)}]`)
	})

	it('migrates the running clock to another task', async () => {
		const result = await run({ migrate: true }, { pick: ['Write plugin'] })
		expect(result.offered[0]).toEqual([
			'Write plugin',
			'Walk the dog',
			'Unassigned',
		])
		expect(result.lines.slice(0, 5)).toEqual([
			'- [ ] Write plugin #project',
			'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
			`      [clock::${at(11)}]`,
			'- [ ] Walk the dog #routine',
			'- [ ] Emails',
		])
	})

	it('quick interruption starts Unassigned, then ends it, returns to previous and reassigns', async () => {
		// Start: Unassigned is off, Emails is running → switch to Unassigned.
		const start = await run({ interruption: true, switch: true })
		expect(start.lines[4]).toBe(`      [clock::${at(11)}--${at(12)}]`)
		expect(start.lines[6]).toBe(`      [clock::${at(12)}]`)

		// End: Unassigned is running → back to Emails, interruption was the dog walk.
		const note = new TaskNote(start.lines.join('\n'))
		const later = new Date(2026, 7, 16, 12, 10, 0)
		const { prompts, offered } = scripted({ pick: ['Walk the dog'] })
		await toggleTasks(
			note,
			{ interruption: true, switch: true },
			{ prompts, unassignedTaskName: 'Unassigned', now: later }
		)
		expect(offered[0]).toEqual(['Write plugin', 'Walk the dog'])
		expect(note.toString().split('\n')).toEqual([
			'- [ ] Write plugin #project',
			'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
			'- [ ] Walk the dog #routine',
			`      [clock::${at(12)}--${at(12, 10)}]`,
			'- [ ] Emails',
			`      [clock::${at(11)}--${at(12)}]`,
			`      [clock::${at(12, 10)}]`,
			'- [ ] Unassigned',
		])
	})
})

describe('getLastEndedTasks', () => {
	it('returns the stopped tasks sharing the latest end, ignoring running ones', () => {
		const note = new TaskNote(
			[
				'- [ ] A',
				'      [clock::2026-08-16T09:00:00--2026-08-16T10:00:00]',
				'- [ ] B',
				'      [clock::2026-08-16T08:00:00--2026-08-16T10:00:00]',
				'- [ ] C',
				'      [clock::2026-08-16T10:30:00]',
			].join('\n')
		)
		expect(getLastEndedTasks(note.tasks).map((t) => t.name)).toEqual(['A', 'B'])
	})
})

describe('vault-wide picking', () => {
	it('asks for vault tasks in pickers, except over running tasks', async () => {
		const toggle = await run({}, { pick: [null] })
		expect(toggle.vaultFlags).toEqual([true])
		const migrate = await run({ migrate: true }, { pick: [null] })
		expect(migrate.vaultFlags).toEqual([true])
		const duration = await run({ setDuration: true }, { pick: [null] })
		expect(duration.vaultFlags).toEqual([false])
	})

	it('still opens the picker on an empty note when vault tasks are available', async () => {
		const note = new TaskNote('')
		const { prompts, notices, offered } = scripted({ pick: [null] })
		const changed = await toggleTasks(
			note,
			{},
			{
				prompts,
				unassignedTaskName: 'Unassigned',
				vaultTasksAvailable: true,
				now,
			}
		)
		expect(changed).toBe(false)
		expect(offered).toEqual([[]])
		expect(notices).toEqual([])
	})

	it('notifies instead of opening an empty picker without vault tasks', async () => {
		const note = new TaskNote('')
		const { prompts, notices, offered } = scripted()
		const changed = await toggleTasks(
			note,
			{},
			{
				prompts,
				unassignedTaskName: 'Unassigned',
				now,
			}
		)
		expect(changed).toBe(false)
		expect(offered).toEqual([])
		expect(notices).toEqual(['No tasks found.'])
	})
})
