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
- Picker keeps stock `FuzzySuggestModal`: `getItems()` = note tasks (current sort) + full deduped vault index (note entry wins); `limit` = note-task count + 50 caps rendering only — typing fuzzy-searches the whole index. Revised 2026-09-05: while typing, the matching note tasks come first (fuzzy order), then the matching vault tasks — today's tasks are what the user most likely means. Vault entries default-ordered by usage count desc, labeled with most-recent tags for the emoji.
- Picking a vault task not in the note inserts its line (after the last task line, end of file if none; unticked; most-recent tags) into the shared `TaskNote` inside the `Prompts.pickTask` wrapper — the toggle engine stays untouched. Scope: main toggle/switch picker and migrate/interruption target; not set-duration (running tasks only). `Prompts.pickTask` grows an option to include/exclude the vault section.
- Create-from-text row: shown last and visually distinct whenever the trimmed, tag-stripped query doesn't case-insensitively equal an existing name; tags parsed from the typed text with the parser's `TAG` regex; no tags typed = bare line. Exact match on a hidden task resurfaces it instead of offering a duplicate. Identity/toggling stays case-sensitive; only the create-offer check is case-insensitive.
- Settings ship one picker knob only: a global "include vault tasks" toggle. Per-task hiding lives in the management panel; no recency-window setting.
- Task management UI is a dedicated large `Modal` (Svelte content), not a settings-embedded table. Entry points: command, button in a small settings section, button in the tracker tab. Table columns: color swatch (inline picker), name + most-recent tag chips, note count, total time, last used, warning icons, overflow menu (rename / retag / hide / delete). Sortable headers (default: count desc), text filter, warnings-only toggle, render capped at ~200 rows ("showing X of Y").
- Bulk rewrites use `vault.process` per file, only writing changed files, sequential with progress notice and end summary (failures reported, re-run is the recovery). Confirmation previews show index-derived blast radius; type-the-name ritual for delete and merge only; warning text mentions core File Recovery as the escape hatch — no custom undo.
- Rename and merge share one consolidation engine (rename = 1-source merge). Within a note, colliding lines consolidate: the target-name line survives (keeps position/tags), other lines' clocks move under it, ticked = OR. Per-line tags are kept — resulting tag drift is surfaced by the drift flag and fixed via retag. Clock union via `mergeIntervals` semantics (overlapping _and_ touching merge; zero-length dropped but counted in the preview); if any clock in a group is running, the merged clock keeps the earliest start and stays running.
- Merge UI: checkbox per row + "Merge N tasks…" button (≥2), survivor name chosen in the confirm modal (default: most used).
- Bulk selection (decided 2026-09-01): the header checkbox selects every matching task (the filtered set, not just the rendered cap), shift-click ticks the range since the last plain click in table order, and a selection bar offers merge, change tags, color, hide/show and delete over the selection. Deleting several tasks types the count instead of a name.
- Retag UI (decided 2026-09-01): a chip editor over the union of the task's tags, each chip showing its coverage (`7/12`) when not on every line. Apply means "every line gets exactly these tags" — the normalization that settles tag drift — in one confirmation and one run; disabled when no line would change.
- Sixth issue flag (decided 2026-09-05): a clock lying wholly before the note's wake time or wholly after its bed time is "outside the day" — by the plugin's own day definition it belongs to another note, or the times are wrong; jump-to-line is the only fix. A boundary that is not recorded is not checked (no calendar-day fallback), touching a boundary counts as inside, straddling clocks are left alone.
- Issue flags, computed on panel open from the index, thresholds fixed in v1: (1) name similarity — Damerau-Levenshtein on case-folded, whitespace-collapsed names, distance ≤ 1 under 6 chars else ≤ 2, length-diff ≤ 2 prefilter; similarity warning offers "merge these two". (2) duration outlier — session ≥ 16h always, or > 5× the task's median with ≥ 5 sessions; click jumps to the note line. (3) tag drift across occurrences. (4) same-task overlapping clocks (cross-task overlap is legitimate), with a one-click consolidation fix. (5) stale running clock in a non-today note.
- Colors: panel picker offers the 8 theme `--color-*` swatches plus free hex; the CSS string is stored, overriding `seriesColor` wherever a chart key is a task name. Uncolored tasks keep the rank cycle; collisions accepted in v1. Tag colors deferred (future `color` field on tag mappings — see Later).
- Plugin CSS is static (decided 2026-09-04): `src/styles.css` is imported by `main.ts` and bundled with the Svelte component styles (`css: 'external'`) into the generated, gitignored `styles.css` — what Obsidian's guidelines ask for, and the only CSS the trace player can replay reliably (runtime-injected styles were captured inconsistently).
- E2E debugging (decided 2026-09-04): `@wdio/devtools-service` behind `wdio.debug.conf.mts` — `npm run test:e2e:debug` opens the live DevTools dashboard during the run, `npm run test:e2e:trace` writes `test-results/trace-*.zip` and `npm run test:e2e:trace:open` replays the latest one step by step (DOM time travel, per-command screenshots). `browser.debug()` remains the ad-hoc breakpoint. The normal `test:e2e` stays lean.
- End-to-end tests (decided 2026-08-31): adopt `wdio-obsidian-service` starting with phase 7 — the bulk operations are the first features that can corrupt notes, so each one gets an E2E test running it against a fixture vault and diffing the resulting markdown. Coverage then grows with each phase; earlier features (picker, panel) get E2E tests opportunistically, not retroactively as a blocker.

