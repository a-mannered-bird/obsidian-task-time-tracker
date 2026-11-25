import type { Goal, GoalLine, MetricGoal } from 'types/goals'
import type { Task } from 'types/tasks'
import { formatGoalMinutes, parseGoalDuration } from './goals'
import { TaskNote } from './note'

/**
 * A goal found again by content rather than by line index: the task, and
 * the metric with its unit (null metric for the time goal). Two lines with
 * the same key are a unit-drift or duplicate case; the first one is meant.
 */
export type GoalKey = { taskName: string; metric: string | null; unit: string }

export function goalKey(taskName: string, goal: Goal): GoalKey {
	return goal.kind === 'time'
		? { taskName, metric: null, unit: '' }
		: { taskName, metric: goal.metric, unit: goal.unit }
}

/** A stable string for a key, e.g. for keyed lists and dismissals. */
export function goalKeyId(key: GoalKey): string {
	return JSON.stringify([key.taskName, key.metric, key.unit])
}

export function hasGoalKey(keys: GoalKey[], key: GoalKey): boolean {
	const id = goalKeyId(key)
	return keys.some((entry) => goalKeyId(entry) === id)
}

/** The keys with this one added, or removed when it was there. */
export function toggleGoalKey(keys: GoalKey[], key: GoalKey): GoalKey[] {
	const id = goalKeyId(key)
	return hasGoalKey(keys, key)
		? keys.filter((entry) => goalKeyId(entry) !== id)
		: [...keys, key]
}

function sameGoal(goal: Goal, key: Omit<GoalKey, 'taskName'>): boolean {
	return goal.kind === 'time'
		? key.metric === null
		: goal.metric === key.metric && goal.unit === key.unit
}

/** The goal line of the task with this key, if any. */
export function findGoal(task: Task, key: GoalKey): GoalLine | undefined {
	return task.goals.find((goal) => sameGoal(goal, key))
}

/** The note with the goal changed by `update`; null when it is gone. */
export function updateGoal(
	content: string,
	key: GoalKey,
	update: (goal: Goal) => Goal
): string | null {
	const note = new TaskNote(content)
	const task = note.findTask(key.taskName)
	const line = task ? findGoal(task, key) : undefined
	if (!line) return null
	note.setGoal(line.lineIndex, update(line))
	return note.toString()
}

/** The note without the goal line; null when it is gone. */
export function removeGoal(content: string, key: GoalKey): string | null {
	const note = new TaskNote(content)
	const task = note.findTask(key.taskName)
	const line = task ? findGoal(task, key) : undefined
	if (!line) return null
	note.removeGoal(line.lineIndex)
	return note.toString()
}

/** A task to give goals: found by name, or added like a picked one. */
export type GoalTarget = { name: string; tags: string[]; goals: Goal[] }

/**
 * The note with the goals set on the task: a goal with the key of one the
 * task has replaces its target and keeps what was achieved; others are
 * added below its goal lines. A missing task line is added first, with the
 * targets carried over from its latest day.
 */
export function setGoals(
	content: string,
	target: GoalTarget,
	goals: Goal[]
): string {
	const note = new TaskNote(content)
	if (!note.findTask(target.name)) {
		note.insertTask(target.name, target.tags, target.goals)
	}
	for (const goal of goals) {
		const task = note.findTask(target.name)!
		const existing = findGoal(task, goalKey(task.name, goal))
		if (existing) note.setGoal(existing.lineIndex, withTargetOf(existing, goal))
		else note.addGoal(task, goal)
	}
	return note.toString()
}

function withTargetOf(existing: Goal, goal: Goal): Goal {
	if (existing.kind === 'metric' && goal.kind === 'metric') {
		return { ...goal, achieved: existing.achieved }
	}
	return goal
}

const NUMBER = /^\d+(?:[.,]\d+)?$/

/** A typed number (`.` or `,` decimal), null for an empty field. */
export type TypedNumber = { value: number | null } | { error: string }

export function parseTypedNumber(text: string): TypedNumber {
	const trimmed = text.trim()
	if (trimmed === '') return { value: null }
	if (!NUMBER.test(trimmed)) return { error: 'Type a number, like 8 or 5.2' }
	return { value: Number(trimmed.replace(',', '.')) }
}

/**
 * A value typed over a goal's: a number to set (null clears it), or a
 * `+n` / `-n` to add to the value the note holds when it is written.
 */
export type TypedChange = { set: number | null } | { add: number }

