import type { Row } from "../../lib/local-db";

export interface HabitData {
  name?: string;
  description?: string;
  color?: string;
  position?: number;
  archived?: boolean;
  is_suggested?: boolean;
}
export interface HabitLogData {
  habit_id: string;
  completed_date: string;
}
export interface HabitNoteData {
  habit_id: string;
  note_date: string;
  content?: string;
}

export type HabitRow = Row & { user_id: string; type: string; data: HabitData };
export type HabitLogRow = Row & { user_id: string; type: string; data: HabitLogData };
export type HabitNoteRow = Row & { user_id: string; type: string; data: HabitNoteData };
export type AnyUserDataRow = HabitRow | HabitLogRow | HabitNoteRow;

export interface Habit {
  id: string;
  name: string;
  description: string;
  color: string;
  position: number;
  archived: boolean;
  is_suggested: boolean;
  _data: HabitData;
}
export interface HabitLog {
  id: string;
  habit_id: string;
  completed_date: string;
}
export interface HabitNote {
  id: string;
  habit_id: string;
  note_date: string;
  content: string;
}

export type ViewMode = "7days" | "30days";

export interface HabitColor {
  readonly name: string;
  readonly value: string;
  readonly bg: string;
  readonly hover: string;
  readonly text: string;
}

export const COLORS: readonly HabitColor[] = [
  { name: "Blue", value: "blue", bg: "bg-blue-500", hover: "hover:bg-blue-600", text: "text-blue-400" },
  { name: "Green", value: "green", bg: "bg-green-500", hover: "hover:bg-green-600", text: "text-green-400" },
  { name: "Red", value: "red", bg: "bg-red-500", hover: "hover:bg-red-600", text: "text-red-400" },
  { name: "Yellow", value: "yellow", bg: "bg-yellow-500", hover: "hover:bg-yellow-600", text: "text-yellow-400" },
  { name: "Purple", value: "purple", bg: "bg-purple-500", hover: "hover:bg-purple-600", text: "text-purple-400" },
  { name: "Pink", value: "pink", bg: "bg-pink-500", hover: "hover:bg-pink-600", text: "text-pink-400" },
];

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const colorFor = (color: string): HabitColor => COLORS.find((c) => c.value === color) ?? COLORS[0];

export function localDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export const noteKey = (habitId: string, date: string) => `${habitId}-${date}`;

export function habitFromRow(row: HabitRow): Habit {
  const d = row.data;
  return {
    id: row.id,
    name: d.name || "",
    description: d.description || "",
    color: d.color || "blue",
    position: d.position ?? 0,
    archived: !!d.archived,
    is_suggested: !!d.is_suggested,
    _data: d,
  };
}

export const logFromRow = (row: HabitLogRow): HabitLog => ({ id: row.id, habit_id: row.data.habit_id, completed_date: row.data.completed_date });

export const noteFromRow = (row: HabitNoteRow): HabitNote => ({
  id: row.id,
  habit_id: row.data.habit_id,
  note_date: row.data.note_date,
  content: row.data.content || "",
});

export const byPosition = (a: Habit, b: Habit) => a.position - b.position;

/** Suggested habits float to the top; the rest follow their saved position. */
export const bySuggestedThenPosition = (a: Habit, b: Habit) => Number(b.is_suggested) - Number(a.is_suggested) || a.position - b.position;

export function daysEndingAt(offset: number, viewMode: ViewMode): Date[] {
  const count = viewMode === "7days" ? 7 : 30;
  return Array.from({ length: count }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (count - 1 - i) - offset);
    return date;
  });
}

export function rangeLabel(offset: number, viewMode: ViewMode): string {
  if (offset === 0) return viewMode === "7days" ? "This Week" : "Last 30 Days";
  const days = daysEndingAt(offset, viewMode);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(days[0])} - ${fmt(days[days.length - 1])}`;
}
