import {
  buildCard,
  buildColumn,
  buildLane,
  columnsInOrder,
  quickAdd,
  registerView,
  state,
  tasksIn,
} from './app.js';
import { isPast, isToday, isWeekend, dayName, shortDate, weekDays } from './dates.js';

const totalEstimate = (tasks) => tasks.reduce((sum, task) => sum + (task.estimate ?? 0), 0);

function dayClasses(iso) {
  const classes = [];
  if (isToday(iso)) classes.push('is-today');
  if (isWeekend(iso)) classes.push('is-weekend');
  if (isPast(iso)) classes.push('is-past');
  return classes;
}

/** Week view: one lane per day, dragging between them reschedules. */
function renderWeekView(container) {
  const days = weekDays(state.anchor, state.board.settings.weekStartsOn ?? 1);
  const fragment = document.createDocumentFragment();

  days.forEach((iso) => {
    const tasks = tasksIn({ date: iso }, 'dayOrder');
    const lane = buildLane({ scope: 'date', date: iso });
    tasks.forEach((task) => lane.append(buildCard(task)));

    const minutes = totalEstimate(tasks);
    fragment.append(
      buildColumn({
        title: isToday(iso) ? `${dayName(iso)} · today` : dayName(iso),
        subtitle: minutes ? `${shortDate(iso)} · ${formatMinutes(minutes)}` : shortDate(iso),
        classes: dayClasses(iso),
        lane,
        onAdd: () => quickAdd({ date: iso }),
      }),
    );
  });

  container.append(fragment);
}

/** Day view: the single day's work, split across the board's columns. */
function renderDayView(container) {
  const iso = state.anchor;
  const fragment = document.createDocumentFragment();

  columnsInOrder().forEach((column) => {
    const tasks = tasksIn({ columnId: column.id, date: iso }, 'order');
    const lane = buildLane({ scope: 'column', columnId: column.id, date: iso });
    tasks.forEach((task) => lane.append(buildCard(task)));

    const minutes = totalEstimate(tasks);
    fragment.append(
      buildColumn({
        title: column.title,
        subtitle: minutes ? formatMinutes(minutes) : '',
        classes: isToday(iso) ? ['is-today'] : [],
        lane,
        onAdd: () => quickAdd({ columnId: column.id, date: iso }),
      }),
    );
  });

  container.append(fragment);
}

export function formatMinutes(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

registerView('week', renderWeekView);
registerView('day', renderDayView);
