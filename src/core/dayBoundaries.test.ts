import { describe, expect, it } from 'vitest'
import {
	describeMarkSet,
	endDayWithLastClock,
	startDayWithFirstClock,
} from './dayBoundaries'

const lines = (...l: string[]) => l.join('\n')

describe('startDayWithFirstClock', () => {
	const before = lines('- [ ] Chores', '- [ ] Email')

	it('starts the day with the first clock of the note', () => {
		const after = lines(
			'- [ ] Chores',
			'      [clock::2026-11-17T08:12:00]',
			'- [ ] Email'
		)
		const recorded = startDayWithFirstClock(before, after)
		expect(recorded?.at).toEqual(new Date(2026, 10, 17, 8, 12))
		expect(recorded?.content.split('\n')).toEqual([
			'---',
			'day_start: 2026-11-17T08:12:00',
			'---',
			'- [ ] Chores',
			'      [clock::2026-11-17T08:12:00]',
			'- [ ] Email',
		])
	})

	it('leaves a recorded start of day alone', () => {
		const after = lines(
			'---',
			'day_start: 2026-11-17T07:00:00',
			'---',
			'- [ ] Chores',
			'      [clock::2026-11-17T08:12:00]'
		)
		expect(startDayWithFirstClock(before, after)).toBeNull()
	})

	it('only counts the first clock of the day, not later ones', () => {
		const earlier = lines(
			'- [ ] Chores',
			'      [clock::2026-11-17T08:12:00--2026-11-17T08:40:00]',
			'- [ ] Email'
		)
		const later = lines(
			'- [ ] Chores',
			'      [clock::2026-11-17T08:12:00--2026-11-17T08:40:00]',
			'- [ ] Email',
			'      [clock::2026-11-17T09:00:00]'
		)
		expect(startDayWithFirstClock(earlier, later)).toBeNull()
	})
})

describe('endDayWithLastClock', () => {
	it('ends the day with the last clock once none runs', () => {
		const content = lines(
			'- [ ] German listening',
			'      [clock::2026-11-16T23:03:00--2026-11-17T00:20:00]',
			'- [ ] Chat with Anne',
			'      [clock::2026-11-16T22:29:00--2026-11-16T23:45:00]'
		)
		const recorded = endDayWithLastClock(content)
		expect(recorded?.at).toEqual(new Date(2026, 10, 17, 0, 20))
		expect(recorded?.content.split('\n').slice(0, 3)).toEqual([
			'---',
			'day_end: 2026-11-17T00:20:00',
			'---',
		])
	})

	it('waits for the last running clock', () => {
		const content = lines(
			'- [ ] German listening',
			'      [clock::2026-11-16T23:03:00--2026-11-17T00:20:00]',
			'- [ ] Chat with Anne',
			'      [clock::2026-11-16T22:29:00]'
		)
		expect(endDayWithLastClock(content)).toBeNull()
	})

	it('keeps a recorded end of day as late as the last clock, pushes an earlier one', () => {
		const ending = (dayEnd: string) =>
			lines(
				'---',
				`day_end: ${dayEnd}`,
				'---',
				'- [ ] Chat with Anne',
				'      [clock::2026-11-16T22:29:00--2026-11-16T23:45:00]'
			)
		expect(endDayWithLastClock(ending('2026-11-17T00:30:00'))).toBeNull()
		expect(endDayWithLastClock(ending('2026-11-16T23:00:00'))?.at).toEqual(
			new Date(2026, 10, 16, 23, 45)
		)
	})
})

describe('describeMarkSet', () => {
	const now = new Date(2026, 10, 17, 9, 0)

	it('says the time, with its day when not today', () => {
		expect(describeMarkSet('start', new Date(2026, 10, 17, 7, 5), now)).toBe(
			'Start of day set to 07:05.'
		)
		expect(describeMarkSet('end', new Date(2026, 10, 16, 23, 45), now)).toBe(
			'End of day set to yesterday at 23:45.'
		)
	})
})
