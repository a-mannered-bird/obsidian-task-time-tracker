import assert from 'node:assert'
import { browser, expect } from '@wdio/globals'
import type { ChainablePromiseElement } from 'webdriverio'

export function minutesField(modal: ChainablePromiseElement) {
	return modal.$('input[aria-label="Minutes ago"]')
}

export function timeField(modal: ChainablePromiseElement) {
	return modal.$('input[aria-label="Time"]')
}

/** Type minutes, replacing the selected default. */
export async function typeMinutes(
	modal: ChainablePromiseElement,
	minutes: string
) {
	const field = minutesField(modal)
	await field.setValue(minutes)
	await expect(field).toHaveValue(minutes)
}

/** Set the time field to `HH:MM`. */
export async function typeTime(modal: ChainablePromiseElement, time: string) {
	await setTimeInput(timeField(modal), time)
}

/**
 * Set a time input to `HH:MM`. Set through the DOM: keystrokes into a time
 * input depend on the locale's 12 or 24 hour segments.
 */
export async function setTimeInput(
	field: ChainablePromiseElement,
	time: string
) {
	const element = await field.getElement()
	await browser.execute(
		(el, value) => {
			if (!(el instanceof HTMLInputElement)) throw new Error('not an input')
			el.value = value
			el.dispatchEvent(new Event('input', { bubbles: true }))
		},
		element,
		time
	)
	await expect(field).toHaveValue(time)
}

/**
 * Answer the prompt the first clock of a note opens: the time of day typed
 * when given, else the task's own start it opens on.
 */
export async function answerStartOfDay(time?: string) {
	await browser.waitUntil(
		async () => {
			const titles = await browser.$$('.modal-title').getElements()
			const top = titles[titles.length - 1]
			return top !== undefined && (await top.getText()) === 'Start of day'
		},
		{ timeoutMsg: 'no "Start of day" modal opened' }
	)
	const modals = await browser.$$('.modal-container').getElements()
	const modal = modals[modals.length - 1]!.$('.modal')
	await expect(modal.$('.modal-title')).toHaveText('Start of day')
	await expect(modal.$('p')).toHaveText(
		"It's the first task of the day! But when did your day actually start?"
	)
	if (time) await typeTime(modal, time)
	await modal.$('button=OK').click()
}

function formatTimeOfDay(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0')
	return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * The time field shows `minutes` before now. The prompt counts from when it
 * opened, so a minute may have turned since.
 */
export async function expectTimeMinutesAgo(
	modal: ChainablePromiseElement,
	minutes: number
) {
	const at = Date.now() - minutes * 60 * 1000
	const accepted = [at, at - 60 * 1000].map((t) => formatTimeOfDay(new Date(t)))
	const shown = await timeField(modal).getValue()
	assert.ok(accepted.includes(shown), `time field shows ${shown}`)
}
