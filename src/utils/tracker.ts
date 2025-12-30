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

/**
 * Initializes the TrackStats instance and processes the content.
 */
// TODO: Refactor name to initDailyTrackers
export function init(datas) {
	const tasks = parseTasks(datas.content)
	// console.log(getTasksOverlappingMinutes(tasks))

	const sortedTasks = sortTasksByTime(tasks)
	const tagTimeMap = aggregateTimeByTags(tasks)
	const sortedTagTimeArray = sortTagTimeArray(tagTimeMap)

	console.log(datas.yesterdaysMetadata.frontmatter.wake_time)
	const stats = calculateDailyStats(sortedTasks, datas)
	console.log({ sortedTasks, sortedTagTimeArray, stats })
	return { sortedTasks, sortedTagTimeArray, stats }
}

// TODO: Refactor this function
function initProjectTracking(datas, projectPage) {
	const workDays = datas
		.map((data) => {
			return {
				file: data.file,
				// Keep only project tasks
				tasks: parseTasks(data.content).filter(
					(task) => task.name === projectPage.project_name
				),
			}
		})
		// filter out days where the project was not worked on
		.filter((data) => {
			return data.tasks.length > 0
		})

	const allWorkSessions = workDays.map((day) => day.tasks).flat()
	const totalWorkedMinutes = calculateTasksTotalTime(allWorkSessions)

	// Get objective
	const projectStart = new Date(projectPage.project_start.ts)
	const today = new Date()
	const totalWorkDays =
		getNumberOfWorkDays(projectStart, today, projectPage.project_days) -
		projectPage.project_holidays
	const totalWorkMinutes = totalWorkDays * projectPage.project_time_per_day
	const workBalance = totalWorkedMinutes - totalWorkMinutes

	// Display results
	const rootDiv = document.getElementById(`root-${projectPage.project_name}`)
	displayItem(rootDiv, `📆  Total days due: `, `${totalWorkDays} days`)
	displayItem(rootDiv, `🎯  Time objective: `, formatTime(totalWorkMinutes))
	displayItem(
		rootDiv,
		`💪  Total time worked: `,
		formatTime(totalWorkedMinutes, totalWorkMinutes)
	)
	displayItem(rootDiv, `⚖️  Work balance: `, formatTime(workBalance))
}

/**
 * Get number of workdays between two dates (including those dates)
 */
function getNumberOfWorkDays(startDate, endDate, workdays = [1, 2, 3, 4, 5]) {
	// Ensure we’re working with Date objects
	let start = new Date(startDate)
	let end = new Date(endDate)

	// Normalize order if startDate > endDate
	if (start > end) [start, end] = [end, start]

	let count = 0
	const current = new Date(start)

	while (current <= end) {
		const day = current.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
		if (workdays.includes(day.toString())) count++
		current.setDate(current.getDate() + 1)
	}

	return count
}

/**
 * Parses the content to extract tasks and their associated time intervals.
 * @param {string} content - The content to be parsed.
 * @returns {Array} - An array of task objects with their names, tags, and total minutes.
 */
