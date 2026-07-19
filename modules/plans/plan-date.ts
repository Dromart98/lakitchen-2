import { z } from "zod";

export const PLAN_SCHEDULING_DAYS = 7;

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const millisecondsPerDay = 24 * 60 * 60 * 1000;

function dateKeyTimestamp(dateKey: string): number | null {
  if (!DATE_KEY_PATTERN.test(dateKey)) return null;
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateKey ? null : date.getTime();
}

export function addDaysToDateKey(dateKey: string, days: number): string | null {
  const timestamp = dateKeyTimestamp(dateKey);
  if (timestamp === null || !Number.isInteger(days)) return null;
  return new Date(timestamp + days * millisecondsPerDay).toISOString().slice(0, 10);
}

export function getPlanDateDayDifference(planDate: string, todayKey: string): number | null {
  const planTimestamp = dateKeyTimestamp(planDate);
  const todayTimestamp = dateKeyTimestamp(todayKey);
  if (planTimestamp === null || todayTimestamp === null) return null;
  return Math.round((planTimestamp - todayTimestamp) / millisecondsPerDay);
}

export function isAllowedPlanDate(planDate: string, todayKey: string): boolean {
  const difference = getPlanDateDayDifference(planDate, todayKey);
  return difference !== null && difference >= 0 && difference < PLAN_SCHEDULING_DAYS;
}

export function getPlanDateOptions(todayKey: string): string[] {
  return Array.from({ length: PLAN_SCHEDULING_DAYS }, (_, index) => addDaysToDateKey(todayKey, index)).filter((value): value is string => value !== null);
}

const labelFormatter = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export function formatPlanDateLabel(planDate: string, todayKey: string): string {
  const difference = getPlanDateDayDifference(planDate, todayKey);
  const timestamp = dateKeyTimestamp(planDate);
  if (difference === null || timestamp === null) return planDate;
  const label = labelFormatter.format(new Date(timestamp));
  if (difference === 0) return `Hoy, ${label.replace(/^.*?, /, "")}`;
  if (difference === 1) return `Mañana, ${label.replace(/^.*?, /, "")}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function isValidDateKey(dateKey: string): boolean {
  return dateKeyTimestamp(dateKey) !== null;
}

export function canCookSavedPlanOnDate(planDate: string, todayKey: string): boolean {
  const difference = getPlanDateDayDifference(planDate, todayKey);
  return difference !== null && difference <= 0;
}

export const planDateKeySchema = z.string().refine(isValidDateKey, "Invalid plan date");
