const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SPANISH_DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function getTodayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isRealUtcDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function isValidMealHistoryDate(value: string, today = getTodayUtcDate()): boolean {
  return isRealUtcDate(value) && value <= today;
}

export function isPastMealHistoryDate(
  value: string,
  today = getTodayUtcDate(),
): boolean {
  return isRealUtcDate(today) && isValidMealHistoryDate(value, today) && value < today;
}

function shiftUtcDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return date.toISOString().slice(0, 10);
}

export function getPreviousUtcDate(value: string): string {
  return shiftUtcDate(value, -1);
}

export function getNextUtcDate(value: string): string {
  return shiftUtcDate(value, 1);
}

export function formatSpanishUtcDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);

  return SPANISH_DATE_FORMATTER.format(new Date(Date.UTC(year, month - 1, day)));
}

export function resolveMealHistoryDate(value: string | undefined, today = getTodayUtcDate()) {
  if (!value) {
    return { selectedDate: today, hasInvalidDate: false };
  }

  if (!isValidMealHistoryDate(value, today)) {
    return { selectedDate: today, hasInvalidDate: true };
  }

  return { selectedDate: value, hasInvalidDate: false };
}
