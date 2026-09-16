/**
 * Metrics are derived entirely from `board.history`, never from the tasks still
 * on the board, so clearing finished cards does not rewrite the past.
 *
 * Days are local days: the log stores UTC instants, but "what did I finish on
 * Tuesday" is a question about the wall clock in front of you.
 */

const DAY_MS = 86_400_000;

const pad = (value) => String(value).padStart(2, '0');

export const localDay = (instant) => {
  const date = new Date(instant);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const fromDay = (day) => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
};

const shiftDay = (day, amount) => {
  const date = fromDay(day);
  date.setDate(date.getDate() + amount);
  return localDay(date);
};

function startOfWeek(day, weekStartsOn) {
  const date = fromDay(day);
  date.setDate(date.getDate() - ((date.getDay() - weekStartsOn + 7) % 7));
  return localDay(date);
}

const sumEstimates = (events) => events.reduce((total, event) => total + (event.estimate ?? 0), 0);

const summarize = (events) => ({ count: events.length, minutes: sumEstimates(events) });

/** Consecutive days ending today — an empty today does not break a live streak. */
function streaks(days) {
  const present = new Set(days);
  const today = localDay(new Date());

  let current = 0;
  let cursor = present.has(today) ? today : shiftDay(today, -1);
  while (present.has(cursor)) {
    current += 1;
    cursor = shiftDay(cursor, -1);
  }

  let best = 0;
  let run = 0;
  let previous = null;
  [...present].sort().forEach((day) => {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  });

  return { current, best };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Counts by key, biggest first, with a long tail folded into "Other". */
function rank(events, keysOf, limit = 6) {
  const counts = new Map();
  events.forEach((event) => {
    keysOf(event).forEach((key) => {
      const entry = counts.get(key) ?? { key, count: 0, minutes: 0 };
      entry.count += 1;
      entry.minutes += event.estimate ?? 0;
      counts.set(key, entry);
    });
  });

  const ordered = [...counts.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  if (ordered.length <= limit) return ordered;

  const tail = ordered.slice(limit);
  return [
    ...ordered.slice(0, limit),
    {
      key: 'Other',
      count: tail.reduce((total, entry) => total + entry.count, 0),
      minutes: tail.reduce((total, entry) => total + entry.minutes, 0),
    },
  ];
}

export function buildStats(board, { days = 30 } = {}) {
  const history = board.history ?? [];
  const weekStartsOn = board.settings?.weekStartsOn ?? 1;
  const today = localDay(new Date());

  const dated = history.map((event) => ({ ...event, day: localDay(event.completedAt) }));

  const weekStart = startOfWeek(today, weekStartsOn);
  const monthStart = today.slice(0, 8) + '01';

  const totals = {
    today: summarize(dated.filter((event) => event.day === today)),
    week: summarize(dated.filter((event) => event.day >= weekStart)),
    month: summarize(dated.filter((event) => event.day >= monthStart)),
    all: summarize(dated),
  };

  // A dense run of days, so empty days stay visible as gaps in the chart.
  const span = Math.max(1, Math.min(Number(days) || 30, 365));
  const buckets = new Map();
  for (let offset = span - 1; offset >= 0; offset -= 1) {
    buckets.set(shiftDay(today, -offset), { date: shiftDay(today, -offset), count: 0, minutes: 0 });
  }
  dated.forEach((event) => {
    const bucket = buckets.get(event.day);
    if (!bucket) return;
    bucket.count += 1;
    bucket.minutes += event.estimate ?? 0;
  });
  const daily = [...buckets.values()];

  const byWeekday = Array.from({ length: 7 }, (_, index) => {
    const weekday = (weekStartsOn + index) % 7;
    const matching = dated.filter((event) => fromDay(event.day).getDay() === weekday);
    return { weekday, count: matching.length, minutes: sumEstimates(matching) };
  });

  const cycleHours = dated
    .map((event) => (new Date(event.completedAt) - new Date(event.createdAt)) / 3_600_000)
    .filter((hours) => Number.isFinite(hours) && hours >= 0);

  const activeDays = new Set(dated.map((event) => event.day));
  const windowed = daily.reduce((total, bucket) => total + bucket.count, 0);

  return {
    generatedAt: new Date().toISOString(),
    range: { from: daily[0]?.date ?? today, to: today, days: span },
    totals,
    streak: streaks([...activeDays]),
    daily,
    byWeekday,
    byTag: rank(
      dated.filter((event) => event.tags.length),
      (event) => event.tags,
    ),
    byColumn: rank(dated, (event) => [event.columnTitle || 'No column']),
    cycleTime: { medianHours: median(cycleHours), samples: cycleHours.length },
    perDay: span ? Number((windowed / span).toFixed(2)) : 0,
    activeDays: activeDays.size,
    recent: [...dated]
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      .slice(0, 12)
      .map(({ day, ...event }) => event),
  };
}
