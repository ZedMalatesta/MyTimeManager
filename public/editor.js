import { api } from './api.js';
import { columnsInOrder, render, state, toast } from './app.js';

/** Task detail dialog: opened by clicking a card, saves the whole task at once. */

const backdrop = document.getElementById('editor-backdrop');
const form = document.getElementById('editor-form');
const columnSelect = document.getElementById('editor-column');
const heading = document.getElementById('editor-title');

let editingId = null;

function open(task) {
  editingId = task.id;
  heading.textContent = task.done ? 'Task · done' : 'Task';

  columnSelect.replaceChildren(
    ...columnsInOrder().map((column) => {
      const option = document.createElement('option');
      option.value = column.id;
      option.textContent = column.title;
      return option;
    }),
  );

  form.title.value = task.title;
  form.notes.value = task.notes;
  form.columnId.value = task.columnId;
  form.date.value = task.date ?? '';
  form.priority.value = task.priority;
  form.estimate.value = task.estimate ?? '';
  form.tags.value = task.tags.join(', ');
  form.done.checked = task.done;

  backdrop.hidden = false;
  form.title.focus();
  form.title.select();
}

function close() {
  editingId = null;
  backdrop.hidden = true;
  // Focus would otherwise stay parked in a hidden field, where the global
  // shortcuts read it as "the user is typing" and stop responding.
  if (backdrop.contains(document.activeElement)) document.activeElement.blur();
}

export const isEditorOpen = () => !backdrop.hidden;

document.addEventListener('click', (event) => {
  if (event.target.closest('.card-check')) return; // the checkbox owns that click
  const card = event.target.closest('.card');
  if (!card) return;
  const task = state.board.tasks.find((candidate) => candidate.id === card.dataset.id);
  if (task) open(task);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editingId) return;
  const data = new FormData(form);
  const patch = {
    title: String(data.get('title')).trim(),
    notes: String(data.get('notes')),
    columnId: String(data.get('columnId')),
    date: data.get('date') || null,
    priority: String(data.get('priority')),
    estimate: data.get('estimate') ? Number(data.get('estimate')) : null,
    tags: String(data.get('tags'))
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    done: data.get('done') === 'on',
  };

  if (!patch.title) return;
  const id = editingId;
  close();
  try {
    state.board = await api.updateTask(id, patch);
    render();
  } catch (error) {
    toast(error.message);
  }
});

document.getElementById('editor-delete').addEventListener('click', async () => {
  if (!editingId) return;
  const task = state.board.tasks.find((candidate) => candidate.id === editingId);
  if (!window.confirm(`Delete “${task?.title ?? 'this task'}”?`)) return;
  const id = editingId;
  close();
  try {
    state.board = await api.deleteTask(id);
    render();
    toast('Task deleted');
  } catch (error) {
    toast(error.message);
  }
});

document.getElementById('editor-cancel').addEventListener('click', close);
backdrop.addEventListener('mousedown', (event) => {
  if (event.target === backdrop) close();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && isEditorOpen()) close();
});
