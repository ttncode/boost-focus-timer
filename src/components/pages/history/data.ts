import { localDb, type Row } from "../../lib/local-db";

export type FocusSession = Row & {
  user_id?: string;
  goal?: string | null;
  session_type?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  completed?: boolean | null;
};

export type FocusSessionPause = Row & {
  session_id: string;
  pause_start_time: string;
  pause_end_time: string | null;
};

export type Tag = Row & {
  user_id: string;
  name: string;
  color: string;
  archived?: boolean;
};

type Connection = Row & { source_id: string; target_id: string };

export const TAG_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export const PAGE_SIZE = 300;

export async function fetchSessionsPaginated(limit: number, offset: number): Promise<FocusSession[]> {
  const { data, error } = await localDb
    .from<FocusSession>("focus_sessions")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data || [];
}

export async function fetchSessionPauses(sessionId: string): Promise<FocusSessionPause[]> {
  const { data, error } = await localDb
    .from<FocusSessionPause>("focus_session_pauses")
    .select("*")
    .eq("session_id", sessionId)
    .order("pause_start_time", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchSessionsWithTags(userId: string, sessionIds: string[]): Promise<Map<string, Tag[]>> {
  if (sessionIds.length === 0) return new Map();
  const { data: connections, error: connErr } = await localDb
    .from<Connection>("connections")
    .select("source_id, target_id")
    .eq("user_id", userId)
    .eq("source_type", "focus_session")
    .in("source_id", sessionIds)
    .eq("target_type", "tag");
  if (connErr) throw connErr;
  if (!connections || connections.length === 0) return new Map();

  const tagIds = [...new Set(connections.map((c) => c.target_id))];
  const { data: tags, error: tagErr } = await localDb.from<Tag>("tags").select("*").in("id", tagIds);
  if (tagErr) throw tagErr;

  const tagMap = new Map<string, Tag>();
  (tags || []).forEach((t) => tagMap.set(t.id, t));

  const result = new Map<string, Tag[]>();
  connections.forEach((c) => {
    const tag = tagMap.get(c.target_id);
    if (!tag) return;
    const list = result.get(c.source_id) || [];
    list.push(tag);
    result.set(c.source_id, list);
  });
  return result;
}

export async function fetchSessionsForDateRange(
  startDate: Date,
  endDate: Date,
): Promise<{ sessions: FocusSession[]; pauseMap: Map<string, number> }> {
  let allSessions: FocusSession[] = [];
  const batchSize = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await localDb
      .from<FocusSession>("focus_sessions")
      .select("*")
      .eq("session_type", "focus")
      .not("start_time", "is", null)
      .not("end_time", "is", null)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: true })
      .range(offset, offset + batchSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allSessions = allSessions.concat(data);
    if (data.length < batchSize) break;
    offset += batchSize;
  }

  const sessionIds = allSessions.map((s) => s.id);
  const pauseMap = new Map<string, number>();
  if (sessionIds.length > 0) {
    const { data: pauses, error: pErr } = await localDb
      .from<FocusSessionPause>("focus_session_pauses")
      .select("*")
      .in("session_id", sessionIds);
    if (!pErr && pauses) {
      pauses.forEach((p) => {
        if (p.pause_end_time) {
          const dur = new Date(p.pause_end_time).getTime() - new Date(p.pause_start_time).getTime();
          pauseMap.set(p.session_id, (pauseMap.get(p.session_id) || 0) + dur);
        }
      });
    }
  }
  return { sessions: allSessions, pauseMap };
}

export async function fetchTags(userId: string, includeArchived: boolean): Promise<Tag[]> {
  let query = localDb.from<Tag>("tags").select("*").eq("user_id", userId);
  // Rows written without an `archived` column count as active.
  if (!includeArchived) query = query.not("archived", "eq", true);
  const { data, error } = await query.order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createTagInDb(userId: string, name: string, color: string): Promise<Tag> {
  const { data: existing } = await localDb.from<Tag>("tags").select("*").eq("user_id", userId).eq("name", name.trim());
  // localStorage has no unique constraints, so (user_id, name) uniqueness is enforced here.
  if (existing && existing.length > 0) throw new Error("duplicate key value violates unique constraint");
  const { data, error } = await localDb
    .from<Tag>("tags")
    .insert([{ user_id: userId, name: name.trim(), color, archived: false }])
    .select()
    .single();
  if (error || !data) throw error ?? new Error("Failed to create tag");
  return data;
}

export async function addTagToSession(userId: string, sessionId: string, tagId: string): Promise<void> {
  await localDb.from("connections").insert([
    { user_id: userId, source_type: "focus_session", source_id: sessionId, target_type: "tag", target_id: tagId },
  ]);
}

export async function removeTagFromSession(userId: string, sessionId: string, tagId: string): Promise<void> {
  await localDb
    .from("connections")
    .delete()
    .eq("user_id", userId)
    .eq("source_type", "focus_session")
    .eq("source_id", sessionId)
    .eq("target_type", "tag")
    .eq("target_id", tagId);
}

export async function updateSession(id: string, data: Partial<FocusSession>): Promise<void> {
  const { error } = await localDb
    .from("focus_sessions")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteSessionById(id: string): Promise<void> {
  const { error } = await localDb.from("focus_sessions").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchFocusTimeByTag(
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<{ sessions: FocusSession[]; sessionTagsMap: Map<string, Tag[]> }> {
  const result = await fetchSessionsForDateRange(startDate, endDate);
  const tagsMap = await fetchSessionsWithTags(userId, result.sessions.map((s) => s.id));
  return { sessions: result.sessions, sessionTagsMap: tagsMap };
}

export function readStored(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function store(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the preference just isn't remembered.
  }
}