## Decisions (2026-11-10): notes changing underneath the commands

- **Commands act on what the editor shows.** An open editor saves two seconds after the last change, so a command reading the file right after an edit or an undo saw the previous state, and its write discarded the edit. Tracking commands, tick/untick and Complete journal now save the note's editors first, but only when the user edited after the file's mtime: an editor can also differ from the file because Obsidian has not refreshed it yet after an outside write, and saving that one would overwrite the write. User edits are logged by a CodeMirror update listener (`commands/userEdits.ts`); Obsidian's own reload carries the user event `set` and is excluded (observed on 1.15, undocumented).
- **Tracking writes are compare-and-swap with redo** (`core/trackingRun.ts`). The user can sit in a picker while a sync rewrites the note; the write only lands if the note still holds what was read, otherwise the steps are redone on the new content with the recorded prompt answers, without prompting again. Redo gives up with a notice (nothing written) when the answers no longer apply, in particular when the picked task was started or stopped elsewhere meanwhile, since toggling would then do the opposite of what was chosen.
  - _Amended 2026-11-12: the pickers follow the note live._ While a picker is open, every change of its note (daily log change event, re-read) recomputes the offered tasks through the engine's own filter (`PickTaskRequest.choices`), so a task started elsewhere shows ⏳ and moves up; the highlighted row stays on the same task (through `SuggestModal`'s undocumented `chooser`, guarded, falling back to the first row). A pick is a `TaskChoice` (name, tags, running state as shown), resolved against the note by the engine. When the note changed while a prompt was open, the run starts over on the new content with the answers so far and asks only the prompts not answered yet, instead of redoing on a pick made from a stale list. Notices are held back until the run ends, so only those of the run that counted are shown.
