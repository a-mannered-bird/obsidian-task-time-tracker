# Plan

Roadmap and todo lists for the Task Time Tracker plugin. Decisions recorded here were taken on 2026-08-16 (phases 0–4) and 2026-08-30 (phases 5–8); update the checkboxes as work lands.

## Decisions

- The plugin owns the tracking commands (port of the `taskSwitcher.js` QuickAdd script), wake/bed time, and end-of-day cleanup. Task-dictionary sync (Various Complements) and per-task quick actions come later.
- Commands: one Obsidian command per flag combination actually used (hotkey-friendly), all thin wrappers over a single `toggleTasks(options)` core. A button panel on top of the same core is a later phase.
- Task picker: Obsidian `FuzzySuggestModal`; minutes prompts: small `Modal`. No dependency on QuickAdd.
- Tag → emoji / text-style mapping is one setting, replacing the hardcoded lists in `tracker.ts` and the emoji flags in the script.
- Target file: the active file if it is a daily note, otherwise today's daily note. Daily-note detection = plugin settings `dailyNotesFolder` (default: vault root, like the core Daily Notes plugin) + `dateFormat` (default `YYYY-MM-DD`). Inheriting from the core Daily Notes plugin is a follow-up.
- Wake/bed time via `app.fileManager.processFrontMatter`, property names configurable, wake offset default -3 min.
- "Getting up" macro is split: "Set wake time" is a pure command; the "also toggle task X" part becomes a per-task quick action later.
- "Complete journal entry": close still-open clocks (same timestamp as bed time), tick clocked tasks, remove unclocked ones, with a confirm modal listing what will be deleted.
- One shared data layer (`DailyLogStore.loadRange → DailyLog[]`, cached, invalidated on vault events) and one line-based parser used for both reading stats and rewriting the note. Prerequisite for the flexible views.
- Flexible views: `task-stats` code block first (saved view = code block in a note), sidebar controls later, both on the same Svelte components.
- Ranges: today, this week (Monday start), last 7 days, this month, last month, last 3 months, this year, last year, all, custom `from..to`.
- Group by: task name, tag. Metrics: total, per-day average (option to skip empty days), per-day breakdown as charts, time-of-day (sleep, unlogged, average wake and bed time). Loading a range also loads the day before `range.start` (previous bed time).
- Charts: hand-rolled SVG in Svelte, themed with Obsidian CSS variables. No chart library for now.
- Tests: Vitest on pure TS (parser, interval math, aggregation, range resolution). No component tests initially.
- Keep `main.js` out of git (already ignored); build in CI at release time.

## Phase 0: Housekeeping

- [x] Strip sample-plugin code from `src/main.ts` (sample commands, modal, status bar, interval, dom event) and `src/settings.ts`.
- [x] Move `MyView.ts` to `src/views/DailyView.ts`; rename `ExampleView` → `DailyItemView`.
- [x] Fix `manifest.json` (`author`, `id`/`name` consistency) and `versions.json`.
- [x] Add Vitest (`npm test`) and wire it into the GitHub workflow.
- [x] Settings: `dailyNotesFolder`, `dateFormat`, `wakeTimeProperty`, `bedTimeProperty`, `unassignedTaskName`, `tagMappings: { tag, emoji, bold, italic, underline }[]`.
- [x] Replace `boldTags` / `italicTags` / `underlineTags` in `tracker.ts` with the tag mapping setting.

## Phase 1: Core (parser + data layer)

