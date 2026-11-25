import type { TFile } from 'obsidian'
import type { Goal, MetricGoal, TagGoal } from 'types/goals'
import type { Task } from 'types/tasks'
import {
	describeGoalDeleted,
	describeGoalRecorded,
	describeGoalSet,
	describeGoalsAdded,
	describeSuggestionsRejected,
	describeSuggestionsReset,
	daySuggestions,
	goalLabel,
	unmetMetricGoals,
	NO_SUGGESTION_TO_ACCEPT,
	NO_SUGGESTION_TO_REJECT,
	NO_SUGGESTION_TO_RESET,
	pruneDismissals,
	restoreDismissals,
	type DaySuggestions,
	TIME_GOAL_EMOJI,
	type GoalSuggestion,
} from 'core/goalCards'
import {
	achievedField,
	findGoal,
	goalKeyId,
	formatGoalNumber,
	metricNameProblem,
	parseTypedNumber,
	parseTypedTarget,
	parseTypedTargetUnit,
	parseTypedTimeTarget,
	removeGoal,
	setGoals,
	stepAchieved,
	stepTypedAchieved,
	updateGoal,
	type GoalKey,
} from 'core/goalEdits'
import { startOfDay } from 'core/dailyNotes'
import { TaskNote } from 'core/note'
import { recordWrites, rewriteNote } from 'core/noteRewrite'
import { NOTICE_ICON } from 'core/noticeText'
import { noteTagGoals, setTagGoals } from 'core/tagGoals'
import { formatLocalDate } from 'core/time'
import type { TaskChoice } from 'core/toggle'
import { pickOption, type PickerOption } from 'ui/OptionSuggestModal'
import { promptText, type PromptCheckbox } from 'ui/TextPromptModal'
import { showNotice } from 'ui/notice'
import { showUndoNotice } from 'ui/undoNotice'
import type TaskTimeTracker from '../main'
import { currentTarget, noteIo, readTaskNote, targetIo } from './target'
import { wrote } from './timelineEdits'
import { pickNoteTask } from './tracking'
import { undoNoteWrite } from './undo'

/** Record the achieved value of a metric goal typed in a card; null clears it. */
export async function setGoalAchieved(
	plugin: TaskTimeTracker,
	file: TFile,
	key: GoalKey,
	typed: string
): Promise<void> {
	const number = parseTypedNumber(typed)
	if ('error' in number) {
		showNotice(`${NOTICE_ICON.warning} ${number.error}.`)
		return
	}
	await editGoal(plugin, file, key, (goal) =>
		goal.kind === 'metric' ? { ...goal, achieved: number.value } : goal
	)
}

/** Set a goal's target typed in a card: `<` in front for at most. */
export async function setGoalTarget(
	plugin: TaskTimeTracker,
	file: TFile,
	key: GoalKey,
	typed: string
): Promise<void> {
	if (key.metric === null) {
		const time = parseTypedTimeTarget(typed)
		if ('error' in time) {
			showNotice(`${NOTICE_ICON.warning} ${time.error}.`)
			return
		}
		await editGoal(plugin, file, key, (goal) =>
			goal.kind === 'time' ? { ...goal, ...time } : goal
		)
		return
	}
	const target = parseTypedTarget(typed)
	if ('error' in target) {
		showNotice(`${NOTICE_ICON.warning} ${target.error}.`)
		return
	}
	await editGoal(plugin, file, key, (goal) =>
		goal.kind === 'metric' ? { ...goal, ...target } : goal
	)
}

/** One step up or down on a metric goal's achieved value. */
export async function stepGoal(
	plugin: TaskTimeTracker,
	file: TFile,
	key: GoalKey,
	direction: 1 | -1
): Promise<void> {
	await editGoal(plugin, file, key, (goal) =>
		goal.kind === 'metric'
			? { ...goal, achieved: stepAchieved(goal, direction) }
			: goal
	)
}

/** Ask for a metric goal's unit, kept as written. */
export async function editGoalUnit(
	plugin: TaskTimeTracker,
	file: TFile,
	key: GoalKey
): Promise<void> {
	if (key.metric === null) return
	const unit = await promptText(plugin.app, {
		title: `Unit of ${key.taskName} · ${key.metric}`,
		label: 'Unit',
		initialValue: key.unit,
		placeholder: 'km, pages, km/h…',
	})
	if (unit === null) return
	await editGoal(plugin, file, key, (goal) =>
		goal.kind === 'metric' ? { ...goal, unit } : goal
	)
}

