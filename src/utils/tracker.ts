import type { Interval, TagTimes, Task } from 'types/tasks'

export const boldTags = [
	'#project',
	'#languages',
	'#trackers',
	'#sport',
	'#selfDev',
	'#learn',
] // Whatever is an investment in myself
export const italicTags = ['#chores', '#routine']
export const underlineTags = ['#project'] // Whatever is a big project

// FIXME: Remove every typescript !

// TODO: Refactor this function
// function initProjectTracking(datas, projectPage) {
// 	const workDays = datas
// 		.map((data) => {
// 			return {
// 				file: data.file,
// 				// Keep only project tasks
// 				tasks: parseTasks(data.content).filter(
// 					(task) => task.name === projectPage.project_name
// 				),
// 			}
// 		})
// 		// filter out days where the project was not worked on
// 		.filter((data) => {
// 			return data.tasks.length > 0
// 		})

// 	const allWorkSessions = workDays.map((day) => day.tasks).flat()
// 	const totalWorkedMinutes = calculateTasksTotalTime(allWorkSessions)

// 	// Get objective
// 	const projectStart = new Date(projectPage.project_start.ts)
// 	const today = new Date()
// 	const totalWorkDays =
// 		getNumberOfWorkDays(projectStart, today, projectPage.project_days) -
// 		projectPage.project_holidays
// 	const totalWorkMinutes = totalWorkDays * projectPage.project_time_per_day
// 	const workBalance = totalWorkedMinutes - totalWorkMinutes

// Display results
// displayItem(`📆  Total days due: `, `${totalWorkDays} days`)
// displayItem(`🎯  Time objective: `, formatTime(totalWorkMinutes))
// displayItem(
// 	`💪  Total time worked: `,
// 	formatTime(totalWorkedMinutes, totalWorkMinutes)
// )
// displayItem(`⚖️  Work balance: `, formatTime(workBalance))
// }

/**
 * Get number of workdays between two dates (including those dates)
 */
function getNumberOfWorkDays(
	startDate: string,
	endDate: string,
	workdays = [1, 2, 3, 4, 5]
) {
	// Ensure we’re working with Date objects
	let start = new Date(startDate)
	let end = new Date(endDate)

	// Normalize order if startDate > endDate
	if (start > end) [start, end] = [end, start]

	let count = 0
	const current = new Date(start)

	while (current <= end) {
		const day = current.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
		if (workdays.includes(day)) count++
		current.setDate(current.getDate() + 1)
	}

	return count
}

/**
 * Parses the content to extract tasks and their associated time intervals.
 */
