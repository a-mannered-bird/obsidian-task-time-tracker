export type Task = {
	name: string
	tags: string[]
	totalMinutes: number
	intervals: Interval[]
	totalOverlapping?: number
}

export type TagTimes = Record<string, number>

export type Interval = {
	startTime: Date
	endTime: Date
	minutes: number
	taskName?: string
	overlappingMinutes?: number
}