/** Remove the goal line from this note, with Undo. */
export async function deleteGoal(
	plugin: TaskTimeTracker,
	file: TFile,
	key: GoalKey
): Promise<void> {
	const io = noteIo(plugin, file)
	const recorder = recordWrites(io)
	let deleted: Goal | null = null
	const outcome = await rewriteNote(recorder.io, (content) => {
		const task = new TaskNote(content).findTask(key.taskName)
		deleted = (task && findGoal(task, key)) ?? null
		return removeGoal(content, key)
	})
	const write = recorder.written()
	if (!wrote(outcome) || !write || !deleted) return
	showUndoNotice(
		describeGoalDeleted(key.taskName, deleted),
		undoNoteWrite(io, write)
	)
}

/** Write suggested goals as if typed, targets only. */
export async function addSuggestedGoals(
	plugin: TaskTimeTracker,
	file: TFile,
	suggestions: GoalSuggestion[]
): Promise<void> {
	const io = noteIo(plugin, file)
	const recorder = recordWrites(io)
	const forTasks = suggestions.filter((s) => s.tag === null)
	const tagGoals = suggestions.flatMap((s) =>
		s.tag !== null && s.goal.kind === 'time'
			? [{ tag: s.tag, minutes: s.goal.minutes, atMost: s.goal.atMost }]
			: []
	)
	const outcome = await rewriteNote(recorder.io, (content) => {
		let next = tagGoals.length ? setTagGoals(content, tagGoals) : content
		for (const taskName of new Set(forTasks.map((s) => s.key.taskName))) {
			const goals = forTasks
				.filter((s) => s.key.taskName === taskName)
				.map((s) => s.goal)
			next = setGoals(next, { name: taskName, tags: [], goals: [] }, goals)
		}
		return next
	})
	const write = recorder.written()
	if (!wrote(outcome) || !write) return
	showUndoNotice(
		describeGoalsAdded(suggestions.length),
		undoNoteWrite(io, write)
	)
}

/** Hide suggestions for the note's day; kept a week in the plugin data. */
export async function dismissGoalSuggestions(
	plugin: TaskTimeTracker,
	date: Date,
	keys: GoalKey[]
): Promise<void> {
	const { settings } = plugin
	const day = formatLocalDate(date)
	settings.dismissedGoalSuggestions = pruneDismissals(
		[
			...settings.dismissedGoalSuggestions,
			...keys.map((key) => ({ ...key, day })),
		],
		formatLocalDate(new Date())
	)
	await plugin.saveSettings()
	plugin.notifyGoalDismissals()
}

export async function rejectGoalSuggestions(
	plugin: TaskTimeTracker,
	date: Date,
	suggestions: GoalSuggestion[]
): Promise<void> {
	await dismissGoalSuggestions(
		plugin,
		date,
		suggestions.map((suggestion) => suggestion.key)
	)
	showNotice(describeSuggestionsRejected(suggestions.length))
}

/** Bring back every suggestion rejected for the note's day. */
export async function resetGoalSuggestions(
	plugin: TaskTimeTracker,
	date: Date,
	count: number
): Promise<void> {
	const { settings } = plugin
	settings.dismissedGoalSuggestions = restoreDismissals(
		settings.dismissedGoalSuggestions,
		formatLocalDate(date)
	)
	await plugin.saveSettings()
	plugin.notifyGoalDismissals()
	showNotice(describeSuggestionsReset(count))
}

/**
 * The suggestions of a note's day, from its tasks and tag goals; none until
 * the vault index is built.
 */
export function suggestionsOf(
	plugin: TaskTimeTracker,
	tasks: Task[],
	tagGoals: TagGoal[],
	date: Date
): DaySuggestions {
	const day = startOfDay(date)
	return daySuggestions(
		tasks,
		(name) => plugin.vaultTasks.recentGoals(name, day),
		plugin.settings.dismissedGoalSuggestions,
		formatLocalDate(date),
		{
			note: tagGoals,
			recent: plugin.vaultTasks.recentTagGoals(day)?.goals ?? [],
		}
	)
}

