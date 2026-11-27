import { describe, expect, it } from 'vitest'
import { isDailyViewTab } from './dailyViewTabs'

describe('isDailyViewTab', () => {
	it('accepts a tab of the view', () => {
		expect(isDailyViewTab('goals')).toBe(true)
	})

	it('rejects a dropped tab, as an old setting may hold', () => {
		expect(isDailyViewTab('stats')).toBe(false)
	})
})