function parseTasks(content) {
	const taskRegex = /- \[.\] (.+?) (#.+?)(\n\s+\[clock::(.+?)--(.+?)\])+/g
	const clockRegex = /\[clock::(.+?)--(.+?)\]/g
	const tasks = []
	let match

	while ((match = taskRegex.exec(content)) !== null) {
		const taskName = match[1].trim()
		const tags = match[2]
			.split(' ')
			.map((tag) => tag.trim())
			.filter((tag) => tag)
		const textIntervals = extractIntervals(match[0], clockRegex)
		const { totalMinutes, intervals } = parseTimeIntervals(textIntervals)
		tasks.push({ name: taskName, tags, totalMinutes, intervals })
	}

	return tasks
}

/**
 * Extracts time intervals from a task's content using a regular expression.
 * @param {string} taskContent - The content of the task.
 * @param {RegExp} clockRegex - The regular expression to match time intervals.
 * @returns {Array} - An array of time intervals.
 */
function extractIntervals(taskContent, clockRegex) {
	const intervals = []
	let clockMatch
	while ((clockMatch = clockRegex.exec(taskContent)) !== null) {
		intervals.push(clockMatch[0].slice(8, -1)) // Remove '[clock::' and ']'
	}
	return intervals
}

/**
 * Parses time intervals and calculates the total time in minutes.
 * @param {Array} intervals - An array of time intervals.
 * @returns {number} - The total time in minutes.
 */
function parseTimeIntervals(textIntervals) {
	let totalMinutes = 0
	const intervals = []
	textIntervals.forEach((interval) => {
		const [start, end] = interval.split('--')
		const startTime = new Date(start)
		const endTime = new Date(end)
		const diff = getMinutesBetween(startTime, endTime) // Difference in minutes
		totalMinutes += diff
		intervals.push({ startTime, endTime, minutes: diff })
	})
	return { totalMinutes, intervals }
}

/**
 * Sorts tasks by the total time spent in descending order.
 * @param {Array} tasks - An array of task objects.
 * @returns {Array} - The sorted array of task objects.
 */
function sortTasksByTime(tasks) {
	return tasks.sort((a, b) => b.totalMinutes - a.totalMinutes)
}

/**
 * Aggregates the total time spent by tags.
 * @param {Array} tasks - An array of task objects.
 * @returns {Object} - A map of tags to total minutes.
 */
function aggregateTimeByTags(tasks) {
	const tagTimeMap = {}
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
function sortTagTimeArray(tagTimeMap) {
	const tagTimeArray = Object.entries(tagTimeMap)
	return tagTimeArray.sort((a, b) => b[1] - a[1])
}

/**
 * Return intervals in a period of time (totalTime) that was not overlapping
 * with an array of time intervals (myIntervals)
 */
function getAvailableIntervals(myIntervals, totalTime) {
	// Step 1: Normalize and sort the input intervals by startTime
	const sortedIntervals = [...myIntervals]
		.filter((i) => i.endTime > i.startTime) // Ignore invalid intervals
		.sort((a, b) => a.startTime - b.startTime)

	// Step 2: Merge overlapping intervals
	const merged = []
	for (const interval of sortedIntervals) {
		if (
			merged.length === 0 ||
			interval.startTime > merged[merged.length - 1].endTime
		) {
			merged.push({ ...interval })
		} else {
			// If overlapping
			merged[merged.length - 1].endTime = new Date(
				Math.max(merged[merged.length - 1].endTime, interval.endTime)
			)
		}
	}

	// Step 3: Clip merged intervals to the bounds of totalTime
	const clipped = merged
		.map((i) => ({
			startTime: new Date(Math.max(i.startTime, totalTime.startTime)),
			endTime: new Date(Math.min(i.endTime, totalTime.endTime)),
		}))
		.filter((i) => i.endTime > i.startTime) // Keep only intervals within totalTime

	// Step 4: Compute the complement intervals within totalTime
	const available = []
	let cursor = totalTime.startTime

	for (const interval of clipped) {
		if (cursor < interval.startTime) {
			available.push({
				startTime: new Date(cursor),
				endTime: new Date(interval.startTime),
			})
		}
		cursor = new Date(Math.max(cursor, interval.endTime))
	}

	// Add final available slot if any
	if (cursor < totalTime.endTime) {
		available.push({
			startTime: new Date(cursor),
			endTime: new Date(totalTime.endTime),
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
function getTasksOverlappingMinutes(tasks) {
	let allIntervals = []
	let totalOverlapping = 0

	tasks.forEach((t) => {
		allIntervals = allIntervals.concat(
			t.intervals.map((i) => ({ ...i, taskName: t.name }))
		)
	})

	for (let t = 0; t < tasks.length; t++) {
		let totalTaskOverlapping = 0

		for (let i = 0; i < tasks[t].intervals.length; i++) {
			const current = tasks[t].intervals[i]
			let overlapMillis = 0

			for (let j = 0; j < allIntervals.length; j++) {
				const other = allIntervals[j]

				if (allIntervals[j].taskName === tasks[t].name) continue

				const overlapStart = new Date(
					Math.max(current.startTime, other.startTime)
				)
				const overlapEnd = new Date(Math.min(current.endTime, other.endTime))

				if (overlapStart < overlapEnd) {
					overlapMillis += overlapEnd - overlapStart
				}
			}

			// To prevent counting overlapping time multiple times (e.g., with 3+ overlapping intervals),
			// we cap the overlap duration to the duration of the current interval
			const intervalDuration = current.endTime - current.startTime
			const clampedMillis = Math.min(overlapMillis, intervalDuration)
			const overlappingMinutes = Math.floor(clampedMillis / 60000)
			totalTaskOverlapping += overlappingMinutes

			tasks[t].intervals[i] = {
				...current,
				overlappingMinutes,
			}
		}

		tasks[t].totalOverlapping = totalTaskOverlapping
		totalOverlapping += totalTaskOverlapping
	}

	return { tasks, totalOverlapping }
}

function calculateTasksTotalTime(tasks) {
	return Math.floor(
		tasks.reduce((pre, cur) => cur.totalMinutes + (pre.totalMinutes || pre), 0)
	)
}

function calculateDailyStats(tasks, datas) {
	const stats = {}

	// Total time logged today
	stats.totalTime = calculateTasksTotalTime(tasks)

	// Time slept
	const oldBedTime = new Date(
		datas.yesterdaysMetadata.frontmatter.bed_time
	).valueOf()
	const wakeTime = new Date(
		datas.todaysMetadata.frontmatter.wake_time
	).valueOf()
	stats.sleepTime = getMinutesBetween(oldBedTime, wakeTime)

	// Time loggable from waking up to going to bed
	const newBedTime = new Date(
		datas.todaysMetadata.frontmatter.bed_time
	).valueOf()
	stats.loggableTime = getMinutesBetween(wakeTime, newBedTime)

	// Time that remains for today
	const now = new Date().valueOf()
	const nowBedDifference = getMinutesBetween(now, newBedTime)
	stats.remainingTime = nowBedDifference < 0 ? 0 : nowBedDifference

	// Time passed that was not logged
	const dayInterval = {
		startTime: new Date(wakeTime),
		endTime: nowBedDifference < 0 ? new Date(newBedTime) : new Date(now),
	}

	let tasksIntervals = []
	tasks.forEach((t) => {
		tasksIntervals = tasksIntervals.concat([...t.intervals])
	})
	const notLoggedIntervals = getAvailableIntervals(tasksIntervals, dayInterval)
	stats.unloggedTime = notLoggedIntervals.totalAvailable

	return stats
}

function getMinutesBetween(date1, date2) {
	const diffInMs = date2 - date1 // difference in milliseconds
	return Math.floor(diffInMs / 60000) // convert ms to minutes
}

/**
 * Formats minutes into a string representing hours and minutes.
 * @param {number} minutes - The total minutes.
 * @returns {string} - The formatted time string.
 */
export function formatTime(minutes, total) {
	const hours = Math.floor(minutes / 60)
	const mins = Math.floor(minutes % 60)
	const percentage = total
		? ` - ${Math.floor((minutes / total) * 1000) / 10}%`
		: ``
	return `${Math.floor(minutes)}m - (${hours}h ${mins}m)${percentage}`
}

/**
 * Creates and appends an element to a parent element.
 * @param {string} type - The type of the element.
 * @param {string} text - The text content of the element.
 * @param {HTMLElement} parent - The parent element to append the element to.
 */
function createElement(type, parent, text) {
	const el = document.createElement(type)
	if (text) el.textContent = text
	parent.appendChild(el)
}

/**
 * Check if any element in array1 is included in array2, returning true if there's a match
 * @param {Array<string>} array1
 * @param {Array<string>} array2
 */
function hasCommonString(array1, array2) {
	return array1.some((str) => array2.includes(str))
}

/**
 * Identifies if the name of a label should be emphasized in any way
 * @param {string} name - The name of the label
 * @param {Array<string>} tags - The text content of the element.
 *
 */
export function formatName(name, tags = []) {
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
function displayItem(rootDiv, label, value) {
	createElement('b', rootDiv, label)
	createElement('span', rootDiv, value)
	createElement('br', rootDiv)
}