- **Lost clocks are detected and offered back, not prevented** (`core/lostClocks.ts`). The plugin cannot see the remote state, so a toggle on an outdated note is reconciled by the sync tool afterwards. Every daily note change is compared with the note's previously cached tasks: a clock whose time the same task no longer covers is lost (merged or closed clocks are not), unless the plugin wrote the change itself (writers acknowledge their content) or the user had an unsaved editor change. A sticky notice lists them with Restore/Dismiss; restoring re-adds the clocks and unions them (same engine as merge), so it is idempotent. Pending losses are kept per note until they come back, are restored or dismissed. Nothing is persisted: the detection only covers notes the plugin has loaded or written in this session.

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
- [x] E2E tests per operation: run rename/merge/delete/retag through the real UI on the fixture vault and assert the exact markdown of every touched note. (The fixture vault sets `nativeMenus: false`: Obsidian's native macOS menus are invisible to WebDriver.)

## Phase 8: Issue detection

- [x] Detectors in core (similarity, duration outlier, tag drift, same-task overlap, stale running clock); unit tests for thresholds.
- [x] Warning column UI: jump-to-line for clock issues, merge shortcut for similarity, one-click overlap consolidation, warnings-only filter.

## Phase 9: Warning dismissals

Decided 2026-09-05: the median-based long-session rule stays despite its false positives on genuine special days (a whole day cooking, a hike with the dog). Instead of tuning it, every warning becomes dismissable, and dismissals are remembered.

- [x] Settings: `ignoredIssueKinds: IssueKind[]` (a whole kind switched off) and `dismissedIssues: string[]` — a store of individual warnings the user dismissed. Keys must survive note edits: clock issues are keyed by kind + task name + note path + the clock's start timestamp (line indexes shift), similar-name by the sorted pair of names, tag-drift by name + the sorted tag-set signature. Rename/merge/delete migrate or drop name-keyed entries (`settingsMigration.ts`), like colors and hide flags.
- [x] Detector output filtered by both stores in core (`issues.ts`: pure, tested), so the panel and the "Issues only" facet only see live warnings.
- [x] Issue menu entries: "Ignore this warning" and "Ignore every <kind> warning"; the row icon disappears on the spot.
- [x] A way back: a settings section listing the switched-off kinds (toggles) and a "Forget dismissed warnings" button (with count); optionally a "Show ignored" toggle in the panel.
- [x] E2E: dismiss a warning through the menu, assert the icon is gone and the flag persisted; re-enable from settings.

## Decisions (2026-11-11): timeline tab

A day-calendar view of the note's clocks, where blocks are resized and moved like in a calendar app and every edit rewrites the clock line.

- **Tab:** `Tracker | Timeline | Stats`, a new `'timeline'` value of `DailyViewTab` (remembered by `lastDailyViewTab`). It follows the daily view's note (previous/next/Today), redraws on store changes and grows the running block on the existing per-minute tick.
- **One block per clock line**, never merged. A block is identified by task name + the clock's start timestamp at the time it was read (line indexes shift, like dismissed-issue keys). One edit rewrites exactly one line.
- **Axis:** the note's day 00:00–24:00, stretched to include any clock or bed time beyond it, at most one day either way (a mistyped date would otherwise stretch it over months; blocks are clipped to it). The tab content scrolls under the note navigation and the tabs, which stay in place (all tabs, decided while building); on open each note is fitted to its day as the Fit button does, without saving that zoom (setting `timelineFitOnOpen`, on by default, added 2026-11-12); turned off, or with nothing to fit, it opens at the saved zoom scrolled to now (today's note), else the wake time, else the first clock. Wake and bed are drawn as lines with the span between them shaded.
- **Snapping:** step follows the zoom (15 / 5 / 1 min at fixed thresholds); a dragged edge lands on whole minutes. Magnet: within a few pixels a dragged edge sticks exactly to another block's edge, now, the wake line or the bed line. Alt disables all snapping (1-min moves). Untouched edges keep their seconds; a move keeps the duration to the second. A block never shrinks below one snap step (no zero-length clocks).
- **Running clocks:** the start edge is draggable, never past now, and the clock keeps running. Moving the block or dragging its end finishes it (changed 2026-11-12, was start only): it counts as ending now, a move keeps the duration so far, and the end lands where dropped; anything that would end at now or later leaves it running as it was. On a past note "now" is the end of the axis, so a clock left running there can be finished by pulling its end back onto the day. Styled as running (dashed/pulsing bottom edge).
- **Same-task overlap on drop is allowed:** both blocks get a warning outline and the existing overlap issue (with its consolidation fix) reports it. Cross-task overlap is normal and shares the width.
- **Layout (pure, in core):** overlap clusters (touching is not overlap), blocks sorted by start then longest first, greedy leftmost free column, each block expands right over columns free for its whole span. While dragging, the block floats as a ghost and the others stay put; the layout reflows on drop.
- **Write path:** on pointer up only, working from the drag-start snapshot. Re-read, find the clock by identity, rewrite that one line compare-and-swap (retry on change); if the clock is gone, notify "The clock changed elsewhere, nothing was written." and redraw. The write is acknowledged to `LostClockTracker`, or shrinking would be reported as a lost clock.
- **Undo:** every drop saves at once and shows a notice (`Deep work 09:00–10:30 → 09:15–10:30`) with an Undo button, which writes the previous line back through the same path (found by its new identity). Covers the latest edit only.
- **Zoom:** pinch / Ctrl-or-Cmd + wheel anchored on the time under the pointer, plus a toolbar with −, + and Fit (fit wake→bed, else first→last clock; a bed time still ahead of now fits wake→last clock instead, now while one runs or when none is logged, changed 2026-11-12). Continuous from ~30 to ~600 px per hour. Saved as `timelineZoom` in settings; scroll position is not saved.
- **Block content:** tag emojis + name, then `09:15–10:30 · 1h 15m`, dropping duration then range as the block shrinks (color only when tiny); full text in a hover tooltip. Color: `taskColors[name]`, else the theme accent (`--interactive-accent`), not the stats tab's rank cycle: ranks follow time worked, so a block changed color while its clock was dragged (changed 2026-11-11 after trying it); tinted fill with a solid left border.
- **Click** (no movement past a few pixels; a tap on touch, a right-click, Enter or Space) opens the block menu (changed 2026-11-12, was a jump to the line): Go to clock line; Remove end time, the clock running again, offered on the task's latest clock only and while none of its clocks runs (an earlier clock running to now would cover the later ones); Delete clock line, keeping the task line. Both edits offer Undo; undoing a delete puts the clock back in time order among the task's clocks.
- **Drawing a block** (added 2026-11-11): a drag over empty lane space (a long press first on touch) draws a new clock, both ends snapped like an edge drag, at least one step long and never past now. On release the task picker opens (note tasks, then vault tasks, or create from the typed text) with the range as placeholder; dismissing it draws nothing. The clock line goes among that task's clocks in start order; a missing task line is added after the last task. Undo removes the clock, and the task line too when the draw added it and it holds no other clock. No keyboard path: clocks can be added from the tracker tab.
- **Touch:** pointer events only. A swipe scrolls; a ~400 ms long-press selects a block (haptic where available, outline) and enlarges its handles to finger size, then the finger moves or resizes it; a tap jumps to the line. The plugin is not desktop-only.
- **Keyboard:** each block is a focusable button labelled `<task>, <start> to <end>`, tabbed in time order; Enter jumps to the line; ↑/↓ moves by one snap step, Shift+↑/↓ the end edge, Alt+↑/↓ the start edge, same rules as the pointer. Key repeats are debounced into one write and one notice.