export function parseTasks(content: string): Task[] {
	const taskRegex = /- \[.\] (.+?) (#.+?)(\n\s+\[clock::(.+?)--(.+?)\])+/g
	const clockRegex = /\[clock::(.+?)--(.+?)\]/g
	const tasks = []
	let match

	while ((match = taskRegex.exec(content)) !== null) {
		const taskName = (match[1] || '').trim()
		const tags = (match[2] || '')
			.split(' ')
			.map((tag) => tag.trim())
			.filter(Boolean)
		const textIntervals = extractIntervals(match[0], clockRegex)
		const { totalMinutes, intervals } = parseTimeIntervals(textIntervals)
		tasks.push({ name: taskName, tags, totalMinutes, intervals })
	}

	return tasks
}

/**
 * Extracts time intervals from a task's content using a regular expression.
 */
function extractIntervals(taskContent: string, clockRegex: RegExp) {
	const intervals = []
	let clockMatch
	while ((clockMatch = clockRegex.exec(taskContent)) !== null) {
		intervals.push(clockMatch[0].slice(8, -1)) // Remove '[clock::' and ']'
	}
	return intervals
}

/**
 * Parses time intervals and calculates the total time in minutes.
 */
function parseTimeIntervals(textIntervals: string[]) {
	let totalMinutes = 0
	const intervals: Interval[] = []
	textIntervals.forEach((interval) => {
		const [start, end] = interval.split('--')
		const startTime = new Date(start || '')
		const endTime = new Date(end || '')
		const diff = getMinutesBetween(startTime, endTime) // Difference in minutes
		totalMinutes += diff
		intervals.push({ startTime, endTime, minutes: diff })
	})
	return { totalMinutes, intervals }
}

/**
 * Sorts tasks by the total time spent in descending order.
 */
export function sortTasksByTime(tasks: Task[]) {
	return tasks.sort((a, b) => b.totalMinutes - a.totalMinutes)
}

/**
 * Aggregates the total time spent by tags.
 */
export function aggregateTimeByTags(tasks: Task[]) {
	const tagTimeMap: TagTimes = {}
	tasks.forEach((task) => {
		task.tags.forEach((tag) => {
			if (!tagTimeMap[tag]) {
				tagTimeMap[tag] = 0
			}
			tagTimeMap[tag] += task.totalMinutes
		})
	})
	return tagTimeMap
}

/**
 * Sorts the tag time map by total time spent in descending order.
 * @param {Object} tagTimeMap - A map of tags to total minutes.
 * @returns {Array} - The sorted array of tag time entries.
 */
export function sortTagTimeArray(tagTimeMap: TagTimes) {
	const tagTimeArray = Object.entries(tagTimeMap)
	return tagTimeArray.sort((a, b) => b[1] - a[1])
}

/**
 * Return intervals in a period of time (totalTime) that was not overlapping
 * with an array of time intervals (myIntervals)
 */
export function getAvailableIntervals(
	myIntervals: Interval[],
	dayInterval: { startTime: Date; endTime: Date }
) {
	// Step 1: Normalize and sort the input intervals by startTime
	const sortedIntervals = [...myIntervals]
		.filter((i) => i.endTime > i.startTime) // Ignore invalid intervals
		.sort((a, b) => a.startTime.valueOf() - b.startTime.valueOf())

	// Step 2: Merge overlapping intervals
	const merged = []
	for (const interval of sortedIntervals) {
		if (
			merged.length === 0 ||
			interval.startTime > merged[merged.length - 1]!.endTime
		) {
			merged.push({ ...interval })
		} else {
			// If overlapping
			merged[merged.length - 1]!.endTime = new Date(
				Math.max(
					merged[merged.length - 1]!.endTime.valueOf(),
					interval.endTime.valueOf()
				)
			)
		}
	}

	// Step 3: Clip merged intervals to the bounds of totalTime
	const clipped = merged
		.map((i) => ({
			startTime: new Date(
				Math.max(i.startTime.valueOf(), dayInterval.startTime.valueOf())
			),
			endTime: new Date(
				Math.min(i.endTime.valueOf(), dayInterval.endTime.valueOf())
			),
		}))
		.filter((i) => i.endTime > i.startTime) // Keep only intervals within totalTime

	// Step 4: Compute the complement intervals within totalTime
	const available = []
	let cursor = dayInterval.startTime

	for (const interval of clipped) {
		if (cursor < interval.startTime) {
			available.push({
				startTime: new Date(cursor),
				endTime: new Date(interval.startTime),
			})
		}
		cursor = new Date(Math.max(cursor.valueOf(), interval.endTime.valueOf()))
	}

	// Add final available slot if any
	if (cursor < dayInterval.endTime) {
		available.push({
			startTime: new Date(cursor),
			endTime: new Date(dayInterval.endTime),
		})
	}

	const totalAvailable = available.reduce(
		(pre, cur) => pre + getMinutesBetween(cur.startTime, cur.endTime),
		0
	)

	return { available, totalAvailable }
}

/**
 *
 */
function getTasksOverlappingMinutes(tasks: Task[]) {
	let allIntervals: Interval[] = []
	let totalOverlapping = 0

	// FIXME: Refactor this part so that taskName is always present on every interval and we don't have to reconfigure them
	tasks.forEach((t) => {
		allIntervals = allIntervals.concat(
			t.intervals.map((i) => ({ ...i, taskName: t.name }))
		)
	})

	for (let t = 0; t < tasks.length; t++) {
		let totalTaskOverlapping = 0

		for (let i = 0; i < tasks[t]!.intervals.length; i++) {
			const current = tasks[t]!.intervals[i]!
			let overlapMillis = 0

			for (let j = 0; j < allIntervals.length; j++) {
				const other = allIntervals[j]!

				if (allIntervals[j]!.taskName === tasks[t]!.name) continue

				const overlapStart = new Date(
					Math.max(current.startTime.valueOf(), other.startTime.valueOf())
				)
				const overlapEnd = new Date(
					Math.min(current.endTime.valueOf(), other.endTime.valueOf())
				)

				if (overlapStart < overlapEnd) {
					overlapMillis += overlapEnd.valueOf() - overlapStart.valueOf()
				}
			}

			// To prevent counting overlapping time multiple times (e.g., with 3+ overlapping intervals),
			// we cap the overlap duration to the duration of the current interval
			const intervalDuration =
				current.endTime.valueOf() - current.startTime.valueOf()
			const clampedMillis = Math.min(overlapMillis, intervalDuration)
			const overlappingMinutes = Math.floor(clampedMillis / 60000)
			totalTaskOverlapping += overlappingMinutes

			tasks[t]!.intervals[i] = {
				...current,
				overlappingMinutes,
			}
		}

		tasks[t]!.totalOverlapping = totalTaskOverlapping
		totalOverlapping += totalTaskOverlapping
	}

	return { tasks, totalOverlapping }
}

export function calculateTasksTotalTime(tasks: Task[]) {
	return Math.floor(tasks.reduce((pre, cur) => cur.totalMinutes + pre, 0))
}

export function getMinutesBetween(date1: Date, date2: Date) {
	const diffInMs = date2.valueOf() - date1.valueOf() // difference in milliseconds
	return Math.floor(diffInMs / 60000) // convert ms to minutes
}

/**
 * Formats minutes into a string representing hours and minutes.
 */
export function formatTime(minutes: number, total: number) {
	const hours = Math.floor(minutes / 60)
	const mins = Math.floor(minutes % 60)
	const percentage = total
		? ` - ${Math.floor((minutes / total) * 1000) / 10}%`
		: ``
	return `${Math.floor(minutes)}m - (${hours}h ${mins}m)${percentage}`
}

/**
 * Check if any element in array1 is included in array2, returning true if there's a match
 */
function hasCommonString(array1: string[], array2: string[]) {
	return array1.some((str) => array2.includes(str))
}

/**
 * Identifies if the name of a label should be emphasized in any way
 */
export function formatName(name: string, tags: string[] = []) {
	let formatElements = []
	if (italicTags.contains(name) || hasCommonString(tags, italicTags)) {
		formatElements.push('i')
	}
	if (boldTags.contains(name) || hasCommonString(tags, boldTags)) {
		formatElements.push('b')
	}
	if (underlineTags.contains(name) || hasCommonString(tags, underlineTags)) {
		formatElements.push('u')
	}
	return { name, formatElements }
}

/**
 * Display a simple text with a label and a value, before adding a breaking row
 */
// function displayItem(rootDiv, label, value) {
// 	createElement('b', rootDiv, label)
// 	createElement('span', rootDiv, value)
// 	createElement('br', rootDiv)
// }
