import { api } from './api.js';
import { addDays, longDate, relativeDay, todayISO, weekLabel } from './dates.js';

export const state = {
  board: { columns: [], tasks: [], settings: { weekStartsOn: 1 } },
  view: 'board',
  anchor: todayISO(),
  filter: '',
  showBacklog: true,
};

const el = {
  view: document.getElementById('view'),
  backlog: document.getElementById('backlog'),
  backlogLane: document.getElementById('backlog-lane'),
  backlogCount: document.getElementById('backlog-count'),
  periodLabel: document.getElementById('period-label'),
  toast: document.getElementById('toast'),
};

/* ---------- helpers ---------- */

export const columnsInOrder = () => [...state.board.columns].sort((a, b) => a.order - b.order);
export const columnById = (id) => state.board.columns.find((column) => column.id === id);

export function matchesFilter(task) {
  const needle = state.filter.trim().toLowerCase();
  if (!needle) return true;
  return [task.title, task.notes, ...task.tags].join(' ').toLowerCase().includes(needle);
}

export function tasksIn({ columnId, date }, sortKey) {
  return state.board.tasks
    .filter((task) => (columnId === undefined || task.columnId === columnId))
    .filter((task) => (date === undefined || task.date === date))
    .filter(matchesFilter)
    .sort((a, b) => a[sortKey] - b[sortKey] || a.title.localeCompare(b.title));
}

function periodLabel() {
  if (state.view === 'week') return weekLabel(state.anchor, state.board.settings.weekStartsOn ?? 1);
  if (state.view === 'day') return longDate(state.anchor);
  return '';
}

/** Steps the anchor date: a day at a time in day view, a week in week view. */
export function shiftPeriod(direction) {
  state.anchor = addDays(state.anchor, direction * (state.view === 'week' ? 7 : 1));
  render();
}

let toastTimer;
export function toast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.hidden = true;
  }, 2200);
}

/* ---------- card + lane building ---------- */

export function buildCard(task) {
  const card = document.createElement('article');
  card.className = `card priority-${task.priority}${task.done ? ' is-done' : ''}`;
  card.draggable = true;
  card.dataset.id = task.id;
  card.tabIndex = 0;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'card-check';
  checkbox.checked = task.done;
  checkbox.title = 'Mark done';
  checkbox.addEventListener('click', (event) => event.stopPropagation());
  checkbox.addEventListener('change', () => applyPatch(task.id, { done: checkbox.checked }));

  const title = document.createElement('span');
  title.className = 'card-title';
  title.textContent = task.title;

  const heading = document.createElement('div');
  heading.append(checkbox, title);
  card.append(heading);

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  if (task.date) meta.append(chip(relativeDay(task.date)));
  if (task.estimate) meta.append(chip(`${task.estimate}m`));
  if (state.view !== 'board') meta.append(chip(columnById(task.columnId)?.title ?? '—'));
  task.tags.forEach((tag) => meta.append(chip(`#${tag}`)));
  if (meta.childElementCount) card.append(meta);

  return card;
}

function chip(text) {
  const span = document.createElement('span');
  span.className = 'tag';
  span.textContent = text;
  return span;
}

/** A drop lane: `scope` says which sort axis a drop into it reorders. */
export function buildLane({ scope, columnId, date }) {
  const lane = document.createElement('div');
  lane.className = 'lane';
  lane.dataset.dropScope = scope;
  if (columnId !== undefined) lane.dataset.dropColumn = columnId;
  if (date !== undefined) lane.dataset.dropDate = date ?? '';
  return lane;
}

export function buildColumn({ title, subtitle, classes = [], lane, onAdd }) {
  const column = document.createElement('section');
  column.className = ['column', ...classes].join(' ');

  const head = document.createElement('header');
  head.className = 'column-head';

  const heading = document.createElement('h2');
  heading.textContent = title;
  head.append(heading);

  if (subtitle) {
    const sub = document.createElement('span');
    sub.className = 'sub';
    sub.textContent = subtitle;
    head.append(sub);
  }

  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = String(lane.childElementCount);
  head.append(count);

  column.append(head, lane);

  if (onAdd) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'add-card';
    add.textContent = '+ Add a card';
    add.addEventListener('click', onAdd);
    column.append(add);
  }
  return column;
}

/* ---------- views ---------- */

function renderBoardView(container) {
  const fragment = document.createDocumentFragment();
  columnsInOrder().forEach((column) => {
    const lane = buildLane({ scope: 'column', columnId: column.id });
    tasksIn({ columnId: column.id }, 'order').forEach((task) => lane.append(buildCard(task)));
    fragment.append(
      buildColumn({
        title: column.title,
        lane,
        onAdd: () => quickAdd({ columnId: column.id }),
      }),
    );
  });
  container.append(fragment);
}

function renderBacklog() {
  el.backlogLane.replaceChildren();
  const tasks = tasksIn({ date: null }, 'dayOrder');
  tasks.forEach((task) => el.backlogLane.append(buildCard(task)));
  if (!tasks.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Nothing waiting. Nice.';
    el.backlogLane.append(empty);
  }
  el.backlogCount.textContent = String(tasks.length);
  el.backlog.hidden = !state.showBacklog;
}

const VIEWS = { board: renderBoardView };

export function render() {
  el.view.replaceChildren();
  (VIEWS[state.view] ?? renderBoardView)(el.view);
  renderBacklog();
  el.periodLabel.textContent = periodLabel();
  document.getElementById('period-nav').hidden = state.view === 'board';
  document.querySelectorAll('#view-tabs .tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.view === state.view);
  });
  document.dispatchEvent(new CustomEvent('board:rendered'));
}

export function registerView(name, renderer) {
  VIEWS[name] = renderer;
}

/* ---------- mutations ---------- */

export async function applyPatch(id, fields) {
  try {
    state.board = await api.updateTask(id, fields);
    render();
  } catch (error) {
    toast(error.message);
  }
}

export async function quickAdd(fields) {
  const title = window.prompt('New task');
  if (!title?.trim()) return;
  try {
    state.board = await api.createTask({ ...fields, title });
    render();
  } catch (error) {
    toast(error.message);
  }
}

export async function refresh() {
  state.board = await api.board();
  render();
}

/* ---------- chrome wiring ---------- */

document.getElementById('view-tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('.tab');
  if (!tab) return;
  state.view = tab.dataset.view;
  render();
});

document.getElementById('search').addEventListener('input', (event) => {
  state.filter = event.target.value;
  render();
});

document.getElementById('toggle-backlog').addEventListener('click', (event) => {
  state.showBacklog = !state.showBacklog;
  event.currentTarget.setAttribute('aria-pressed', String(state.showBacklog));
  render();
});

document.getElementById('period-nav').addEventListener('click', (event) => {
  const action = event.target.closest('button')?.dataset.nav;
  if (action === 'today') {
    state.anchor = todayISO();
    render();
  } else if (action === 'prev') shiftPeriod(-1);
  else if (action === 'next') shiftPeriod(1);
});

document.getElementById('backlog-add').addEventListener('click', () => quickAdd({ date: null }));
document.getElementById('new-task').addEventListener('click', () =>
  quickAdd({ date: state.view === 'board' ? null : state.anchor }),
);

refresh().catch((error) => toast(error.message));
