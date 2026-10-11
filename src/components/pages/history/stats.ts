import type { DailyFocusPeriod, DayData } from "./charts";
import type { FocusSession } from "./data";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const PERIOD_DAYS: Record<Exclude<DailyFocusPeriod, "custom">, number> = {
  "7days": 7,
  "30days": 30,
  "90days": 90,
  "180days": 180,
  "365days": 365,
};

const LONG_PERIODS: readonly DailyFocusPeriod[] = ["365days", "180days", "90days"];

export interface ChartWindow {
  period: DailyFocusPeriod;
  dayOffset: number;
  customStartDate: string;
  customEndDate: string;
}

function rawMinutes(sessions: FocusSession[]): number {
  return sessions.reduce((sum, s) => {
    if (s.start_time && s.end_time) return sum + (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 60000;
    return sum;
  }, 0);
}

function focusOnly(sessions: FocusSession[]): FocusSession[] {
  return sessions.filter((s) => s.session_type === "focus");
}

function startOfWeekWithOffset(weekOffset: number): Date {
  const now = new Date();
  const start = new Date(now);
  const dayOfWeek = now.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  start.setDate(now.getDate() - daysFromMonday - weekOffset * 7);
  start.setHours(0, 0, 0, 0);
  return start;
}

function inRange(session: FocusSession, from: Date, to: Date): boolean {
  const d = new Date(session.created_at);
  return d >= from && d < to;
}

export function chartRange({ period, dayOffset, customStartDate, customEndDate }: ChartWindow): { startDate: Date; endDate: Date } {
  if (period === "custom") {
    return { startDate: new Date(customStartDate + "T00:00:00"), endDate: new Date(customEndDate + "T23:59:59.999") };
  }
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - dayOffset);
  endDate.setHours(23, 59, 59, 999);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - PERIOD_DAYS[period] + 1);
  startDate.setHours(0, 0, 0, 0);
  return { startDate, endDate };
}

export function buildDayData(
  window: ChartWindow,
  chartSessions: FocusSession[],
  chartPauseMap: Map<string, number>,
): DayData[] {
  const { period, dayOffset, customStartDate, customEndDate } = window;
  let numDays: number;
  let baseDate: Date;
  if (period === "custom") {
    const start = new Date(customStartDate + "T00:00:00");
    const end = new Date(customEndDate + "T00:00:00");
    numDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1);
    baseDate = start;
  } else {
    numDays = PERIOD_DAYS[period];
    baseDate = new Date();
    baseDate.setDate(baseDate.getDate() - (numDays - 1) - dayOffset);
    baseDate.setHours(0, 0, 0, 0);
  }
  return Array.from({ length: numDays }, (_, i) => {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + i);
    date.setHours(0, 0, 0, 0);
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    const totalMinutes = chartSessions
      .filter((session) => inRange(session, date, nextDate))
      .reduce((sum, session) => {
        if (!session.start_time || !session.end_time) return sum;
        const pauseDuration = chartPauseMap.get(session.id) || 0;
        return sum + Math.max(0, (new Date(session.end_time).getTime() - new Date(session.start_time).getTime() - pauseDuration) / 60000);
      }, 0);
    return {
      date,
      day: date.toLocaleDateString("en-US", { weekday: "short" }),
      dateStr: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      minutes: Math.round(totalMinutes),
    };
  });
}

export function calculateStats(sessions: FocusSession[]) {
  const focusSessions = focusOnly(sessions);
  const startOfWeek = startOfWeekWithOffset(0);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todaySessions = focusSessions.filter((s) => new Date(s.created_at) >= startOfDay);
  const weekSessions = focusSessions.filter((s) => new Date(s.created_at) >= startOfWeek);
  return {
    todayMinutes: Math.round(rawMinutes(todaySessions)),
    todaySessions: todaySessions.length,
    todayCompleted: todaySessions.filter((s) => s.completed).length,
    weekMinutes: Math.round(rawMinutes(weekSessions)),
    weekSessions: weekSessions.length,
    weekCompleted: weekSessions.filter((s) => s.completed).length,
  };
}

export function calculateComparisonStats(sessions: FocusSession[], weekOffset: number) {
  const focusSessions = focusOnly(sessions);
  const startOfThisWeek = startOfWeekWithOffset(weekOffset);
  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
  // "This week" has no upper bound, so older weeks include everything after them.
  const thisWeekSessions = focusSessions.filter((s) => new Date(s.created_at) >= startOfThisWeek);
  const lastWeekSessions = focusSessions.filter((s) => inRange(s, startOfLastWeek, startOfThisWeek));
  return {
    thisWeek: { minutes: Math.round(rawMinutes(thisWeekSessions)), sessions: thisWeekSessions.length },
    lastWeek: { minutes: Math.round(rawMinutes(lastWeekSessions)), sessions: lastWeekSessions.length },
  };
}

export interface DailyComparison {
  date: Date;
  day: string;
  thisWeekMinutes: number;
  lastWeekMinutes: number;
}

