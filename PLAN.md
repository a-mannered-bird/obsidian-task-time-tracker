# Plan

Roadmap and todo lists for the Task Time Tracker plugin. Decisions recorded here were taken on 2026-08-16; update the checkboxes as work lands.

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

- [ ] `resolveTargetFile(app, config)` in `core/dailyNotes.ts` (active daily note or today's), `getLastEnd(task)` in `core/note.ts`, `addMinutes` in `core/time.ts` (removed from Phase 1 as unused until here).
- [ ] `src/commands/toggleTasks.ts`: port of the script engine with typed options `{ taskName?, isSwitching, isTicking, isTimeTravelling, fromLastTask, isQuickInterruption, isMigrating, taskValue?, isTaskDuration }`, plus the Notice messages.
- [ ] `src/ui/TaskSuggestModal.ts` (FuzzySuggestModal, ordering: running → unticked → last ended, emoji prefixes from tag mapping) and `src/ui/MinutesPromptModal.ts`.
- [ ] Register commands: Toggle task; Toggle task from…; Toggle task from last; Toggle and tick; Toggle and tick from…; Switch task; Switch task from…; Switch and tick; Switch and tick from…; Switch to previous; Log interruption from…; Toggle quick interruption; Migrate current task; Set task duration.
- [ ] `src/commands/frontmatterTime.ts`: Set wake time (offset default -3), Set bed time, via `processFrontMatter`.
- [ ] `src/commands/completeJournal.ts`: close open clocks at bed time, tick clocked tasks, remove unclocked tasks, confirm modal listing removals.
- [ ] Unit tests on the serializer-level effects of each option combination (start/stop/switch/tick/migrate/duration/previous).
- [ ] Manual check against the QuickAdd macros list; then remove those macros from the vault.

## Phase 3: Flexible statistics views

- [ ] `src/core/ranges.ts`: resolve range presets and `from..to` to `[start, end]` (Monday weeks); tests.
- [ ] `DailyLogStore.loadRange(from, to)`, `minutesByTask` in `core/aggregate.ts`, `coveredMinutes` / `overlappingMinutes` in `core/intervals.ts` (removed from Phase 1 as unused until here).
- [ ] `src/core/stats.ts`: total, per-day average (with/without empty days), per-day series by task/tag, time-of-day (sleep, unlogged, average wake/bed).
- [ ] `task-stats` code block processor (YAML params: `range`, `groupBy`, `filter`, `metrics`, `skipEmptyDays`) mounting a Svelte `StatsView`.
- [ ] Svelte chart components: `BarChart` (per day), `StackedBarChart` (per day by task/tag), horizontal bar list for totals; Obsidian CSS variables.
- [ ] Sidebar variant with range picker + group-by controls reusing `StatsView`.

## Phase 4: User-friendly command access

- [ ] Panel / ribbon menu with buttons calling the same `toggleTasks` core (current running tasks, one-click stop/switch, quick interruption).
- [ ] Per-task quick actions: settings list `{ name, taskName, options }`, each registered as an Obsidian command (replaces "Switch to Duolingo"-style macros); "Getting up" = quick action "toggle X on" + set wake time.

## Later

- [ ] Native task-name completion from past daily notes (replaces `syncTaskDictionary.js` + Various Complements).
- [ ] Inherit folder/date format from the core Daily Notes plugin.
- [ ] Project objective view (from the commented `initProjectTracking`: target time vs. worked, balance).
- [ ] Clocks spanning midnight / previous-day time travel.
- [ ] Charts: tooltips, donut for tag share, if needed.
- [ ] Release pipeline: build `main.js` in CI, GitHub release, community plugin submission.
- [ ] Improve the daily view's tag legend (currently a plain list of styled tag names; needs a clearer layout/design).
- [ ] Add a custom color per tag mapping in the settings, used in the legend (and by extension in table rows / charts).