const RELATIVE = /^([+-])\s*(.*)$/

/** A typed number, or `+n` / `-n` added to the current one. */
export function parseTypedChange(
	text: string
): TypedChange | { error: string } {
	const relative = RELATIVE.exec(text.trim())
	if (!relative) {
		const number = parseTypedNumber(text)
		return 'error' in number ? number : { set: number.value }
	}
	const number = parseTypedNumber(relative[2]!)
	if ('error' in number || number.value === null) {
		return { error: 'Type a number after + or -, like +2' }
	}
	return { add: relative[1] === '-' ? -number.value : number.value }
}

/**
 * The value after the change, never below `floor`; a sum keeps the finest
 * decimal of its terms (no 0.30000000000000004).
 */
export function applyChange(
	current: number | null,
	change: TypedChange,
	floor = 0
): number | null {
	if ('set' in change) return change.set
	const decimals = Math.max(
		...[current ?? 0, change.add].map(
			(value) => String(value).split('.')[1]?.length ?? 0
		)
	)
	const sum = Math.max(floor, (current ?? 0) + change.add)
	return Number(sum.toFixed(decimals))
}

/** A typed target: `<` in front for at most; empty clears it. */
export type TypedTarget =
	| { target: number | null; atMost: boolean }
	| { error: string }

export function parseTypedTarget(text: string): TypedTarget {
	const edit = parseTypedTargetEdit(text)
	if ('error' in edit) return edit
	if ('add' in edit.change) return { error: 'Type a target, like 10 or <80' }
	return { target: edit.change.set, atMost: edit.atMost }
}

/** A target typed over a goal's: `<` in front for at most, then a change. */
export type TypedTargetEdit =
	| { change: TypedChange; atMost: boolean }
	| { error: string }

export function parseTypedTargetEdit(text: string): TypedTargetEdit {
	const trimmed = text.trim()
	const atMost = trimmed.startsWith('<')
	const body = atMost ? trimmed.slice(1).trim() : trimmed
	const change = parseTypedChange(body)
	if ('error' in change) {
		return RELATIVE.test(body)
			? change
			: { error: 'Type a target, like 10 or <80' }
	}
	if (atMost && 'set' in change && change.set === null) {
		return { error: 'Type a target after <, like <80' }
	}
	return { change, atMost }
}

/**
 * A typed time target: a duration (`1h30m`, `<30m`), or a bare number
 * of minutes as every time prompt takes it.
 */
export type TypedTimeTarget =
	| { minutes: number; atMost: boolean }
	| { error: string }

export function parseTypedTimeTarget(text: string): TypedTimeTarget {
	const trimmed = text.trim()
	const duration = parseGoalDuration(trimmed)
	if (duration && duration.minutes > 0) return duration
	const atMost = trimmed.startsWith('<')
	const minutes = parseTypedNumber(atMost ? trimmed.slice(1) : trimmed)
	if ('value' in minutes && minutes.value) {
		return { minutes: Math.round(minutes.value), atMost }
	}
	return { error: 'Type a time, like 1h30m, 45m or <30m' }
}

/**
 * A time target typed over a goal's: a target as parseTypedTimeTarget
 * reads it, or `+30m` / `-1h` (minutes when bare) added to it. A change
 * typed without `<` keeps the goal's at most (null): the `<` the field
 * showed was typed over.
 */
export type TypedTimeTargetEdit =
	| { change: TypedChange; atMost: boolean | null }
	| { error: string }

export function parseTypedTimeTargetEdit(text: string): TypedTimeTargetEdit {
	const trimmed = text.trim()
	const atMost = trimmed.startsWith('<')
	const relative = RELATIVE.exec(atMost ? trimmed.slice(1).trim() : trimmed)
	if (!relative) {
		const time = parseTypedTimeTarget(trimmed)
		if ('error' in time) return time
		return { change: { set: time.minutes }, atMost: time.atMost }
	}
	const time = parseTypedTimeTarget(relative[2]!)
	if ('error' in time || time.atMost) {
		return { error: 'Type a time after + or -, like +30m' }
	}
	const add = relative[1] === '-' ? -time.minutes : time.minutes
	return { change: { add }, atMost: atMost || null }
}

/** A time goal's or tag goal's target after the edit: never under a minute. */
export function timeTargetAfter(
	current: { minutes: number; atMost: boolean },
	edit: { change: TypedChange; atMost: boolean | null }
): { minutes: number; atMost: boolean } {
	return {
		minutes: applyChange(current.minutes, edit.change, 1) ?? current.minutes,
		atMost: edit.atMost ?? current.atMost,
	}
}