- [x] `src/core/parser.ts`: line-based parser producing `Task { name, tags, ticked, lineIndex, clocks: Clock[] }` and `Clock { start, end, lineIndex }`; keeps line indexes so the same model can be written back. Replaces the `parseTasks` regex.
- [x] `src/core/note.ts`: `TaskNote` editor (start/stop clock, tick, move last clock line, remove task) rewriting lines and re-parsing, replacing the ad-hoc splices of the script.
- [x] `src/core/dailyNotes.ts` (moment from `obsidian`): `getDailyNotePath`, `getDailyNoteDate`, `isDailyNote`, `getDailyNoteFile`, `addDays`.
- [x] `src/core/dailyLogs.ts`: `DailyLogStore` with `loadByDate` / `loadFile` → `DailyLog { date, file, tasks, wakeTime, bedTime }`, cache keyed by path + mtime, refreshed on `metadataCache.changed`, dropped on delete/rename, `onChange` listeners; `refreshViews()` clears it.
- [x] Interval math in `src/core/intervals.ts`, aggregation in `src/core/aggregate.ts`, time helpers in `src/core/time.ts`, tag styles in `src/core/tags.ts`; `src/utils/` removed.
- [x] Unit tests: parser round-trip, note editor, intervals, aggregation, daily-note paths (`obsidian` aliased to `src/test/obsidian-mock.ts` in Vitest).
- [x] `DailyView.svelte` rewired on `DailyLogStore` (no `Journal` hardcode; live reload on note changes; `now` ticks every minute; running clocks count up to now; missing wake/bed/yesterday show `n/a`).

## Phase 2: Tracking commands

- [x] `resolveTargetFile` (`core/dailyNotes.ts`), `getLastEnd` (`core/note.ts`), `addMinutes` (`core/time.ts`) with tests.
- [x] `src/core/toggle.ts`: engine ported from the script with typed `ToggleOptions` (`taskName`, `previous`, `switch`, `tick`, `timeTravel`, `fromLastTask`, `targetState`, `interruption`, `migrate`, `setDuration`), user interaction behind a `Prompts` interface; 13 scripted tests.
- [x] `src/core/taskPicker.ts` (picker order + emoji labels, tested), `src/ui/TaskSuggestModal.ts` (FuzzySuggestModal), `src/ui/MinutesPromptModal.ts`, `src/ui/ConfirmModal.ts`.
- [x] `src/commands/tracking.ts`: 14 commands as `{ id, name, modifiers?, key?, steps }`; "Log interruption from…" = two engine runs. Default hotkeys built from the `defaultToggleHotkey` characters setting (one alternative per character; no default when `modifiers` is omitted).
- [x] `src/commands/frontmatterTime.ts`: Set wake time (default offset -3) / Set bed time via `processFrontMatter`.
- [x] `src/commands/completeJournal.ts` + `src/core/complete.ts` (tested): close running clocks at the bed time (or now), tick clocked tasks, delete unclocked ones after a confirm modal listing them.
- [x] `src/commands/target.ts`: shared target-file resolution + notice.
- [x] Manual check against the QuickAdd macros list; then remove those macros from the vault.

## Phase 3: Flexible statistics views

- [x] `src/core/ranges.ts`: resolve range presets (incl. `yesterday`, `last-week`) and `from..to` to `[start, end]` (Monday weeks); tests.
- [x] `DailyLogStore.loadRange(from, to)` + `earliestDate()` (walks only the daily notes folder; resolves the `all` preset), `minutesByTask` in `core/aggregate.ts`.
- [x] `src/core/stats.ts`: `computeRangeStats` — totals by key (zero keys omitted), per-day points (calendar-continuous), averages per day / per logged day, time-of-day (sleep, unlogged, wake/bed as minutes since midnight; always unfiltered); `core/loadRangeStats.ts` glue; tests.
- [x] `task-stats` code block processor (`core/statsOptions.ts` validation with per-key error messages rendered in the note) mounting `StatsView.svelte` via `MarkdownRenderChild`.
- [x] `StackedBarChart.svelte`: per-day stacked SVG bars (theme `--color-*` variables in a fixed order validated for color-vision separation on the default themes: blue, orange, purple, green, red, cyan, yellow, pink; >8 keys cycle the same order through deterministic color-mix variants toward the surface then the ink), hover tooltip with per-key breakdown, legend, HTML axis labels, per-day table kept as fallback under a details element.

## Phase 4: User-friendly command access

