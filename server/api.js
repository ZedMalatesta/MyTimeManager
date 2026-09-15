import { THEMES, forgetCompletion, load, newId, recordCompletion, update } from './storage.js';

const MAX_BODY = 256 * 1024;
const PRIORITIES = ['low', 'normal', 'high'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        reject(new HttpError(400, 'Body must be JSON'));
      }
    });
    req.on('error', reject);
  });
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

const cleanDate = (value) => (typeof value === 'string' && DATE_RE.test(value) ? value : null);

function findTask(board, id) {
  const task = board.tasks.find((candidate) => candidate.id === id);
  if (!task) throw new HttpError(404, `No task ${id}`);
  return task;
}

/** Renumbers a group so its sort keys are a dense 0..n-1 run. */
function reindex(tasks, key) {
  tasks
    .slice()
    .sort((a, b) => a[key] - b[key])
    .forEach((task, index) => {
      task[key] = index;
    });
}

function applyTaskFields(task, patch, board) {
  if (typeof patch.title === 'string' && patch.title.trim()) task.title = patch.title.trim().slice(0, 200);
  if (typeof patch.notes === 'string') task.notes = patch.notes.slice(0, 5000);
  if (PRIORITIES.includes(patch.priority)) task.priority = patch.priority;
  if (Array.isArray(patch.tags)) {
    task.tags = [...new Set(patch.tags.map((tag) => String(tag).trim().slice(0, 24)).filter(Boolean))].slice(0, 8);
  }
  if ('estimate' in patch) {
    const minutes = Number(patch.estimate);
    task.estimate = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null;
  }
  if ('date' in patch) task.date = cleanDate(patch.date);
  if ('done' in patch) {
    const done = Boolean(patch.done);
    if (done && !task.done) {
      task.completedAt = new Date().toISOString();
      recordCompletion(board, task);
    } else if (!done && task.done) {
      forgetCompletion(board, task.id);
      task.completedAt = null;
    }
    task.done = done;
  }
  task.updatedAt = new Date().toISOString();
  return task;
}