/** A new metric's target and unit typed together: `10 km`, `<3 cups`. */
export type TypedTargetUnit =
	| { target: number; atMost: boolean; unit: string }
	| { error: string }

export function parseTypedTargetUnit(text: string): TypedTargetUnit {
	const match = /^(<)?\s*(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(text.trim())
	if (!match || /^[\d/<]/.test(match[3]!)) {
		return { error: 'Type a target and a unit, like 10 km or <3 cups' }
	}
	return {
		target: Number(match[2]!.replace(',', '.')),
		atMost: Boolean(match[1]),
		unit: match[3]!.trim(),
	}
}

/** Why a typed metric name cannot be written in a goal line; null when fine. */
export function metricNameProblem(name: string): string | null {
	const trimmed = name.trim()
	if (trimmed === '') return 'Type a name, like distance'
	if (/[:[\]/<]/.test(trimmed)) return 'A name cannot hold :, /, < or brackets'
	return null
}

/** The step of the − / + buttons: 1, or the finest decimal the goal shows. */
export function goalStep(goal: MetricGoal): number {
	const decimals = Math.max(
		...[goal.achieved, goal.target].map(
			(value) => String(value ?? 0).split('.')[1]?.length ?? 0
		)
	)
	return Number((10 ** -decimals).toFixed(decimals))
}

/** The achieved value one step up or down, never below zero. */
export function stepAchieved(goal: MetricGoal, direction: 1 | -1): number {
	const step = goalStep(goal)
	const decimals = String(step).split('.')[1]?.length ?? 0
	const next = Math.max(0, (goal.achieved ?? 0) + direction * step)
	return Number(next.toFixed(decimals))
}

/**
 * A typed result or target one step up or down, the goal's step following
 * the decimals typed, never below zero; `+n` / `-n` is applied to the
 * recorded value first, and an unreadable value steps from the recorded
 * one. A decimal comma typed stays a comma.
 */
export function stepTypedValue(
	goal: MetricGoal,
	field: 'achieved' | 'target',
	typed: string,
	direction: 1 | -1
): string {
	const parsed = parseTypedChange(typed)
	const value =
		'error' in parsed ? goal[field] : applyChange(goal[field], parsed)
	const step = goalStep({ ...goal, [field]: value })
	const decimals = String(step).split('.')[1]?.length ?? 0
	const next = Math.max(0, (value ?? 0) + direction * step)
	return formatGoalNumber(Number(next.toFixed(decimals)), typed.includes(','))
}

/** A number as a goal's field shows it, with its decimal separator. */
export function formatGoalNumber(
	value: number | null,
	decimalComma: boolean
): string {
	if (value === null) return ''
	const text = String(value)
	return decimalComma ? text.replace('.', ',') : text
}

/**
 * A card field: a number input for a metric's result or target, with the
 * at-most `<` shown in front of it rather than typed (number inputs only
 * take digits and `.`); a text input for a time target (`1h30m`, `<30m`).
 */
export type GoalField =
	| { type: 'number'; value: string; atMost: boolean }
	| { type: 'text'; value: string }

/** A result field: 0 until a result is recorded. */
export function achievedField(goal: MetricGoal): GoalField {
	return { type: 'number', value: String(goal.achieved ?? 0), atMost: false }
}

export function targetField(goal: Goal): GoalField {
	if (goal.kind === 'time') {
		return { type: 'text', value: formatTargetField(goal) }
	}
	return {
		type: 'number',
		value: goal.target === null ? '' : String(goal.target),
		atMost: goal.atMost,
	}
}

/** What a field's value means when typed, `<` put back for at most. */
export function typedFieldValue(field: GoalField, value: string): string {
	const trimmed = value.trim()
	return field.type === 'number' && field.atMost && trimmed !== ''
		? `<${trimmed}`
		: trimmed
}

/** A target as its field shows it: `10`, `<80`, `1h30m`, `<30m`. */
export function formatTargetField(goal: Goal): string {
	if (goal.kind === 'time') {
		return `${goal.atMost ? '<' : ''}${formatGoalMinutes(goal.minutes)}`
	}
	if (goal.target === null) return ''
	return `${goal.atMost ? '<' : ''}${formatGoalNumber(goal.target, goal.decimalComma)}`
}
