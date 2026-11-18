import { describe, expect, it } from 'vitest'
import { noticeSegments, noticeTask, plainNoticeText } from './noticeText'

describe('noticeSegments', () => {
	it('cuts the task names out of the text, quoted', () => {
		expect(
			noticeSegments(
				`Moved from ${noticeTask('Chores')} to ${noticeTask('Email')}.`
			)
		).toEqual([
			{ text: 'Moved from ', isTask: false },
			{ text: '"Chores"', isTask: true },
			{ text: ' to ', isTask: false },
			{ text: '"Email"', isTask: true },
			{ text: '.', isTask: false },
		])
	})

	it('keeps a text without task names whole', () => {
		expect(noticeSegments('Note updated.')).toEqual([
			{ text: 'Note updated.', isTask: false },
		])
	})
})

describe('plainNoticeText', () => {
	it('reads task names in quotes, whatever they hold', () => {
		expect(plainNoticeText(`${noticeTask('Say "hi"')} started.`)).toBe(
			'"Say "hi"" started.'
		)
	})
})
