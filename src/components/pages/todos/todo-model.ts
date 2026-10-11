import type { Row } from "../../lib/local-db";

/** JSON stored in `user_data.data` for rows of type "todo". */
export interface TodoData {
  title?: string;
  completed?: boolean;
  position?: number;
  estimated_minutes?: number | null;
  is_suggested?: boolean;
  archived?: boolean;
  backlog?: boolean;
  note?: string | null;
  vision_position_x?: number | null;
  vision_position_y?: number | null;
  metadata?: Record<string, unknown>;
  updated_at?: string;
}

export type UserDataRow = Row & { user_id: string; type: string; data: TodoData };

export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  position: number;
  estimated_minutes: number | null;
  is_suggested: boolean;
  archived: boolean;
  backlog: boolean;
  note: string | null;
  _data: TodoData;
}

export type TodoUpdates = Partial<Pick<Todo, "title" | "completed" | "position" | "estimated_minutes" | "is_suggested" | "archived" | "backlog" | "note">>;

export function todoFromRow(row: UserDataRow): Todo {
  const d = row.data;
  return {
    id: row.id,
    title: d.title || "",
    completed: !!d.completed,
    position: d.position ?? 0,
    estimated_minutes: d.estimated_minutes ?? null,
    is_suggested: !!d.is_suggested,
    archived: !!d.archived,
    backlog: !!d.backlog,
    note: d.note ?? null,
    _data: d,
  };
}

export const byPosition = (a: Todo, b: Todo) => a.position - b.position;

export function formatTime(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
