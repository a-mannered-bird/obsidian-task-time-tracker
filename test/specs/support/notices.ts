import { browser, expect } from '@wdio/globals'
import type { ChainablePromiseElement } from 'webdriverio'

/**
 * Click a button of a notice once it has stopped moving. Obsidian slides a
 * new notice in from the right (a Web Animations `animate()` on the notice,
 * ~120 ms, longer under load): a click aimed while it moves lands beside the
 * button, on the notice itself, which only closes it.
 */
export async function clickNoticeButton(
	notice: ChainablePromiseElement,
	label: string
) {
	await expect(notice).toBeDisplayed()
	const element = await notice.getElement()
	await browser.execute(async (el) => {
		await Promise.all(el.getAnimations().map((a) => a.finished))
	}, element)
	await notice.$(`button=${label}`).click()
}
