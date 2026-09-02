import { api } from './api.js';
import { render, state, toast } from './app.js';

/**
 * Drag & drop across every lane on the board.
 *
 * The dragged card is moved into the hovered lane while dragging, so what you
 * see is exactly where it will land; on drop we read that position back and
 * tell the server. `data-drop-scope` on the lane decides which axis is being
 * reordered: `column` writes columnId + order, `date` writes date + dayOrder.
 */

let dragging = null;

const cardsIn = (lane) => [...lane.querySelectorAll('.card')];

/** The card the dragged one should sit before, based on pointer position. */
function insertionAnchor(lane, y) {
  const others = [...lane.querySelectorAll('.card:not(.dragging)')];
  return (
    others.find((card) => {
      const box = card.getBoundingClientRect();
      return y < box.top + box.height / 2;
    }) ?? null
  );
}

document.addEventListener('dragstart', (event) => {
  const card = event.target.closest?.('.card');
  if (!card) return;
  dragging = card;
  card.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', card.dataset.id);
});

document.addEventListener('dragover', (event) => {
  if (!dragging) return;
  const lane = event.target.closest?.('.lane');
  if (!lane) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  lane.classList.add('is-over');
  lane.querySelector('.empty')?.remove();

  const anchor = insertionAnchor(lane, event.clientY);
  if (anchor) lane.insertBefore(dragging, anchor);
  else lane.append(dragging);
});

document.addEventListener('dragleave', (event) => {
  const lane = event.target.closest?.('.lane');
  if (lane && !lane.contains(event.relatedTarget)) lane.classList.remove('is-over');
});

document.addEventListener('drop', async (event) => {
  const lane = dragging && event.target.closest?.('.lane');
  if (!lane) return;
  event.preventDefault();
  lane.classList.remove('is-over');

  const card = dragging;
  const index = cardsIn(lane).indexOf(card);
  const scope = lane.dataset.dropScope === 'date' ? 'date' : 'column';
  // A lane declares whatever it pins down; scope only picks the sort key.
  const move = { index, scope };
  if ('dropDate' in lane.dataset) move.date = lane.dataset.dropDate || null;
  if ('dropColumn' in lane.dataset) move.columnId = lane.dataset.dropColumn;

  finishDrag();
  try {
    state.board = await api.moveTask(card.dataset.id, move);
  } catch (error) {
    toast(error.message);
  }
  render(); // re-render either way: the DOM preview is not the source of truth
});

document.addEventListener('dragend', () => {
  if (!dragging) return;
  finishDrag();
  render();
});

function finishDrag() {
  dragging?.classList.remove('dragging');
  document.querySelectorAll('.lane.is-over').forEach((lane) => lane.classList.remove('is-over'));
  dragging = null;
}
