const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Local-time date helpers — the board stores plain YYYY-MM-DD, never UTC instants. */
export const toISO = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const fromISO = (iso) => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const todayISO = () => toISO(new Date());

export function addDays(iso, amount) {
  const date = fromISO(iso);
  date.setDate(date.getDate() + amount);
  return toISO(date);
}

export function startOfWeek(iso, weekStartsOn = 1) {
  const date = fromISO(iso);
  const shift = (date.getDay() - weekStartsOn + 7) % 7;
  date.setDate(date.getDate() - shift);
  return toISO(date);
}

export function weekDays(iso, weekStartsOn = 1) {
  const first = startOfWeek(iso, weekStartsOn);
  return Array.from({ length: 7 }, (_, index) => addDays(first, index));
}

export const isToday = (iso) => iso === todayISO();
export const isWeekend = (iso) => [0, 6].includes(fromISO(iso).getDay());
export const isPast = (iso) => iso < todayISO();

export const dayName = (iso) => DAYS[fromISO(iso).getDay()];

export const shortDate = (iso) => {
  const date = fromISO(iso);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
};

export function longDate(iso) {
  const date = fromISO(iso);
  return `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()} ${date.getFullYear()}`;
}

export function weekLabel(iso, weekStartsOn = 1) {
  const days = weekDays(iso, weekStartsOn);
  const first = fromISO(days[0]);
  const last = fromISO(days[6]);
  const year = last.getFullYear() === new Date().getFullYear() ? '' : ` ${last.getFullYear()}`;
  return `${shortDate(days[0])} – ${
    first.getMonth() === last.getMonth() ? last.getDate() : shortDate(days[6])
  }${year}`;
}

/** Human label for a card badge: Today / Tomorrow / Mon 8. */
export function relativeDay(iso) {
  const today = todayISO();
  if (iso === today) return 'Today';
  if (iso === addDays(today, 1)) return 'Tomorrow';
  if (iso === addDays(today, -1)) return 'Yesterday';
  return `${dayName(iso)} ${fromISO(iso).getDate()}`;
}
