# MyTimeManager

A local, single-user task tracker in the spirit of Trello — drag & drop cards, a
backlog you pull from, and dedicated **day** and **week** planning views.

Everything lives in one JSON file on your machine. No account, no cloud, no
runtime dependencies beyond Node itself.

```
┌────────── Board ──────────┬── Week ──┬── Day ──┐   ┌── Backlog ──┐
│  To do │ In progress │ … │  Mon..Sun │  today  │   │ unscheduled │
└───────────────────────────┴──────────┴─────────┘   └─────────────┘
```

## Run it

```bash
npm start          # http://127.0.0.1:4321
npm run dev        # same, restarts on file changes
```

The server binds to loopback only. `PORT`, `HOST` and `MTM_DATA_DIR` override
the defaults.

## The four views

| View | What it shows | What a drag does |
| --- | --- | --- |
| **Board** | every task, grouped by workflow column | changes the column and the order inside it |
| **Week** | the seven days of the anchored week | reschedules the task to that day |
| **Day** | one day, split across the columns | pins the task to that day and column |
| **Stats** | what you have actually finished | — |

The **backlog** rail on the right holds everything without a date. Drag a card
out of it into a day to plan the work; drag one back to unschedule it.

A task therefore has two independent axes — a *column* (its workflow stage) and
a *date* (when you intend to do it, or nothing at all). Each axis keeps its own
sort key, so reordering your Tuesday never scrambles the "In progress" column.

## Keyboard

| Key | Action |
| --- | --- |
| `n` | new task |
| `/` | jump to the filter box |
| `1` `2` `3` `4` | board / week / day / stats |
| `t` | back to today |
| `←` `→` | previous / next day or week |
| `Esc` | close the editor |

Click a card to open the editor (notes, priority, estimate, tags, date, column).
Double-click a column title to rename it; `×` in its header deletes it and moves
its cards to the first column.

## Metrics

Ticking a task off appends an entry to a **completion log** kept alongside the
tasks in the same file. The log is what the Stats tab reads, which matters for
one reason: it is independent of the board. Delete a finished card, clear out
last month, rename a column — the history still reads correctly, because each
entry copies the title, tags, column and estimate as they were at the moment you
finished.

Un-ticking a task retracts its most recent entry, so a misclick leaves no trace.

The tab shows completions today / this week / this month / all time, your
current and best daily streak, median turnaround from creating a task to
finishing it, completions per day over 30, 90 or 365 days, which weekday you
actually get things done, and breakdowns by tag and by column — plus a table of
the most recent completions, so every number is readable without hovering a
chart.

Each chart plots one series, so there is one colour — the theme's accent — and
no legend to decode.

## Themes

Three palettes, picked from the dropdown in the top bar:

| Theme | Looks like |
| --- | --- |
| **Midnight** | the default — slate blue, dark |
| **Daylight** | paper white, for a lit room |
| **Solarized** | the classic warm dark palette, amber accent |

The choice is saved to `settings.theme` in the board file rather than to browser
storage, so it travels with your data instead of with the browser you happened
to use. Every rule in `styles.css` reads CSS variables only, so a new theme is a
token block plus one entry in `THEMES` in `server/storage.js`.

## Your data

Everything is stored in `data/board.json`, which is git-ignored:

```json
{
  "version": 1,
  "settings": { "weekStartsOn": 1, "title": "MyTimeManager", "theme": "dark" },
  "columns": [{ "id": "todo", "title": "To do", "order": 0 }],
  "tasks": [
    {
      "id": "8f3a1c02",
      "title": "Write the quarterly notes",
      "notes": "",
      "columnId": "todo",
      "date": "2026-09-08",
      "order": 0,
      "dayOrder": 2,
      "priority": "high",
      "tags": ["writing"],
      "estimate": 45,
      "done": false,
      "createdAt": "…",
      "updatedAt": "…",
      "completedAt": null
    }
  ],
  "history": [
    {
      "id": "b1c9f004",
      "taskId": "8f3a1c02",
      "title": "Write the quarterly notes",
      "tags": ["writing"],
      "columnId": "done",
      "columnTitle": "Done",
      "estimate": 45,
      "plannedFor": "2026-09-08",
      "createdAt": "…",
      "completedAt": "…"
    }
  ]
}
```

`date: null` means the task sits in the backlog, and `history` is the completion
log described above — append-only in practice, and safe to trim by hand if you
ever want to reset the metrics. Writes go to a temp file and
are then renamed over the original, so an interrupted save can never leave you
with a half-written board. A file that fails to parse is moved aside rather than
overwritten. Editing the JSON by hand is fine — missing fields are filled in on
the next read. Back it up by copying the file.

## API

The UI talks to a small JSON API; every mutation answers with the full board.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/board` | the whole board |
| `POST` | `/api/tasks` | create a task |
| `PATCH` | `/api/tasks/:id` | edit fields |
| `DELETE` | `/api/tasks/:id` | delete a task |
| `POST` | `/api/tasks/:id/move` | `{ columnId?, date?, index, scope }` — reorder / reschedule |
| `POST` `PATCH` `DELETE` | `/api/columns[/:id]` | manage columns |
| `PATCH` | `/api/settings` | `{ theme?, weekStartsOn?, title? }` |
| `GET` | `/api/stats?days=30` | aggregated completion metrics |

## Layout

```
server/    storage.js  atomic JSON persistence, serialized writes
           stats.js    completion metrics, computed in local days
           api.js      REST routes
           static.js   public/ file serving
           index.js    entry point
public/    app.js      state, board view, chrome wiring
           views.js    week and day views
           stats.js    metrics dashboard
           dnd.js      drag & drop
           editor.js   task dialog
           dates.js    local-date helpers
```

## License

MIT — it's yours.
