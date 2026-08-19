/** A work session on a task. `end` is null while the clock is running. */
export type Clock = {
	start: Date
	end: Date | null
	lineIndex: number
}

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
