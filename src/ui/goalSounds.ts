import type { GoalSound } from 'core/goalCrossings'

type Tone = {
	frequency: number
	/** Seconds after the sound starts. */
	at: number
	duration: number
	type: OscillatorType
	gain: number
}

/**
 * Synthesized rather than shipped as files: nothing to bundle or load. The
 * success is a rising major arpeggio with a bell-like octave on top; the
 * warning two falling notes, lower and duller.
 */
const SOUNDS: Record<GoalSound, Tone[]> = {
	reached: [
		{ frequency: 1046.5, at: 0, duration: 0.5, type: 'sine', gain: 0.14 },
		{ frequency: 1318.5, at: 0.08, duration: 0.5, type: 'sine', gain: 0.13 },
		{ frequency: 1568, at: 0.16, duration: 0.6, type: 'sine', gain: 0.12 },
		{ frequency: 2093, at: 0.24, duration: 0.9, type: 'sine', gain: 0.1 },
		{ frequency: 4186, at: 0.24, duration: 0.5, type: 'sine', gain: 0.02 },
	],
	over: [
		{ frequency: 440, at: 0, duration: 0.22, type: 'triangle', gain: 0.22 },
		{ frequency: 349.2, at: 0.2, duration: 0.38, type: 'triangle', gain: 0.22 },
	],
}

/**
 * A suspended context resumes only after a tap on mobile web views: a sound
 * that waited for one would come long after what it was about.
 */
const STALE_AFTER_MS = 1000

export class SoundPlayer {
	private context: AudioContext | null = null

	constructor(private readonly enabled: () => boolean) {}

	play(sound: GoalSound) {
		if (!this.enabled()) return
		if (!this.context || this.context.state === 'closed')
			this.context = new AudioContext()
		const context = this.context
		if (context.state === 'running') return schedule(context, SOUNDS[sound])
		const requested = performance.now()
		context
			.resume()
			.then(() => {
				if (performance.now() - requested < STALE_AFTER_MS)
					schedule(context, SOUNDS[sound])
			})
			.catch(() => {})
	}

	close() {
		void this.context?.close()
		this.context = null
	}
}

function schedule(context: AudioContext, tones: Tone[]) {
	const start = context.currentTime
	for (const tone of tones) {
		const at = start + tone.at
		const oscillator = context.createOscillator()
		oscillator.type = tone.type
		oscillator.frequency.value = tone.frequency
		const envelope = context.createGain()
		// Exponential ramps cannot start from 0; a short attack avoids a click.
		envelope.gain.setValueAtTime(0.0001, at)
		envelope.gain.exponentialRampToValueAtTime(tone.gain, at + 0.01)
		envelope.gain.exponentialRampToValueAtTime(0.0001, at + tone.duration)
		oscillator.connect(envelope).connect(context.destination)
		oscillator.start(at)
		oscillator.stop(at + tone.duration + 0.05)
	}
}