export function getDailyComparisonData(sessions: FocusSession[], weekOffset: number): DailyComparison[] {
  const focusSessions = focusOnly(sessions);
  const startOfThisWeek = startOfWeekWithOffset(weekOffset);
  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
  return Array.from({ length: 7 }, (_, i) => {
    const thisWeekDay = new Date(startOfThisWeek);
    thisWeekDay.setDate(thisWeekDay.getDate() + i);
    const thisWeekDayEnd = new Date(thisWeekDay);
    thisWeekDayEnd.setDate(thisWeekDayEnd.getDate() + 1);
    const lastWeekDay = new Date(startOfLastWeek);
    lastWeekDay.setDate(lastWeekDay.getDate() + i);
    const lastWeekDayEnd = new Date(lastWeekDay);
    lastWeekDayEnd.setDate(lastWeekDayEnd.getDate() + 1);
    return {
      date: thisWeekDay,
      day: thisWeekDay.toLocaleDateString("en-US", { weekday: "short" }),
      thisWeekMinutes: Math.round(rawMinutes(focusSessions.filter((s) => inRange(s, thisWeekDay, thisWeekDayEnd)))),
      lastWeekMinutes: Math.round(rawMinutes(focusSessions.filter((s) => inRange(s, lastWeekDay, lastWeekDayEnd)))),
    };
  });
}

export function getYTicks(dayData: DayData[]): number[] {
  const maxValue = Math.max(...dayData.map((d) => d.minutes));
  if (maxValue <= 60) return [0, 15, 30, 45, 60];
  if (maxValue <= 120) return [0, 30, 60, 90, 120];
  if (maxValue <= 180) return [0, 30, 60, 90, 120, 150, 180];
  if (maxValue <= 240) return [0, 60, 120, 180, 240];
  if (maxValue <= 360) return [0, 60, 120, 180, 240, 300, 360];
  const interval = 60;
  const ticks: number[] = [];
  for (let i = 0; i <= Math.ceil(maxValue / interval) * interval; i += interval) ticks.push(i);
  return ticks;
}

export function chartLayout(period: DailyFocusPeriod, numDays: number) {
  if (period === "custom") {
    return {
      height: numDays > 60 ? 280 : numDays > 14 ? 240 : 200,
      bottom: numDays > 60 ? 50 : numDays > 14 ? 40 : 25,
      interval: numDays > 60 ? 6 : numDays > 14 ? 2 : 0,
      xAxisHeight: numDays > 60 ? 60 : 50,
    };
  }
  const isLong = LONG_PERIODS.includes(period);
  const intervals: Record<Exclude<DailyFocusPeriod, "custom">, number> = { "365days": 29, "180days": 13, "90days": 6, "30days": 2, "7days": 0 };
  return {
    height: isLong ? 280 : period === "30days" ? 240 : 200,
    bottom: isLong ? 50 : period === "30days" ? 40 : 25,
    interval: intervals[period],
    xAxisHeight: isLong ? 60 : 50,
  };
}

export function yAxisFormatter(value: number): string {
  if (value >= 60) {
    const h = Math.floor(value / 60);
    const m = value % 60;
    return m > 0 ? h + "h " + m + "m" : h + "h";
  }
  return value + "m";
}

export function groupSessionsByDate(sessions: FocusSession[]): Record<string, FocusSession[]> {
  const grouped: Record<string, FocusSession[]> = {};
  sessions.forEach((session) => {
    const date = new Date(session.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(session);
  });
  return grouped;
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
}

export { formatClock as formatTimeOnly };

export function formatSessionTime(startTime: string | null | undefined, endTime: string | null | undefined): string {
  if (!startTime) return "N/A";
  const dateOpts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  const start = new Date(startTime);
  const startDateStr = start.toLocaleDateString("en-US", dateOpts);
  const startTimeStr = formatClock(start);
  if (!endTime) return startDateStr + ", " + startTimeStr + " - Incomplete";
  const end = new Date(endTime);
  const endDateStr = end.toLocaleDateString("en-US", dateOpts);
  const endTimeStr = formatClock(end);
  if (startDateStr === endDateStr) return startDateStr + ", " + startTimeStr + " - " + endTimeStr;
  return startDateStr + ", " + startTimeStr + " - " + endDateStr + ", " + endTimeStr;
}

export function formatDuration(session: FocusSession, pauseDuration: number): string {
  if (!session.start_time || !session.end_time) return "N/A";
  const start = new Date(session.start_time).getTime();
  const end = new Date(session.end_time).getTime();
  const totalSeconds = Math.max(0, Math.round((end - start - pauseDuration) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) return Math.floor(minutes / 60) + "h " + (minutes % 60) + "m";
  if (minutes < 1) return seconds + "s";
  return minutes + " min";
}

export function formatTimeValue(minutes: number): { value: string; label: string } {
  if (minutes >= 60) return { value: Math.floor(minutes / 60) + "h " + (minutes % 60) + "m", label: "" };
  return { value: minutes.toString(), label: "minutes" };
}

export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return s.getFullYear() + "-" + pad(s.getMonth() + 1) + "-" + pad(s.getDate()) + "T" + pad(s.getHours()) + ":" + pad(s.getMinutes());
}

export function activeSegments(
  session: FocusSession,
  pauses: { start: string; end: string | null }[],
): { start: Date; end: Date }[] | null {
  if (!session.start_time || !session.end_time || pauses.length === 0) return null;
  const segments: { start: Date; end: Date }[] = [];
  let currentStart = new Date(session.start_time);
  pauses.forEach((pause) => {
    if (pause.end) {
      segments.push({ start: currentStart, end: new Date(pause.start) });
      currentStart = new Date(pause.end);
    }
  });
  segments.push({ start: currentStart, end: new Date(session.end_time) });
  return segments;
}
