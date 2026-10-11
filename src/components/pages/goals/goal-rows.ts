import { localDb, type Row } from "../../lib/local-db";

/** Goals and their comments live in the shared `user_data` table, discriminated by `type`. */
export type UserDataRow = Row & { user_id: string; type: string; data: Record<string, unknown> };

export interface GoalData {
  content: string;
  completed: boolean;
  completed_at: string | null;
  position: number;
  target_date: string | null;
  archived: boolean;
  is_suggested: boolean;
  metric_goal_id: string | null;
}

export interface Goal {
  readonly id: string;
  readonly data: GoalData;
}

export interface GoalComment {
  readonly id: string;
  readonly goalId: string;
  readonly content: string;
  readonly createdAt: string;
}

export type CommentsByGoal = Readonly<Record<string, readonly GoalComment[]>>;

export function toGoal(row: UserDataRow): Goal {
  const d = row.data;
  return {
    id: row.id,
    // Spread first so unknown keys written by other clients survive our updates.
    data: {
      ...d,
      content: typeof d.content === "string" ? d.content : "",
      completed: Boolean(d.completed),
      completed_at: typeof d.completed_at === "string" ? d.completed_at : null,
      position: typeof d.position === "number" ? d.position : 0,
      target_date: typeof d.target_date === "string" && d.target_date ? d.target_date : null,
      archived: Boolean(d.archived),
      is_suggested: Boolean(d.is_suggested),
      metric_goal_id: typeof d.metric_goal_id === "string" ? d.metric_goal_id : null,
    },
  };
}

export function toComment(row: UserDataRow): GoalComment {
  return {
    id: row.id,
    goalId: String(row.data.goal_id),
    content: typeof row.data.content === "string" ? row.data.content : "",
    createdAt: row.created_at,
  };
}

export const byPosition = (a: Goal, b: Goal): number => a.data.position - b.data.position;

/** `YYYY-MM-DD` of the current UTC day, the value the date inputs start with. */
export const todayIso = (): string => new Date().toISOString().slice(0, 10);

export function saveGoalData(goal: Goal): void {
  localDb
    .from("user_data")
    .update({ data: goal.data, updated_at: new Date().toISOString() })
    .eq("id", goal.id)
    .then(({ error }) => {
      if (error) console.error("Failed to update goal:", error);
    });
}

export function deleteUserDataRow(id: string): void {
  localDb
    .from("user_data")
    .delete()
    .eq("id", id)
    .then(({ error }) => {
      if (error) console.error("Failed to delete row:", error);
    });
}

const MINUTE_MS = 60_000;

export function formatCommentAge(iso: string): string {
  const now = Date.now();
  const minutes = Math.floor((now - new Date(iso).getTime()) / MINUTE_MS);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