/** The command target's note and its suggestions. */
async function targetSuggestions(plugin: TaskTimeTracker) {
	const { file, date } = currentTarget(plugin)
	const note = file ? await readTaskNote(plugin, file) : null
	await plugin.vaultTasks.ensureBuilt()
	return {
		file,
		date,
		suggestions: suggestionsOf(
			plugin,
			note?.tasks ?? [],
			note ? noteTagGoals(note.toString()) : [],
			date
		),
	}
}

async function acceptSuggestionsCommand(plugin: TaskTimeTracker) {
	const { file, suggestions } = await targetSuggestions(plugin)
	if (!file || suggestions.offered.length === 0) {
		showNotice(NO_SUGGESTION_TO_ACCEPT)
		return
	}
	await addSuggestedGoals(plugin, file, suggestions.offered)
}

async function rejectSuggestionsCommand(plugin: TaskTimeTracker) {
	const { date, suggestions } = await targetSuggestions(plugin)
	if (suggestions.offered.length === 0) {
		showNotice(NO_SUGGESTION_TO_REJECT)
		return
	}
	await rejectGoalSuggestions(plugin, date, suggestions.offered)
}

async function resetSuggestionsCommand(plugin: TaskTimeTracker) {
	const { date, suggestions } = await targetSuggestions(plugin)
	if (suggestions.rejected.length === 0) {
		showNotice(NO_SUGGESTION_TO_RESET)
		return
	}
	await resetGoalSuggestions(plugin, date, suggestions.rejected.length)
}

async function editGoal(
	plugin: TaskTimeTracker,
	file: TFile,
	key: GoalKey,
	update: (goal: Goal) => Goal
): Promise<void> {
	wrote(
		await rewriteNote(noteIo(plugin, file), (content) =>
			updateGoal(content, key, update)
		)
	)
}

/** Whether the goal's streak skips the days without it. */
export function streakSkipsMissingDays(
	plugin: TaskTimeTracker,
	key: GoalKey
): boolean {
	return plugin.settings.streakSkipsMissingDays.some(
		(entry) => goalKeyId(entry) === goalKeyId(key)
	)
}

/** Switch whether the goal's streak skips the days without it. */
export async function toggleStreakSkip(
	plugin: TaskTimeTracker,
	key: GoalKey
): Promise<void> {
	const { settings } = plugin
	settings.streakSkipsMissingDays = streakSkipsMissingDays(plugin, key)
		? settings.streakSkipsMissingDays.filter(
				(entry) => goalKeyId(entry) !== goalKeyId(key)
			)
		: [...settings.streakSkipsMissingDays, key]
	await plugin.saveSettings()
}

/** What the metric picker returns: the time goal, a known metric or a new one. */
type MetricChoice =
	| { kind: 'time' }
	| { kind: 'metric'; metric: string; unit: string | null }

/**
 * Set goal…: pick a task (of the note, another note's, or a new one), a
 * metric (time, a known one, or a new one), then its target, and its unit
 * when the metric is new. A goal of that metric already there gets the new
 * target; a task not in the note yet is added. `choice` skips the task
 * picker (the Goals tab's Add goal card passes none).
 */
export async function setGoalFlow(
	plugin: TaskTimeTracker,
	choice?: TaskChoice
): Promise<void> {
	const target = currentTarget(plugin)
	const note = target.file
		? await readTaskNote(plugin, target.file)
		: new TaskNote('')
	const task =
		choice ??
		(await pickNoteTask(plugin, target.path, note, {
			choices: (version) => version.tasks,
			placeholder: 'Set a goal for which task?',
			includeVault: true,
		}))
	if (!task) return
	const metric = await pickMetric(plugin, task.name)
	if (!metric) return
	const goal = await promptGoal(plugin, task.name, metric)
	if (!goal) return

	const io = targetIo(plugin, target)
	const recorder = recordWrites(io)
	const outcome = await rewriteNote(recorder.io, (content) =>
		setGoals(content, task, [goal])
	)
	const write = recorder.written()
	if (!wrote(outcome) || !write) return
	showUndoNotice(describeGoalSet(task.name, goal), undoNoteWrite(io, write))
}

