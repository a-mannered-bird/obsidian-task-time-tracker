import { execFileSync, spawn } from 'child_process'
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'fs'
import { basename, join } from 'path'
import process from 'process'

const TRACE_DIR = 'test-results'
const SCREENSHOT_DIR = join(TRACE_DIR, 'screenshots-only')
const DOM_RECORDING = 'trace.mutations'

function fail(message) {
	console.error(`open-trace: ${message}`)
	process.exit(1)
}

function latestTrace() {
	const traces = readdirSync(TRACE_DIR)
		.filter((name) => /^trace-.*\.zip$/.test(name))
		.map((name) => join(TRACE_DIR, name))
		.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
	return traces[0] ?? fail(`no trace in ${TRACE_DIR}. Record one first.`)
}

/**
 * The recorder finds a mutation's target through an attribute it stamps on
 * every element, and CodeMirror clears foreign attributes from its lines. An
 * edit inside an open note is therefore recorded without a target, which the
 * player (as of @wdio/devtools-app 1.13) reads as a whole new page: the
 * preview goes blank from that step on.
 */
function breaksDomReplay(trace) {
	let recording
	try {
		recording = execFileSync('unzip', ['-p', trace, DOM_RECORDING], {
			encoding: 'utf8',
			maxBuffer: Infinity,
			stdio: ['ignore', 'pipe', 'ignore'],
		})
	} catch {
		// unzip fails when the trace has no DOM recording at all.
		return false
	}
	return recording.split('\n').some((line) => {
		if (!line) return false
		const mutation = JSON.parse(line)
		return (
			mutation.type === 'childList' &&
			mutation.addedNodes.length === 1 &&
			!mutation.target &&
			!mutation.url
		)
	})
}

/** Without a DOM recording the player shows each step's screenshot instead. */
function withoutDomRecording(trace) {
	mkdirSync(SCREENSHOT_DIR, { recursive: true })
	const copy = join(SCREENSHOT_DIR, basename(trace))
	copyFileSync(trace, copy)
	execFileSync('zip', ['-q', '-d', copy, DOM_RECORDING])
	return copy
}

const trace = process.argv[2] ?? latestTrace()
let opened = trace
if (breaksDomReplay(trace)) {
	opened = withoutDomRecording(trace)
	console.log(
		'open-trace: this run edits a note in the editor, which the DOM replay cannot follow. Showing the screenshot of each step instead.'
	)
}
console.log(`open-trace: ${trace}`)

spawn('show-trace', [opened], { stdio: 'inherit' }).on('exit', (code) =>
	process.exit(code ?? 0)
)