- [x] Daily view split into tabs (Tracker | Stats), last opened tab remembered (`lastDailyViewTab` in data.json), Tracker first by default; Stats = previous content (`DailyStats.svelte`).
- [x] `TrackerTab.svelte`: running tasks with live elapsed time and stop buttons, Switch… and Interruption/End interruption buttons, task list in picker order with click-to-toggle and tick/untick icons (`setTaskTicked`), footer with Set wake/bed time and Complete journal; all through the exported `runTrackingSteps`.
- [x] Quick actions: settings list `{ name, taskName, verb: toggle|switch|ensure-on|ensure-off, setWakeTime }` (`commands/quickActions.ts`), each registered as a command (`quick-action-<slug>`, restart to update) and shown as ⚡ buttons in the tracker tab; `setWakeTime` replaces the "Getting up" macro.

## Decisions (2026-08-30): vault-wide picker + task management

- Task identity stays **name-only**; tags remain per-line decoration and the markdown daily notes remain the single source of truth. No canonical task registry. Only data that cannot live in markdown goes to plugin settings: `name → color`, `name → hidden-from-picker`. Rename/merge must migrate these name-keyed entries (and `quickActions[].taskName`, `unassignedTaskName`).
- `VaultTaskIndex` on top of `DailyLogStore`: per-name aggregates (occurrence count, last-used date, most-recent tags, total minutes, occurrence locations). Built lazily on first use (picker or panel), updated incrementally via store events. Design target: 10k+ daily notes; while the first scan runs, the picker shows a loading row.
- Picker keeps stock `FuzzySuggestModal`: `getItems()` = note tasks (current sort) + full deduped vault index (note entry wins); `limit` = note-task count + 50 caps rendering only — typing fuzzy-searches the whole index, merged score ranking (no sections while typing). Vault entries default-ordered by usage count desc, labeled with most-recent tags for the emoji.
- Picking a vault task not in the note inserts its line (after the last task line, end of file if none; unticked; most-recent tags) into the shared `TaskNote` inside the `Prompts.pickTask` wrapper — the toggle engine stays untouched. Scope: main toggle/switch picker and migrate/interruption target; not set-duration (running tasks only). `Prompts.pickTask` grows an option to include/exclude the vault section.
- Create-from-text row: shown last and visually distinct whenever the trimmed, tag-stripped query doesn't case-insensitively equal an existing name; tags parsed from the typed text with the parser's `TAG` regex; no tags typed = bare line. Exact match on a hidden task resurfaces it instead of offering a duplicate. Identity/toggling stays case-sensitive; only the create-offer check is case-insensitive.
- Settings ship one picker knob only: a global "include vault tasks" toggle. Per-task hiding lives in the management panel; no recency-window setting.
- Task management UI is a dedicated large `Modal` (Svelte content), not a settings-embedded table. Entry points: command, button in a small settings section, button in the tracker tab. Table columns: color swatch (inline picker), name + most-recent tag chips, note count, total time, last used, warning icons, overflow menu (rename / retag / hide / delete). Sortable headers (default: count desc), text filter, warnings-only toggle, render capped at ~200 rows ("showing X of Y").
- Bulk rewrites use `vault.process` per file, only writing changed files, sequential with progress notice and end summary (failures reported, re-run is the recovery). Confirmation previews show index-derived blast radius; type-the-name ritual for delete and merge only; warning text mentions core File Recovery as the escape hatch — no custom undo.
- Rename and merge share one consolidation engine (rename = 1-source merge). Within a note, colliding lines consolidate: the target-name line survives (keeps position/tags), other lines' clocks move under it, ticked = OR. Per-line tags are kept — resulting tag drift is surfaced by the drift flag and fixed via retag. Clock union via `mergeIntervals` semantics (overlapping *and* touching merge; zero-length dropped but counted in the preview); if any clock in a group is running, the merged clock keeps the earliest start and stays running.
- Merge UI: checkbox per row + "Merge N tasks…" button (≥2), survivor name chosen in the confirm modal (default: most used).
- Retag UI (decided 2026-09-01): a chip editor over the union of the task's tags, each chip showing its coverage (`7/12`) when not on every line. Apply means "every line gets exactly these tags" — the normalization that settles tag drift — in one confirmation and one run; disabled when no line would change.
- Issue flags, computed on panel open from the index, thresholds fixed in v1: (1) name similarity — Damerau-Levenshtein on case-folded, whitespace-collapsed names, distance ≤ 1 under 6 chars else ≤ 2, length-diff ≤ 2 prefilter; similarity warning offers "merge these two". (2) duration outlier — session ≥ 16h always, or > 5× the task's median with ≥ 5 sessions; click jumps to the note line. (3) tag drift across occurrences. (4) same-task overlapping clocks (cross-task overlap is legitimate), with a one-click consolidation fix. (5) stale running clock in a non-today note.
- Colors: panel picker offers the 8 theme `--color-*` swatches plus free hex; the CSS string is stored, overriding `seriesColor` wherever a chart key is a task name. Uncolored tasks keep the rank cycle; collisions accepted in v1. Tag colors deferred (future `color` field on tag mappings — see Later).
- End-to-end tests (decided 2026-08-31): adopt `wdio-obsidian-service` starting with phase 7 — the bulk operations are the first features that can corrupt notes, so each one gets an E2E test running it against a fixture vault and diffing the resulting markdown. Coverage then grows with each phase; earlier features (picker, panel) get E2E tests opportunistically, not retroactively as a blocker.

