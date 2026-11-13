# Task Time Tracker

An [Obsidian](https://obsidian.md) plugin to track the time you spend on your tasks directly in your daily notes, and to build statistics out of that data.

Everything is stored as plain text in your daily notes: a task is a checkbox line with tags, and every work session is a `[clock::start--end]` line under it. No database, no external service, and the data stays readable and editable by hand.

> **Status:** early development. Tracking commands, the daily view and the `task-stats` range statistics work. See [PLAN.md](PLAN.md) for the roadmap.

## The daily note format

```markdown
---
day_start: 2026-08-16T07:12:00
day_end: 2026-08-16T23:40:00
---

- [ ] Write obsidian plugin #project #selfDev
      [clock::2026-08-16T09:00:00--2026-08-16T10:15:00]
      [clock::2026-08-16T14:00:00]
- [x] Walk the dog #routine
      [clock::2026-08-16T08:00:00--2026-08-16T08:30:00]
- [ ] Interruption
```

- A **task** is a top-level checkbox line: `- [ ]` / `- [x]`, followed by the task name and any number of `#tags`.
- A **clock line** is an indented `[clock::START]` (running) or `[clock::START--END]` (finished) line right below its task. Timestamps are local `YYYY-MM-DDTHH:mm:ss`.
- A task can have several clock lines (several sessions in a day). Several tasks can be running at the same time; overlapping time is detected in the statistics.
- `day_start` and `day_end` frontmatter properties bound the "loggable" part of the day (waking hours, a work day…) and are used for off-time / unlogged-time statistics.
- The plugin only looks at files inside the configured daily notes folder whose name matches the configured date format (defaults: vault root, `YYYY-MM-DD`, same as the core Daily Notes plugin).

## Tracking commands

All commands act on the daily note you are currently in, or on today's daily note if the active file is not a daily note. Task pickers use Obsidian's fuzzy search and sort running tasks first, then unticked, then most recently worked on. Below the note's tasks they list the tasks of every other daily note (picking one adds it to the note), and last they offer to create the task you typed.

| Command                    | What it does                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Toggle task                | Pick a task; starts a clock on it if it is off, closes the running clock if it is on.                                                                                    |
| Toggle task from…          | Same, but asks when the toggle happened: a time of day (`14:30`) or minutes ago (`15`; negative for later).                                                              |
| Toggle task from last      | Same, but the toggle happens at the moment the last finished task ended (no gap between tasks).                                                                          |
| Toggle and tick task       | Toggle, and mark the task as done (`- [x]`).                                                                                                                             |
| Toggle and tick task from… | Toggle and tick, at a chosen time in the past.                                                                                                                           |
| Switch task                | Close every running clock and start the picked task.                                                                                                                     |
| Switch task from…          | Switch, at a chosen time in the past.                                                                                                                                    |
| Switch and tick task       | Close and tick every running task, then start the picked one.                                                                                                            |
| Switch and tick task from… | Same, at a chosen time in the past.                                                                                                                                      |
| Switch to previous task(s) | Close every running clock and restart the task(s) that ended last.                                                                                                       |
| Log interruption from…     | "I was interrupted at 14:30 (or N minutes ago) by X": switch to X at that time, then switch back to what was running before.                                             |
| Toggle interruption        | Start the `Interruption` task; run again to stop it and pick which task the time actually belongs to. The tracker tab lists that task only while it runs.                |
| Migrate current task       | Move the running clock line to another task (you clocked the wrong task), asking which one when several run.                                                             |
| Set task duration          | For a running task, close its clock so that the session lasted the given number of minutes.                                                                              |
| Plan a task                | Add a task from another daily note, or a new one, to the note without starting it.                                                                                       |
| Set start of day           | Set the `day_start` property: a time of day (07:30) or minutes ago (15).                                                                                                 |
| Set end of day             | Set the `day_end` property: a time of day (23:30, or 00:30 for the next day when before the start of day) or minutes ago.                                                |
| End day                    | End-of-day cleanup: ask for the end of day when it is missing, close still-running clocks at it, tick every task that has a clock, remove tasks that were never clocked. |

In the daily view's tracker tab, each row's ⋯ menu runs these actions on that task directly: for a running task, stop it when the last task ended, change its start, set its stop time or duration, migrate its clock, show the task or clock line, show the task in the task manager, delete the clock or the task; for an idle one, start it from when the last task ended, migrate its last clock, move it up, down, to the top or bottom of its list, show it in the note or the task manager, delete its last clock or the task. Deleting a task there removes it from that note only.

Commands ship without default hotkeys; assign your own in Obsidian's Hotkeys settings. On mobile, each command has an icon for the toolbar.

## Statistics

### Daily view

A side panel (ribbon icon or command "Open daily view") that follows the daily note you are looking at and shows:

- loggable time (start → end of day), total logged, remaining, off time, unlogged so far;
- tasks by time spent;
- tags by time spent.

### Range statistics

A `task-stats` code block renders statistics for a date range inside any note, so a weekly or monthly review template can embed its own charts. All options are optional; invalid ones are listed in an error box in the note.

````markdown
```task-stats
range: last-7-days      # today | yesterday | this-week | last-week | this-month | last-month | this-year | last-year | all | last-N-days/weeks/months/years (any N) | 2026-08-01..2026-08-16
groupBy: tag            # task (default) | tag | filter (one entry per filter item; requires a filter)
filter: ["#project"]    # only these task names / #tags
metrics: [total, average, per-day, time-of-day]   # default: all
skipEmptyDays: true     # average only over days where something was logged
top: 5                  # keep the N biggest entries, fold the rest into "Other"
```
````

The metrics:

- **total**: total time over the range, plus a table of tasks (or tags) with time spent and share.
- **average**: per-day average, or per-logged-day with `skipEmptyDays`.
- **per-day**: a stacked bar chart, one bar per calendar day, colored by task/tag with the theme's colors; hover a bar for the full date and its per-task breakdown. A plain per-day table sits underneath, collapsed.
- **time-of-day**: average off time, unlogged time (time within the day with no clock running, always computed from all tasks even with a `filter`), start and end of day.

Weeks start on Monday. The `all` range starts at your oldest daily note. Everything refreshes live when a note changes.

Arrows next to the rendered date range step to the previous or next period (a month for `this-month`, 7 days for `last-7-days`, …), never into the future. The navigation is view-only: the block's `range` is untouched and a re-render starts back at it.

## Settings

- The daily notes folder and date format are inherited from the core Daily notes plugin.
- Tag mapping: for each tag, an emoji shown in pickers.
- An Apply button reloads the open views after changing settings.

## Development

```bash
npm install
npm run dev      # watch build to main.js
npm run build    # type-check + production build
npm run lint
npm test
```

Clone the repository into `<vault>/.obsidian/plugins/obsidian-task-time-tracker`, run `npm run dev`, then enable the plugin in Obsidian and reload it after changes.

Stack: TypeScript, Svelte 5 for views, esbuild, Vitest for the pure logic (parser, interval math, aggregation, range resolution).

### End-to-end tests

The end-to-end suite drives a real Obsidian against the fixture vault in `test/vaults/daily/`. Obsidian windows open during a run; keep your hands off the keyboard until they close.

```bash
npm run test:e2e              # run the whole suite
npm run test:e2e:trace        # run it and record a trace
npm run test:e2e:trace:open   # replay the latest trace step by step
npm run test:e2e:debug        # run it with the live DevTools dashboard open
```

To watch a test step by step, record a trace and then open it. The player shows one step per command or assertion, with the page rebuilt from the recorded DOM at that moment. Traces are written to `test-results/trace-<session>.zip` (gitignored); `test:e2e:trace:open` opens the most recent one, and `npm run test:e2e:trace:open -- <file>` opens any other.

The player cannot rebuild the page once a test edits a note in the editor (the preview goes blank from that step on), so for those runs `test:e2e:trace:open` shows the screenshot taken at each step instead. Opening such a trace directly with `npx show-trace` gives the blank preview.

Every script accepts a spec filter after `--`, which keeps the trace short:

```bash
npm run test:e2e:trace -- --spec test/specs/tracking.e2e.ts
```

[AGENTS.md](AGENTS.md) lists the rules for writing specs whose every step shows up in the trace.

## License

0-BSD, see [LICENSE](LICENSE).
