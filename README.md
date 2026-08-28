# Task Time Tracker

An [Obsidian](https://obsidian.md) plugin to track the time you spend on your tasks directly in your daily notes, and to build statistics out of that data.

Everything is stored as plain text in your daily notes: a task is a checkbox line with tags, and every work session is a `[clock::start--end]` line under it. No database, no external service, and the data stays readable and editable by hand.

> **Status:** early development. Tracking commands, the daily view and the `task-stats` range statistics work. See [PLAN.md](PLAN.md) for the roadmap.

## The daily note format

```markdown
---
wake_time: 2026-08-16T07:12:00
bed_time: 2026-08-16T23:40:00
---

- [ ] Write obsidian plugin #project #selfDev
      [clock::2026-08-16T09:00:00--2026-08-16T10:15:00]
      [clock::2026-08-16T14:00:00]
- [x] Walk the dog #routine
      [clock::2026-08-16T08:00:00--2026-08-16T08:30:00]
- [ ] Unassigned
```

- A **task** is a top-level checkbox line: `- [ ]` / `- [x]`, followed by the task name and any number of `#tags`.
- A **clock line** is an indented `[clock::START]` (running) or `[clock::START--END]` (finished) line right below its task. Timestamps are local `YYYY-MM-DDTHH:mm:ss`.
- A task can have several clock lines (several sessions in a day). Several tasks can be running at the same time; overlapping time is detected in the statistics.
- `wake_time` and `bed_time` frontmatter properties bound the "loggable" part of the day and are used for sleep / unlogged-time statistics.
- The plugin only looks at files inside the configured daily notes folder whose name matches the configured date format (defaults: vault root, `YYYY-MM-DD`, same as the core Daily Notes plugin).

## Tracking commands

All commands act on the daily note you are currently in, or on today's daily note if the active file is not a daily note. Task pickers use Obsidian's fuzzy search and sort running tasks first, then unticked, then most recently worked on.

| Command                    | What it does                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Toggle task                | Pick a task; starts a clock on it if it is off, closes the running clock if it is on.                                   |
| Toggle task from…          | Same, but asks how many minutes ago (or ahead, with a negative value) the toggle happened.                              |
| Toggle task from last      | Same, but the toggle happens at the moment the last finished task ended (no gap between tasks).                         |
| Toggle and tick task       | Toggle, and mark the task as done (`- [x]`).                                                                            |
| Toggle and tick task from… | Toggle and tick, at a chosen time in the past.                                                                          |
| Switch task                | Close every running clock and start the picked task.                                                                    |
| Switch task from…          | Switch, at a chosen time in the past.                                                                                   |
| Switch and tick task       | Close and tick every running task, then start the picked one.                                                           |
| Switch and tick task from… | Same, at a chosen time in the past.                                                                                     |
| Switch to previous task(s) | Close every running clock and restart the task(s) that ended last.                                                      |
| Log interruption from…     | "I was interrupted N minutes ago by X": switch to X at that time, then switch back to what was running before.          |
| Toggle quick interruption  | Start the `Unassigned` task; run again to stop it and pick which task the time actually belongs to.                     |
| Migrate current task       | Move the running clock line to another task (you clocked the wrong task).                                               |
| Set task duration          | For a running task, close its clock so that the session lasted the given number of minutes.                             |
| Set wake time              | Set the `wake_time` property to now (with an optional minute offset, default -3).                                       |
| Set bed time               | Set the `bed_time` property to now (with an optional minute offset).                                                    |
| Complete journal entry     | End-of-day cleanup: close still-running clocks, tick every task that has a clock, remove tasks that were never clocked. |

Commands ship without default hotkeys; assign your own in Obsidian's Hotkeys settings. On mobile, each command has an icon for the toolbar.

## Statistics

### Daily view

A side panel (ribbon icon or command "Open daily view") that follows the daily note you are looking at and shows:

- loggable time (wake → bed), total logged, remaining, slept, unlogged so far;
- tasks by time spent;
- tags by time spent.

Rows are styled (bold / italic / underline / emoji) according to the tag mapping in the settings.

### Range statistics

A `task-stats` code block renders statistics for a date range inside any note, so a weekly or monthly review template can embed its own charts. All options are optional; invalid ones are listed in an error box in the note.

````markdown
```task-stats
range: last-7-days      # today | yesterday | this-week | last-week | this-month | last-month | this-year | last-year | all | last-N-days/weeks/months/years (any N) | 2026-08-01..2026-08-16
groupBy: tag            # task (default) | tag
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
- **time-of-day**: average sleep, unlogged time (awake time with no clock running, always computed from all tasks even with a `filter`), wake and bed times.

Weeks start on Monday. The `all` range starts at your oldest daily note. Everything refreshes live when a note changes.

## Settings

- The daily notes folder and date format are inherited from the core Daily notes plugin.
- Tag mapping: for each tag, an emoji shown in pickers and a text style (bold / italic / underline) used in the statistics tables.
- Frontmatter property names for wake and bed time.
- Name of the "unassigned" task used by quick interruptions.
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

## License

0-BSD, see [LICENSE](LICENSE).