async function pickMetric(
	plugin: TaskTimeTracker,
	taskName: string
): Promise<MetricChoice | null> {
	await plugin.vaultTasks.ensureBuilt()
	const options: PickerOption<MetricChoice>[] = [
		{
			label: `${TIME_GOAL_EMOJI} Time`,
			note: 'from the clocks',
			value: { kind: 'time' },
		},
		...plugin.vaultTasks.metrics().map(({ metric, unit }) => ({
			label: metric,
			note: unit,
			value: { kind: 'metric' as const, metric, unit },
		})),
	]
	return pickOption(plugin.app, {
		placeholder: `Which goal for ${taskName}? Type a name for a new metric`,
		options,
		create: (query) =>
			metricNameProblem(query)
				? null
				: {
						label: `➕ New metric "${query}"`,
						value: { kind: 'metric', metric: query, unit: null },
					},
	})
}

async function promptGoal(
	plugin: TaskTimeTracker,
	taskName: string,
	metric: MetricChoice
): Promise<Goal | null> {
	const { app } = plugin
	if (metric.kind === 'time') {
		const typed = await promptText(app, {
			title: `Time goal for ${taskName}`,
			description: 'Type a duration. Put < in front for at most, like <30m.',
			label: 'Target',
			placeholder: '1h30m',
			validate: (text) => errorOf(parseTypedTimeTarget(text)),
		})
		const time = typed === null ? null : parseTypedTimeTarget(typed)
		return time && 'minutes' in time ? { kind: 'time', ...time } : null
	}
	if (metric.unit === null) {
		const typed = await promptText(app, {
			title: `${metric.metric} goal for ${taskName}`,
			description:
				'Type the target and its unit. Put < in front for at most, like <3 cups.',
			label: 'Target and unit',
			placeholder: '10 km',
			validate: (text) => errorOf(parseTypedTargetUnit(text)),
		})
		if (typed === null) return null
		const parsed = parseTypedTargetUnit(typed)
		return 'error' in parsed
			? null
			: metricGoal(metric.metric, {
					...parsed,
					decimalComma: typed.includes(','),
				})
	}
	const unit = metric.unit
	const typed = await promptText(app, {
		title: `${metric.metric} goal for ${taskName}`,
		description: [
			unit ? `In ${unit}.` : null,
			'Put < in front for at most, like <80.',
		]
			.filter(Boolean)
			.join(' '),
		label: 'Target',
		placeholder: '10',
		validate: (text) => {
			const parsed = parseTypedTarget(text)
			if ('error' in parsed) return parsed.error
			return parsed.target === null ? 'Type a target, like 10 or <80' : null
		},
	})
	if (typed === null) return null
	const parsed = parseTypedTarget(typed)
	return 'error' in parsed || parsed.target === null
		? null
		: metricGoal(metric.metric, {
				target: parsed.target,
				atMost: parsed.atMost,
				unit,
				decimalComma: typed.includes(','),
			})
}

function metricGoal(
	metric: string,
	values: Pick<MetricGoal, 'target' | 'atMost' | 'unit' | 'decimalComma'>
): MetricGoal {
	return { kind: 'metric', metric, achieved: null, ...values }
}

function errorOf<T extends object>(
	parsed: T | { error: string }
): string | null {
	return 'error' in parsed ? parsed.error : null
}

/**
 * Record goal result…: pick a task of the note with metric goals, the
 * metric when it has several, then the number achieved.
 */
export async function recordGoalResultFlow(
	plugin: TaskTimeTracker
): Promise<void> {
	const { file } = currentTarget(plugin)
	const note = file ? await readTaskNote(plugin, file) : null
	const withMetrics = (note?.tasks ?? []).filter((task) =>
		task.goals.some((goal) => goal.kind === 'metric')
	)
	if (!file || withMetrics.length === 0) {
		showNotice(
			`${NOTICE_ICON.info} No goal to record a result for in this note.`
		)
		return
	}
	const taskName = await pickOption(plugin.app, {
		placeholder: 'Record a result for which task?',
		options: withMetrics.map((task) => ({
			label: task.name,
			value: task.name,
		})),
	})
	const task = withMetrics.find((t) => t.name === taskName)
	if (!task) return
	const metrics = task.goals.filter(
		(goal): goal is MetricGoal & { lineIndex: number } => goal.kind === 'metric'
	)
	const goal =
		metrics.length === 1
			? metrics[0]!
			: await pickOption(plugin.app, {
					placeholder: `Which goal of ${task.name}?`,
					options: metrics.map((m) => ({
						label: goalLabel(m),
						note: m.unit,
						value: m,
					})),
				})
	if (!goal) return
	await recordGoalResult(plugin, file, task.name, goal)
}

