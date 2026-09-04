# Task Time Tracker — Obsidian plugin

Tracks time on the tasks of daily notes (`- [ ] Task #tag` lines with `[clock::start--end]` lines below them) and builds statistics from them. The daily notes are the database: the plugin keeps no copy of task data, only settings that cannot live in markdown (colors, hide flags).

## Tooling

- TypeScript (strict) + Svelte 5 (runes) bundled by esbuild into `main.js`; npm is the package manager.
- `src/styles.css` is imported by `main.ts` and bundled with the Svelte component CSS into the generated `styles.css` at the root (gitignored, like `main.js`). Never edit the root `styles.css`.
- Scripts: `npm run dev` (watch), `npm run build` (tsc + esbuild), `npm run lint` (eslint incl. the `obsidianmd` rules: sentence-case UI text, no `TFile` casts…), `npm run svelte-check`, `npm test` / `npm run test:watch` (Vitest), `npm run test:e2e`, `npm run typecheck:e2e`, `npm run test:e2e:debug` / `test:e2e:trace` / `test:e2e:trace:open`, `npm run deploy` (copies the release files to the vault named by `OBSIDIAN_VAULT` in `.env`).
- CI (`.github/workflows/lint.yml`) runs build, lint, unit tests and the E2E suite (Linux needs Xvfb + a window manager, already set up there).
- Release artifacts: `main.js`, `manifest.json`, `styles.css`. Bump with `npm version` (runs `version-bump.mjs`); the release tag equals `manifest.json`'s version, without a leading `v`. Never change the plugin `id` or a command id once released.

## Layout

- `src/core/` — pure TypeScript, no Obsidian runtime: parser, note editor (`TaskNote`), `DailyLogStore` (parsed notes cached by path + mtime, change events), `VaultTaskIndex` (lazy vault-wide aggregates), the toggle engine, stats, and the bulk operations (`consolidate`, `taskEdits`, `bulkEdit`, `taskOperations`, `settingsMigration`, `confirmations`). Everything here has unit tests next to it.
- `src/commands/` — command registration and the orchestration of user flows (prompts → previews → confirmations → runs).
- `src/ui/` — modals in plain TypeScript on Obsidian's `Modal`/`Setting`; `src/components/` — Svelte components (daily view tabs, stats, task manager); `src/views/` — Obsidian views and the `task-stats` code block.
- `src/test/` — test doubles shared by several test files (`obsidian-mock.ts` aliases the `obsidian` package in Vitest; `fakeVault.ts` is an in-memory vault serving both the index and the bulk runner).
- `test/specs/` + `test/vaults/daily/` — E2E specs and their fixture vault; `test/tsconfig.json` types them (the root tsconfig excludes `test/`).
- `PLAN.md` — roadmap and the recorded design decisions, dated. Read it before starting a phase and tick its checkboxes as work lands.

## Architecture rules

- **Task identity is the name, case-sensitive.** Tags are per-line decoration and may drift between notes; there is no canonical task registry. Only name-keyed settings (`taskColors`, `hiddenTasks`, quick actions, the unassigned task) exist, and rename/merge must migrate them (`settingsMigration.ts`).
- **Decision logic lives in core, UI stays dumb.** Sorting, filtering, previews, confirmation gating, text of confirmations: pure functions with tests. Components and modals only render and call them.
- **Bulk rewrites go through `runBulkEdit`** (`vault.process` per file, unchanged files skipped, failures reported and skipped — every transform is idempotent, so re-running is the recovery) behind `withProgressNotice`, and are previewed from the index alone (no file reads) before confirmation. Destructive ones (delete, merge) require the type-the-name ritual and mention File recovery; the plugin has no undo.
- **Rename and merge are one engine** (`consolidateTasks`): the line already bearing the target name survives with its position and tags, other lines fold into it, clocks are unioned (overlapping and touching merge, zero-length dropped, a running clock only ever extends).
- Keep startup light: the vault index is built lazily on first use, never in `onload`. Register every listener with the `register*` helpers. No network calls.

