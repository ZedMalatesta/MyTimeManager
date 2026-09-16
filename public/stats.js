import { api } from './api.js';
import { registerView, render, state, toast } from './app.js';
import { shortDate } from './dates.js';
import { formatMinutes } from './views.js';

/**
 * The metrics dashboard. Every chart here plots a single series, so there is
 * one hue — the theme's accent — and no legend to decode: the heading says
 * what is plotted. Values a tooltip shows are always reachable without it,
 * through the direct labels and the completions table at the bottom.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const RANGES = [
  [30, 'Last 30 days'],
  [90, 'Last 90 days'],
  [365, 'Last year'],
];

let cache = null;
let inflight = false;

/* ---------- small builders ---------- */

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text; // labels are user data, never innerHTML
  return element;
}

function statTile(label, value, detail) {
  const tile = node('div', 'tile');
  tile.append(node('span', 'tile-label', label), node('strong', 'tile-value', value));
  if (detail) tile.append(node('span', 'tile-detail', detail));
  return tile;
}

function panel(title, subtitle) {
  const section = node('section', 'panel');
  const head = node('header', 'panel-head');
  head.append(node('h3', null, title));
  if (subtitle) head.append(node('span', 'panel-sub', subtitle));
  section.append(head);
  return section;
}

/* ---------- tooltip ---------- */

let tip;
function tooltip() {
  if (!tip) {
    tip = node('div', 'chart-tip');
    tip.hidden = true;
    document.body.append(tip);
  }
  return tip;
}

function attachTip(target, value, label) {
  const show = () => {
    const element = tooltip();
    element.replaceChildren(node('strong', null, value), node('span', null, label));
    element.hidden = false;
    const box = target.getBoundingClientRect();
    const width = element.offsetWidth;
    element.style.left = `${Math.min(Math.max(box.left + box.width / 2 - width / 2, 8), window.innerWidth - width - 8)}px`;
    element.style.top = `${box.top - element.offsetHeight - 8}px`;
  };
  const hide = () => {
    if (tip) tip.hidden = true;
  };
  target.addEventListener('pointerenter', show);
  target.addEventListener('focus', show);
  target.addEventListener('pointerleave', hide);
  target.addEventListener('blur', hide);
}

/* ---------- charts ---------- */

/**
 * Columns over time. The band is wider than the painted bar, so the hover
 * target includes the gap on either side.
 */
function columnChart(points, { labelOf, tipOf, emphasise = () => false }) {
  const chart = node('div', 'chart');
  const peak = Math.max(...points.map((point) => point.count), 1);
  const plot = node('div', 'chart-plot');

  points.forEach((point) => {
    const band = node('div', 'band');
    band.tabIndex = 0;
    band.setAttribute('role', 'img');

    const bar = node('div', 'bar');
    bar.style.height = point.count ? `${Math.max((point.count / peak) * 100, 4)}%` : '2px';
    if (!point.count) bar.classList.add('is-empty');
    if (emphasise(point)) bar.classList.add('is-emphasis');
    if (point.count === peak && peak > 0) bar.append(node('span', 'bar-cap', String(point.count)));

    band.append(bar);
    const label = tipOf(point);
    band.setAttribute('aria-label', label);
    attachTip(band, `${point.count} done`, label);
    plot.append(band);
  });

  chart.append(plot);

  const axis = node('div', 'chart-axis');
  points.forEach((point, index) => {
    const tick = node('span', 'tick', labelOf(point, index) ?? '');
    axis.append(tick);
  });
  chart.append(axis);
  return chart;
}

/** Ranked horizontal bars: one hue, value at the tip. */
function rankChart(entries, empty) {
  if (!entries.length) return node('p', 'empty', empty);
  const peak = Math.max(...entries.map((entry) => entry.count), 1);
  const list = node('div', 'ranks');

  entries.forEach((entry) => {
    const row = node('div', 'rank');
    row.append(node('span', 'rank-label', entry.key));

    const track = node('div', 'rank-track');
    const bar = node('div', 'rank-bar');
    bar.style.width = `${Math.max((entry.count / peak) * 100, 2)}%`;
    track.append(bar);

    const value = node('span', 'rank-value', String(entry.count));
    row.append(track, value);
    row.tabIndex = 0;
    attachTip(row, `${entry.count} done`, entry.minutes ? `${entry.key} · ${formatMinutes(entry.minutes)}` : entry.key);
    list.append(row);
  });

  return list;
}

/* ---------- the view ---------- */