const SKIP_END_DAY_RESULTS = "Don't ask for goal results when ending a day"

/**
 * After tasks were ticked, ask for the result of each metric goal they have
 * not reached, one prompt after another; dismissing one skips that goal.
 * When ending the day, each prompt offers to stop asking at the end of a
 * day, which also ends this round.
 */
export async function askUnmetResults(
	plugin: TaskTimeTracker,
	file: TFile,
	taskNames: string[],
	endingDay = false
): Promise<void> {
	const { settings } = plugin
	const note = await readTaskNote(plugin, file)
	const asked = new Set<string>()
	for (const taskName of taskNames) {
		const goals = note.tasks
			.filter((task) => task.name === taskName)
			.flatMap(unmetMetricGoals)
		for (const goal of goals) {
			if (endingDay && !settings.askGoalResultsOnEndDay) return
			if (asked.has(`${taskName}\n${goal.metric}`)) continue
			asked.add(`${taskName}\n${goal.metric}`)
			await recordGoalResult(plugin, file, taskName, goal, {
				checkbox: endingDay
					? {
							label: SKIP_END_DAY_RESULTS,
							checked: false,
							onChange: (skip) => {
								settings.askGoalResultsOnEndDay = !skip
								void plugin.saveSettings()
							},
						}
					: undefined,
			})
		}
	}
}

/** Ask for a metric goal's result and write it, with Undo. */
export async function recordGoalResult(
	plugin: TaskTimeTracker,
	file: TFile,
	taskName: string,
	goal: MetricGoal,
	options: { checkbox?: PromptCheckbox } = {}
): Promise<void> {
	const typed = await promptText(plugin.app, {
		...options,
		title: `${taskName} · ${goal.metric}`,
		description:
			goal.target === null
				? undefined
				: `Target: ${goal.atMost ? 'at most ' : ''}${formatGoalNumber(goal.target, goal.decimalComma)} ${goal.unit}`.trim(),
		label: goal.unit ? `Result (${goal.unit})` : 'Result',
		initialValue: achievedField(goal).value,
		inputType: 'number',
		step: (text, direction) => stepTypedAchieved(goal, text, direction),
		validate: (text) => errorOf(parseTypedNumber(text)),
	})
	if (typed === null) return
	const number = parseTypedNumber(typed)
	if ('error' in number) return
	const key = { taskName, metric: goal.metric, unit: goal.unit }
	const recorded: MetricGoal = { ...goal, achieved: number.value }
	const io = noteIo(plugin, file)
	const recorder = recordWrites(io)
	const outcome = await rewriteNote(recorder.io, (content) =>
		updateGoal(content, key, (current) =>
			current.kind === 'metric'
				? { ...current, achieved: number.value }
				: current
		)
	)
	const write = recorder.written()
	if (!wrote(outcome) || !write) return
	showUndoNotice(
		describeGoalRecorded(taskName, recorded),
		undoNoteWrite(io, write)
	)
}

export function registerGoalCommands(plugin: TaskTimeTracker) {
	plugin.addCommand({
		id: 'set-goal',
		name: 'Set goal…',
		icon: 'target',
		callback: () => void setGoalFlow(plugin),
	})
	plugin.addCommand({
		id: 'record-goal-result',
		name: 'Record goal result…',
		icon: 'list-checks',
		callback: () => void recordGoalResultFlow(plugin),
	})
	plugin.addCommand({
		id: 'accept-goal-suggestions',
		name: 'Accept all goal suggestions',
		icon: 'list-plus',
		callback: () => void acceptSuggestionsCommand(plugin),
	})
	plugin.addCommand({
		id: 'reject-goal-suggestions',
		name: 'Reject all goal suggestions',
		icon: 'x',
		callback: () => void rejectSuggestionsCommand(plugin),
	})
	plugin.addCommand({
		id: 'reset-goal-suggestions',
		name: 'Reset rejected goal suggestions',
		icon: 'rotate-ccw',
		callback: () => void resetSuggestionsCommand(plugin),
	})
}