## Phase 5: Vault-wide task picker

- [x] `src/core/vaultTaskIndex.ts`: lazy full scan over daily notes via `DailyLogStore`, incremental updates from store events, per-name aggregates + occurrence locations; unit tests.
- [x] Picker integration: vault entries in `TaskSuggestModal` (merged ranking, `limit` cap, dedupe, muted styling, loading row), insertion-on-pick via a new `TaskNote` insert helper, `Prompts.pickTask` option wiring (main + migrate pickers only), "include vault tasks" setting.
- [x] Create-from-text row (offer rule, last position, tag parsing; hidden-task resurfacing lands with the hide flags in phase 6).

## Phase 6: Task management panel (read-only + local state)

- [x] Management modal (Svelte): table with columns/sort/filter/cap as decided; entry points: command, settings button, tracker-tab button.
- [x] Color map (settings storage, swatch + hex picker, `seriesColor` override in stats views).
- [x] Hide-from-picker flags (settings storage, toggle in row menu, picker exclusion + resurface rule).

## Phase 7: Bulk operations

- [x] E2E harness: `wdio-obsidian-service` + fixture vault (a few daily notes covering tags, clocks, collisions), wired into `npm test`/CI as a separate script.
- [x] Consolidation engine in core (rename/merge line rewrite, within-note collision merge, clock union, OR-tick); heavy unit tests.
- [x] `vault.process` runner with progress, summary, failure report; index-derived preview counts.
- [x] Confirm modals (name-typing for delete/merge; light confirm for rename/retag; reference warnings for quick actions and the unassigned task).
- [x] Rename + merge actions (incl. name-keyed settings migration), then delete + retag (add/remove a tag across all occurrences, autocomplete that creates unknown tags).
- [ ] E2E tests per operation: run rename/merge/delete/retag through the real UI on the fixture vault and assert the exact markdown of every touched note.

## Phase 8: Issue detection

- [ ] Detectors in core (similarity, duration outlier, tag drift, same-task overlap, stale running clock); unit tests for thresholds.
- [ ] Warning column UI: jump-to-line for clock issues, merge shortcut for similarity, one-click overlap consolidation, warnings-only filter.

## Later

- [ ] ~~Native task-name completion from past daily notes (replaces `syncTaskDictionary.js` + Various Complements).~~ Superseded by Phase 5.
- [ ] Inherit folder/date format from the core Daily Notes plugin.
- [ ] Project objective view (from the commented `initProjectTracking`: target time vs. worked, balance).
- [ ] Clocks spanning midnight / previous-day time travel.
- [ ] Charts: tooltips, donut for tag share, if needed.
- [ ] Release pipeline: build `main.js` in CI, GitHub release, community plugin submission.
- [ ] Improve the daily view's tag legend (currently a plain list of styled tag names; needs a clearer layout/design).
- [ ] Add a custom color per tag mapping in the settings, used in the legend (and by extension in table rows / charts).
