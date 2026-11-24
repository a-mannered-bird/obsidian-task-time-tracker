import type { TFile } from 'obsidian'
import { describe, expect, it } from 'vitest'
import type { DailyLog } from './dailyLogs'
import { latestTaskTags } from './loadRangeStats'
import { parseTasks } from './parser'

const log = (day: number, lines: string[]): DailyLog => ({
	date: new Date(2026, 7, day),
	file: { path: `2026-08-${day}.md` } as TFile,
	tasks: parseTasks(lines),
	dayStart: null,
	dayEnd: null,
	tagGoals: [],
})

describe('latestTaskTags', () => {
	it("takes each task's tags from its latest note, first line there", () => {
		expect(
			latestTaskTags([
				log(17, ['- [ ] Write #work', '- [ ] Write #draft', '- [ ] Email']),
				log(16, ['- [ ] Write #old', '- [ ] Run #sport']),
			])
		).toEqual({ Write: ['#work'], Email: [], Run: ['#sport'] })
	})
})