## Conventions

- Prefer type guards over `as` casts; narrow, do not assert.
- Comments explain a non-obvious why or a workaround, never what well-named code already says.
- Shared test doubles go to `src/test/` once a second test file needs them; fixtures (note contents, expected outputs) stay inside their test file, written as literal note lines — never hidden behind helpers.
- Tests assert behavior; no tests for constants or mock functions; select elements by role/label, not by class, where a11y attributes exist.
- UI text in sentence case; no emoji in UI strings unless it is part of the design (pickers use tag emojis by design).

## Testing

Three layers, each with its own job:

- **Unit tests** (`npm test`, Vitest): every module in `src/core/` is pure TypeScript and is tested there. Decision logic belongs in core, not in Svelte components or modals, so it can be unit-tested; components stay thin and are not component-tested.
- **End-to-end tests** (`npm run test:e2e`, WebdriverIO + `wdio-obsidian-service`): run a real Obsidian against the fixture vault in `test/vaults/daily/` and drive the plugin through its real UI. Every bulk operation that rewrites notes has one, asserting the exact markdown afterwards. `npm run typecheck:e2e` type-checks the specs (they have their own `test/tsconfig.json`; the root one excludes `test/`).
- **Trace recording** (`npm run test:e2e:trace`, then `npm run test:e2e:trace:open`): replays a run step by step in the WebdriverIO DevTools player. `npm run test:e2e:debug` opens the live dashboard instead. The debug config (`wdio.debug.conf.mts`) inlines Obsidian's `app://` stylesheets so the replay is styled; the normal run does not.

### Writing end-to-end tests

- **Assert every UI transition, not just the outcome.** Each time an action changes what is on screen — a modal opens, a menu appears, an input gets its value, a button enables, a chip is added, the table refreshes — add an assertion for that state before moving on. A recorded trace only gets a step (and a screenshot) per command or assertion, so an interaction without an assertion is invisible when someone replays the test. `test/specs/operations.e2e.ts` shows the pattern: `expectModal(title)` after every dialog opens, `toBeDisabled`/`toBeEnabled` around the type-to-confirm ritual, chip counts after each edit, and the exact list of table rows after the run.
- **Positive matchers only.** The trace recorder renders a negated matcher (`.not.toHaveText(...)`) as a failed step even when it passed (verified: a `.not` assertion mid-test, far from any reset, is labelled `ERROR`). Say what the UI _is_ instead: the exact ordered list of rows, the exact value, the enabled state.
- **Single-element matchers only.** Assertions on element arrays (`expect($$(...)).toHaveText([...])`) run fine but the recorder does not capture them at all. To assert a list, assert `toHaveChildren(n)` on the container and one `toHaveText` per row by position (see `expectTaskNames` / `expectRow` in the operations spec).
- **Value checks are invisible unless they go through `node:assert`.** `expect(string).toBe(...)` on data read from the vault produces no trace step; the recorder captures `node:assert` and element matchers only.
- **Assert the numbers that prove the rule.** When an operation has a non-obvious effect (clock union making a merge total 1h 45m instead of 2h), assert that value through the UI and explain the arithmetic in a comment.
- **The fixture vault must keep `nativeMenus: false`** (`test/vaults/daily/.obsidian/app.json`): Obsidian's native macOS menus do not exist in the DOM, so WebDriver cannot open the row menus without it.
- **Reset in `beforeEach`, expect the last frame to lie.** `obsidianPage.resetVault()` runs before each test and is not a recorded command, so the screenshot of a test's final step may already show the restored vault. That is snapshot latency, not a failing assertion.
- Real Obsidian windows open during a local run; keep hands off the keyboard for the few seconds it takes.

## References

- Obsidian API: https://docs.obsidian.md
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Developer policies: https://docs.obsidian.md/Developer+policies
- wdio-obsidian-service: https://github.com/jesse-r-s-hines/wdio-obsidian-service