function draw(container, stats) {
  const wrap = node('div', 'stats');

  // filters, one row above the charts
  const controls = node('div', 'stats-controls');
  const select = node('select', 'theme-picker');
  select.setAttribute('aria-label', 'Date range');
  RANGES.forEach(([days, label]) => {
    const option = node('option', null, label);
    option.value = String(days);
    select.append(option);
  });
  select.value = String(state.statsDays ?? 30);
  select.addEventListener('change', () => {
    state.statsDays = Number(select.value);
    render();
  });
  controls.append(node('span', 'stats-title', 'Completed work'), select);
  wrap.append(controls);

  if (!stats.totals.all.count) {
    const blank = panel('Nothing logged yet');
    blank.append(
      node(
        'p',
        'empty',
        'Tick a task off and it lands here. The log is kept separately from the board, so metrics survive deleting or clearing finished cards.',
      ),
    );
    wrap.append(blank);
    container.append(wrap);
    return;
  }

  // KPI row
  const tiles = node('div', 'tiles');
  tiles.append(
    statTile('Today', String(stats.totals.today.count), stats.totals.today.minutes ? formatMinutes(stats.totals.today.minutes) : ''),
    statTile('This week', String(stats.totals.week.count), stats.totals.week.minutes ? formatMinutes(stats.totals.week.minutes) : ''),
    statTile('This month', String(stats.totals.month.count), stats.totals.month.minutes ? formatMinutes(stats.totals.month.minutes) : ''),
    statTile('All time', String(stats.totals.all.count), `${stats.activeDays} active days`),
    statTile('Streak', `${stats.streak.current}d`, `best ${stats.streak.best}d`),
    statTile(
      'Typical turnaround',
      stats.cycleTime.medianHours === null ? '—' : formatSpan(stats.cycleTime.medianHours),
      'median, created to done',
    ),
  );
  wrap.append(tiles);

  // completions per day
  const daily = panel(
    'Completions per day',
    `${stats.range.days} days · ${stats.perDay} a day on average`,
  );
  const today = stats.daily.at(-1)?.date;
  daily.append(
    columnChart(stats.daily, {
      tipOf: (point) => shortDate(point.date),
      emphasise: (point) => point.date === today,
      labelOf: (point, index) => {
        const last = stats.daily.length - 1;
        if (index === 0 || index === last || index === Math.floor(last / 2)) return shortDate(point.date);
        return '';
      },
    }),
  );
  wrap.append(daily);

  // breakdowns, side by side
  const split = node('div', 'stats-split');

  const weekday = panel('By day of the week', 'all time');
  weekday.append(
    columnChart(
      stats.byWeekday.map((entry) => ({ ...entry, name: WEEKDAYS[entry.weekday] })),
      { tipOf: (point) => point.name, labelOf: (point) => point.name },
    ),
  );

  const tags = panel('By tag', 'all time');
  tags.append(rankChart(stats.byTag, 'No tagged completions yet.'));

  const columns = panel('By column at completion', 'all time');
  columns.append(rankChart(stats.byColumn, 'Nothing logged yet.'));

  split.append(weekday, tags, columns);
  wrap.append(split);

  // the table view: every value above is reachable here without hovering
  const recent = panel('Recently completed', `${stats.recent.length} most recent`);
  const table = node('table', 'log');
  const head = node('thead');
  const headRow = node('tr');
  ['Task', 'Tags', 'Column', 'Estimate', 'Completed'].forEach((title) => headRow.append(node('th', null, title)));
  head.append(headRow);
  const body = node('tbody');
  stats.recent.forEach((event) => {
    const row = node('tr');
    row.append(
      node('td', 'log-title', event.title),
      node('td', null, event.tags.join(', ') || '—'),
      node('td', null, event.columnTitle || '—'),
      node('td', 'num', event.estimate ? formatMinutes(event.estimate) : '—'),
      node('td', null, stamp(event.completedAt)),
    );
    body.append(row);
  });
  table.append(head, body);
  recent.append(table);
  wrap.append(recent);

  container.append(wrap);
}

function formatSpan(hours) {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function stamp(instant) {
  const date = new Date(instant);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${shortDate(localDay(date))} · ${time}`;
}

const localDay = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function renderStatsView(container) {
  const days = state.statsDays ?? 30;
  const fresh = cache && cache.updatedAt === state.board.updatedAt && cache.days === days;

  if (!fresh && !inflight) {
    inflight = true;
    api
      .stats(days)
      .then((data) => {
        cache = { updatedAt: state.board.updatedAt, days, data };
        inflight = false;
        if (state.view === 'stats') render();
      })
      .catch((error) => {
        inflight = false;
        toast(error.message);
      });
  }

  if (!cache) {
    container.append(node('p', 'empty', 'Reading your history…'));
    return;
  }
  draw(container, cache.data);
}

registerView('stats', renderStatsView);