async function createTask(patch) {
  return update((board) => {
    const columnId = board.columns.some((column) => column.id === patch.columnId)
      ? patch.columnId
      : board.columns[0].id;
    const now = new Date().toISOString();
    const task = {
      id: newId(),
      title: 'Untitled task',
      notes: '',
      columnId,
      date: null,
      order: -1, // sorts to the top of its column
      dayOrder: -1,
      priority: 'normal',
      tags: [],
      estimate: null,
      done: false,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    board.tasks.push(task);
    applyTaskFields(task, patch, board);
    reindex(board.tasks.filter((other) => other.columnId === task.columnId), 'order');
    reindex(board.tasks.filter((other) => other.date === task.date), 'dayOrder');
  });
}

/**
 * Moves a task and slots it at `index` within the group it landed in.
 * `scope` says which axis was dragged: a board column, or a day/backlog lane.
 */
async function moveTask(id, payload) {
  return update((board) => {
    const task = findTask(board, id);

    if (typeof payload.columnId === 'string' && board.columns.some((c) => c.id === payload.columnId)) {
      task.columnId = payload.columnId;
    }
    if ('date' in payload) task.date = cleanDate(payload.date);

    const scope = payload.scope === 'date' ? 'date' : 'column';
    const key = scope === 'date' ? 'dayOrder' : 'order';
    const siblings = board.tasks.filter((other) =>
      scope === 'date' ? other.date === task.date : other.columnId === task.columnId,
    );

    const ordered = siblings.filter((other) => other.id !== task.id).sort((a, b) => a[key] - b[key]);
    const index = Number.isFinite(payload.index)
      ? Math.max(0, Math.min(Math.round(payload.index), ordered.length))
      : ordered.length;
    ordered.splice(index, 0, task);
    ordered.forEach((other, position) => {
      other[key] = position;
    });

    // Keep the other axis dense too, since the task may have changed groups.
    const otherKey = scope === 'date' ? 'order' : 'dayOrder';
    reindex(
      board.tasks.filter((other) =>
        scope === 'date' ? other.columnId === task.columnId : other.date === task.date,
      ),
      otherKey,
    );
    task.updatedAt = new Date().toISOString();
  });
}

async function route(req, res, pathname) {
  const segments = pathname.split('/').filter(Boolean).slice(1); // drop "api"
  const [resource, id, action] = segments;
  const method = req.method ?? 'GET';

  if (resource === 'board' && method === 'GET') {
    return json(res, 200, await load());
  }

  if (resource === 'tasks') {
    if (!id && method === 'POST') return json(res, 201, await createTask(await readBody(req)));
    if (id && action === 'move' && method === 'POST') {
      return json(res, 200, await moveTask(id, await readBody(req)));
    }
    if (id && !action && (method === 'PATCH' || method === 'PUT')) {
      const patch = await readBody(req);
      return json(
        res,
        200,
        await update((board) => {
          applyTaskFields(findTask(board, id), patch, board);
        }),
      );
    }
    if (id && !action && method === 'DELETE') {
      return json(
        res,
        200,
        await update((board) => {
          findTask(board, id);
          board.tasks = board.tasks.filter((task) => task.id !== id);
        }),
      );
    }
  }

  if (resource === 'settings' && (method === 'PATCH' || method === 'PUT')) {
    const patch = await readBody(req);
    return json(
      res,
      200,
      await update((board) => {
        if ('theme' in patch) {
          if (!THEMES.includes(patch.theme)) throw new HttpError(400, `Unknown theme "${patch.theme}"`);
          board.settings.theme = patch.theme;
        }
        if ('weekStartsOn' in patch) {
          if (![0, 1].includes(patch.weekStartsOn)) throw new HttpError(400, 'weekStartsOn must be 0 or 1');
          board.settings.weekStartsOn = patch.weekStartsOn;
        }
        if (typeof patch.title === 'string' && patch.title.trim()) {
          board.settings.title = patch.title.trim().slice(0, 80);
        }
      }),
    );
  }

  if (resource === 'columns') {
    if (!id && method === 'POST') {
      const { title } = await readBody(req);
      return json(
        res,
        201,
        await update((board) => {
          board.columns.push({
            id: newId(),
            title: String(title ?? 'New column').trim().slice(0, 60) || 'New column',
            order: board.columns.length,
          });
        }),
      );
    }
    if (id && (method === 'PATCH' || method === 'PUT')) {
      const patch = await readBody(req);
      return json(
        res,
        200,
        await update((board) => {
          const column = board.columns.find((candidate) => candidate.id === id);
          if (!column) throw new HttpError(404, `No column ${id}`);
          if (typeof patch.title === 'string' && patch.title.trim()) {
            column.title = patch.title.trim().slice(0, 60);
          }
          if (Number.isFinite(patch.order)) {
            column.order = patch.order;
            board.columns.sort((a, b) => a.order - b.order).forEach((c, i) => {
              c.order = i;
            });
          }
        }),
      );
    }
    if (id && method === 'DELETE') {
      return json(
        res,
        200,
        await update((board) => {
          if (board.columns.length <= 1) throw new HttpError(400, 'The board needs at least one column');
          const column = board.columns.find((candidate) => candidate.id === id);
          if (!column) throw new HttpError(404, `No column ${id}`);
          board.columns = board.columns.filter((candidate) => candidate.id !== id);
          const fallback = board.columns[0].id;
          board.tasks.forEach((task) => {
            if (task.columnId === id) task.columnId = fallback;
          });
          reindex(board.tasks.filter((task) => task.columnId === fallback), 'order');
        }),
      );
    }
  }

  throw new HttpError(404, `No route for ${method} ${pathname}`);
}

/** Returns true when the request was an /api call and has been answered. */
export async function handleApi(req, res, pathname) {
  if (!pathname.startsWith('/api/')) return false;
  try {
    await route(req, res, pathname);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error(error);
    json(res, status, { error: error.message ?? 'Internal server error' });
  }
  return true;
}
