import { getNextUtcDate, getPreviousUtcDate, getTodayUtcDate, isValidMealHistoryDate } from "@/modules/meals/meal-date";

const SPANISH_DAY_MONTH_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
});
const SPANISH_FULL_DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function parseUtcDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day));
}

function shiftUtcDate(value: string, days: number): string {
  const date = parseUtcDate(value);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

export function getUtcWeekMonday(value: string): string {
  const date = parseUtcDate(value);
  const dayOfWeek = date.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;

  return shiftUtcDate(value, -daysSinceMonday);
}

export function getUtcWeekSunday(value: string): string {
  return shiftUtcDate(getUtcWeekMonday(value), 6);
}

export function getUtcWeekDates(value: string): string[] {
  const monday = getUtcWeekMonday(value);

  return Array.from({ length: 7 }, (_, index) => shiftUtcDate(monday, index));
}

export function getPreviousUtcWeek(value: string): string {
  return shiftUtcDate(getUtcWeekMonday(value), -7);
}

export function getNextUtcWeek(value: string): string {
  return shiftUtcDate(getUtcWeekMonday(value), 7);
}

export function isUtcWeekAfterCurrentWeek(value: string, today = getTodayUtcDate()): boolean {
  return getUtcWeekMonday(value) > getUtcWeekMonday(today);
}

export function formatSpanishUtcWeekRange(weekStart: string, weekEnd = getUtcWeekSunday(weekStart)): string {
  const startDate = parseUtcDate(weekStart);
  const endDate = parseUtcDate(weekEnd);
  const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();
  const sameMonth = sameYear && startDate.getUTCMonth() === endDate.getUTCMonth();

  if (sameMonth) {
    return `Del ${startDate.getUTCDate()} al ${SPANISH_FULL_DATE_FORMATTER.format(endDate)}`;
  }

  if (sameYear) {
    return `Del ${SPANISH_DAY_MONTH_FORMATTER.format(startDate)} al ${SPANISH_FULL_DATE_FORMATTER.format(endDate)}`;
  }

  return `Del ${SPANISH_FULL_DATE_FORMATTER.format(startDate)} al ${SPANISH_FULL_DATE_FORMATTER.format(endDate)}`;
}

export function resolveWeeklySummaryDate(value: string | undefined, today = getTodayUtcDate()) {
  if (!value) {
    const selectedDate = today;

    return {
      selectedDate,
      weekStart: getUtcWeekMonday(selectedDate),
      weekEnd: getUtcWeekSunday(selectedDate),
      hasInvalidWeek: false,
    };
  }

  if (!isValidMealHistoryDate(value, today)) {
    return {
      selectedDate: today,
      weekStart: getUtcWeekMonday(today),
      weekEnd: getUtcWeekSunday(today),
      hasInvalidWeek: true,
    };
  }

  return {
    selectedDate: value,
    weekStart: getUtcWeekMonday(value),
    weekEnd: getUtcWeekSunday(value),
    hasInvalidWeek: false,
  };
}

export { getNextUtcDate, getPreviousUtcDate };