## Phase 10: Timeline tab

- [x] Core, tested: timeline layout (clusters, columns, expand-right), axis bounds (stretch past midnight, initial scroll target), snapping (zoom step thresholds, magnet targets, Alt bypass, minimum length, running-clock limits), block identity and the one-line clock rewrite.
- [x] Write path: compare-and-swap rewrite by identity, lost-clock acknowledgment, "clock changed elsewhere" notice, Undo notice for the latest edit.
- [x] `TimelineTab.svelte` + third tab and `'timeline'` in `DailyViewTab`: axis, wake/bed lines, blocks with colors and adaptive labels, running block, same-task overlap outline, click to jump.
- [x] Pointer interactions: move and edge resize with ghost, long-press on touch with enlarged handles.
- [x] Try the long-press drag on a real touch device (iPad/phone); only the mouse path is covered by E2E.
- [x] Zoom: gestures anchored on the pointer, −/+/Fit toolbar, `timelineZoom` setting.
- [x] Block menu on click: go to the line, remove the end time, delete the clock line (with Undo); E2E for delete + Undo and remove end.
- [x] Open each note fitted to its day ("Open fitted to the day" setting, on by default); E2E checks the fitted view.
- [x] Keyboard: focusable blocks, arrow-key move/resize, debounced writes.
- [x] E2E: keyboard move, end resize, start resize on a running clock, finishing a running clock, Undo, zoom to a finer step, asserting the exact markdown after each; one real pointer drag (move + resize).
- [x] Draw a block on empty space, pick its task, insert the clock in time order (new task line when needed), Undo; unit-tested in core, E2E for an existing and a new task.

## Decisions (2026-11-12): tracker tab redesign

The tracker tab becomes the beginner's starting point: one obvious place to type, one visible action per row, no hidden modes. Mockups of every state: the "Tracker tab redesign" design canvas (https://claude.ai/artifact/GVwSxzosQCKVzpVZAZvcN2, private).

