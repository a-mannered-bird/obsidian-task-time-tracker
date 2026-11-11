/** A work session on a task. `end` is null while the clock is running. */
export type Clock = {
	start: Date
	end: Date | null
	lineIndex: number
}

/** The two timestamps of a clock line; `end` is null while it runs. */
export type ClockTimes = {
	start: Date
	end: Date | null
}

/**
 * A clock line found again by content rather than by line index, which
 * shifts whenever lines are inserted above it.
 */
export type ClockKey = ClockTimes & { taskName: string }

export type Task = {
	/** Task label without checkbox and tags. */
	name: string
	tags: string[]
	ticked: boolean
	lineIndex: number
	clocks: Clock[]
}

/** A closed time span, used for all interval arithmetic. */
export type Interval = {
	start: Date
	end: Date
}
export type MinutesByKey = Record<string, number>
