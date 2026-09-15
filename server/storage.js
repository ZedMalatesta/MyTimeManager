import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DATA_DIR = process.env.MTM_DATA_DIR
  ? path.resolve(process.env.MTM_DATA_DIR)
  : path.join(ROOT, 'data');

export const DATA_FILE = path.join(DATA_DIR, 'board.json');

export const SCHEMA_VERSION = 1;

export const newId = () => randomUUID().slice(0, 8);

/** Palettes defined in public/styles.css; the first one is the default. */
export const THEMES = ['dark', 'light', 'solarized'];

/**
 * The board a fresh install starts with. Columns model the workflow stage of a
 * task; scheduling (backlog vs. a specific day) is a separate axis stored on
 * the task itself as `date`.
 */
function seedBoard() {
  const now = new Date().toISOString();
  const columns = [
    { id: 'todo', title: 'To do', order: 0 },
    { id: 'doing', title: 'In progress', order: 1 },
    { id: 'blocked', title: 'Waiting', order: 2 },
    { id: 'done', title: 'Done', order: 3 },
  ];
  return {
    version: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    settings: { weekStartsOn: 1, title: 'MyTimeManager', theme: THEMES[0] },
    columns,
    tasks: [
      {
        id: newId(),
        title: 'Drag me to another column',
        notes: 'Cards move between columns, days and the backlog by dragging.',
        columnId: 'todo',
        date: null,
        order: 0,
        dayOrder: 0,
        priority: 'normal',
        tags: ['welcome'],
        estimate: 15,
        done: false,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      },
    ],
  };
}

/** Keeps hand-edited settings inside the range the UI can actually render. */
function normalizeSettings(settings, defaults) {
  return {
    ...settings,
    title: String(settings.title ?? defaults.title).slice(0, 80) || defaults.title,
    theme: THEMES.includes(settings.theme) ? settings.theme : defaults.theme,
    weekStartsOn: [0, 1].includes(settings.weekStartsOn) ? settings.weekStartsOn : defaults.weekStartsOn,
  };
}

/** Fills in anything a hand-edited or older board file is missing. */
export function normalize(board) {
  const base = seedBoard();
  const out = {
    version: SCHEMA_VERSION,
    createdAt: board?.createdAt ?? base.createdAt,
    updatedAt: board?.updatedAt ?? base.updatedAt,
    settings: normalizeSettings({ ...base.settings, ...(board?.settings ?? {}) }, base.settings),
    columns: Array.isArray(board?.columns) && board.columns.length ? board.columns : base.columns,
    tasks: Array.isArray(board?.tasks) ? board.tasks : [],
  };

  out.columns = out.columns.map((column, index) => ({
    id: String(column.id ?? newId()),
    title: String(column.title ?? 'Untitled'),
    order: Number.isFinite(column.order) ? column.order : index,
  }));

  const columnIds = new Set(out.columns.map((column) => column.id));
  const fallbackColumn = out.columns[0].id;

  out.tasks = out.tasks.map((task, index) => ({
    id: String(task.id ?? newId()),
    title: String(task.title ?? 'Untitled task'),
    notes: typeof task.notes === 'string' ? task.notes : '',
    columnId: columnIds.has(task.columnId) ? task.columnId : fallbackColumn,
    date: typeof task.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(task.date) ? task.date : null,
    order: Number.isFinite(task.order) ? task.order : index,
    dayOrder: Number.isFinite(task.dayOrder) ? task.dayOrder : index,
    priority: ['low', 'normal', 'high'].includes(task.priority) ? task.priority : 'normal',
    tags: Array.isArray(task.tags) ? task.tags.map(String) : [],
    estimate: Number.isFinite(task.estimate) ? task.estimate : null,
    done: Boolean(task.done),
    createdAt: task.createdAt ?? new Date().toISOString(),
    updatedAt: task.updatedAt ?? new Date().toISOString(),
    completedAt: task.completedAt ?? null,
  }));

  return out;
}

async function readBoard() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return normalize(JSON.parse(raw));
  } catch (error) {
    if (error.code === 'ENOENT') {
      const board = seedBoard();
      await writeBoard(board);
      return board;
    }
    if (error instanceof SyntaxError) {
      // Never destroy a file we cannot parse — park it and start clean.
      const parked = `${DATA_FILE}.corrupt-${Date.now()}`;
      await fs.rename(DATA_FILE, parked);
      console.warn(`board.json was unreadable, moved to ${parked}`);
      const board = seedBoard();
      await writeBoard(board);
      return board;
    }
    throw error;
  }
}

async function writeBoard(board) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(board, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, DATA_FILE); // atomic swap, so a crash can't truncate the board
}

// All mutations run one at a time; the UI fires bursts of reorder calls while
// dragging and a read-modify-write race would silently drop cards.
let queue = Promise.resolve();

function enqueue(job) {
  const run = queue.then(job, job); // a failed job must not stall the queue
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function load() {
  return enqueue(readBoard);
}

/**
 * Reads the board, hands it to `mutator`, then persists whatever comes back
 * (or the mutated draft, if the mutator returns nothing).
 */
export function update(mutator) {
  return enqueue(async () => {
    const board = await readBoard();
    const result = (await mutator(board)) ?? board;
    result.updatedAt = new Date().toISOString();
    await writeBoard(result);
    return result;
  });
}