- **Layout, top to bottom:** _doing_ (bar, Interruption, ⚡ quick-action chips), _Now_ (running tasks), _plan_ (task list), then End day at the bottom. Day status (wake/bed) sits under the date navigation; admin (Manage tasks, rarely used actions) moves to a ⋯ menu in the header.
- **The bar** is an in-view text field with type-ahead, not a button opening the picker modal. Built as the plugin's own combobox (`TaskBar.svelte`, suggestions from `barSuggestions` in core) rather than `AbstractInputSuggest`, changed while building (2026-11-12): Obsidian's suggesters render a flat list, and the group headers and the Add to list button need their own rendering anyway; `minAppVersion` stays. Its suggestions are grouped under "Today" and "Other notes" headers, with a "running" label and note counts, then a "Create …" row carrying an Add to list button (the canvas's Typing board is the reference). Enter on an existing task starts it; on new text it adds `- [ ] text #tags` to the note and starts it; Add to list adds the line without starting it, offered only when the text names no existing task.
- **Starting switches.** Starting from the bar or a row's ▶ stops what runs. Running alongside is deliberate: the ＋ button, shown on the bar and on idle rows only while something runs (nothing running = a single ▶/Start, nothing to be alongside of). The bar's button reads Start, or Switch while something runs. No per-task "background" flag: the same task is sometimes main, sometimes background.
- **Interruption** stays a first-class button with icon and label next to the bar, shown pressed while one runs. It keeps today's engine behavior (verified in `toggle.ts`): it switches, so it stops every running task, a parallel one included, and ending it restarts every task stopped at that moment, then asks what it was. Since 2026-11-12 it adds the unassigned task to a note that lacks it (it used to fail with "Couldn't find"); once its time went to a real task, the empty line is not listed in the plan. Its Now card is amber, titled "Interruption", lists the paused tasks and carries End interruption as its main button.
- **Now card:** running tasks leave the list and get a card each: name, large elapsed time for the current session, "Started HH:MM" (clickable, see below) · day total, Done (stop and tick) and Stop. Two or more running: compact cards (icon buttons) and Stop all in the section header. Nothing running: the section is hidden. Changed 2026-11-13 (canvas board A): running tasks are rows as tall as the plan's, grouped under Now: dot, name, the session's elapsed time (clickable to change the start; its tooltip gives the start and the day total) and Done / Stop icon buttons, on a shaded background. The interruption is an orange row with End; its paused tasks say "paused" in the plan.
- **Rows:** checkbox on the left (mirrors `- [ ]`; ticking does not stop anything), name with tag emoji and text style, today's total when above 0, ▶ (and ＋ while something runs) on the right. Clicking the name reveals the task's line in the note, it never starts a timer. Open tasks in the note's order; ticked ones in a collapsed "Done (n)" group. Rows keep a 44px minimum height (decided after review); changed 2026-11-13: 32px with 28px icon buttons on desktop, 44px kept on mobile (`body.is-mobile`).
- **No "Custom time" mode; times are fixed afterwards.** "Started HH:MM" opens a time prompt and moves the running clock's start through the timeline's compare-and-swap rewrite (with its Undo); changed while building (2026-11-12): `setDuration` closes the clock, so it was the wrong path, and typing the time it started reads better than "how many minutes ago". After a stop or switch from the tab, one notice reads "Stopped X at HH:MM" or "Switched from X to Y at HH:MM" with Change (the engine's per-clock "toggled" notices are left out), and Change moves the whole hand-off: the stopped clocks' end and the started ones' start (`core/handOff.ts`). Times are typed as HH:MM (`core/typedTime.ts`, shared with the overnight Stop at…). Older edits stay in the Timeline tab.
- **Day status line:** ☀ wake · 🌙 bed, each value clickable (existing time prompt). Unset wake time on today's note shows "Set wake time" in the accent color; unset bed time shows "Set bed time" in muted text (always discoverable, never competing with the wake reminder).
- **End day** replaces Complete journal: prompts for bed time when it is missing (default now), then runs the existing cleanup; its confirmation states what will happen, including the deletion of never-clocked tasks.
- **Which day the tab acts on:**
  - No note for today: the tab shows today, and its first write creates today's note (`createDailyNote`), never writing into the latest earlier note as `resolveTargetFile` does now.
  - A clock still running in the latest earlier note: a "Still running from yesterday" card with "Since <day> HH:MM", Stop at <that day's bed time> (when set) and Stop at…. Such a clock does not count as running for the bar: it keeps Start, since a switch would close it at now.
  - A past note (via ‹ ›): everything works, under a "You're viewing <day> · Back to today" strip; the bar's placeholder reads "Add a task to <day>". Changed 2026-11-13: the strip shows on every tab, not only the tracker, and replaces the Today button of the date navigation, which is gone.
  - ~~Daily notes not set up: one sentence and a Create today's note button instead of "No daily note to act on."~~ Dropped while building (2026-11-12): with the core plugin's defaults there is always a today's note to target, so this case cannot happen.
- **Empty state:** below the bar, "Type what you're working on and press Start. Tasks are saved as `- [ ]` lines in today's note." Gone once the note has a task.
- Decision logic (target day, which buttons a row shows, ordering, End day's confirmation text) lives in core with unit tests; components only render.

## Phase 11: Tracker tab redesign

Day handling ships first: writing into yesterday's note and invisible overnight clocks give wrong data today, whatever the layout.

- [x] Target day in core: today's note created on first write instead of falling back to the latest note; past-note detection for the strip and placeholder; tested.
- [x] Overnight clocks: find a clock still running in the latest earlier note (one cached read through `DailyLogStore`), its card with Stop at bed time / Stop at…, kept out of the bar's switch logic; tested in core, E2E stopping one at bed time.
- [x] Past-day strip with Back to today. No separate setup state: the core plugin's defaults always name today's note, so the tab shows today's empty plan and the first write creates it.
- [x] Bar: in-view combobox with grouped suggestions, Start/Switch, ＋ alongside (Ctrl/Cmd+Enter), Add to list on the create row; empty-state line.
- [x] Switch by default from the bar and the rows; ＋ alongside only while something runs; row order and button set decided in core, tested.
- [x] Now card: elapsed session + day total, Done / Stop, compact cards and Stop all from two running tasks, hidden when nothing runs; Interruption card with paused tasks and End interruption.
- [x] Rows: checkbox left, name reveals the line, note order, collapsed Done group.
- [x] Day status line (wake/bed values, wake reminder, muted Set bed time), End day (bed-time prompt + cleanup + confirmation text from core), ⋯ header menu with Manage tasks, quick actions as chips.
- [x] Fixing afterwards: clickable "Started HH:MM" moving the running clock's start; Change in the stop/switch notice moving the hand-off (compare-and-swap, acknowledged to `LostClockTracker`); Custom time checkbox removed.
- [x] E2E for every slice, rewriting the tracker-tab specs: switch, alongside, interruption with a parallel task, Done, Add to list, End day, overnight stop, Change after a switch, moving a start (`dailyTarget.e2e.ts`, `tracker.e2e.ts`).
- [x] Give the picker modal (`TaskSuggestModal`) the same grouped look as the bar's suggestions (headers, running label, note counts, Add to list), so both stay consistent. Headings are inserted between the rows, outside them, so they are never highlighted or chosen (`groupBreaks` in core); the note's heading is its day (`Today`, `Monday`…), in the bar too. Add to list is only on the pickers that start a task (`offersPlan`), and closes the picker as dismissed.

## Later

- [ ] ~~Native task-name completion from past daily notes (replaces `syncTaskDictionary.js` + Various Complements).~~ Superseded by Phase 5.
- [ ] Inherit folder/date format from the core Daily Notes plugin.
- [ ] Project objective view (from the commented `initProjectTracking`: target time vs. worked, balance).
- [ ] Clocks spanning midnight / previous-day time travel.
- [ ] Charts: tooltips, donut for tag share, if needed.
- [ ] Release pipeline: build `main.js` in CI, GitHub release, community plugin submission.
- [ ] Improve the daily view's tag legend (currently a plain list of styled tag names; needs a clearer layout/design).
- [ ] Add a custom color per tag mapping in the settings, used in the legend (and by extension in table rows / charts).
