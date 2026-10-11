import { getLocalUserId, localDb, type Row } from "./local-db";

export type SessionType = "focus" | "break";

export type FocusSession = Row & {
  user_id: string;
  goal: string;
  planned_duration_minutes: number;
  session_type: SessionType;
  start_time: string | null;
  end_time: string | null;
  completed: boolean;
  last_heartbeat?: string | null;
  os?: string;
  browser?: string;
};

export type Tag = Row & { user_id: string; name: string; color: string; archived: boolean };

export type SessionPause = Row & { session_id: string; pause_start_time: string; pause_end_time: string | null };

export type UserSettings = Row & { user_id: string; auto_shuffle_animations?: boolean };

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error || result.data === null) throw new Error(`Failed to ${what}: ${result.error?.message ?? "no data"}`);
  return result.data;
}

function detectOs(): string {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "Windows";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Mac/i.test(ua)) return "macOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Linux/i.test(ua)) return "Linux";
  return "Unknown";
}

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "Unknown";
}

export const databaseService = {
  async createFocusSession(input: {
    goal: string;
    planned_duration_minutes: number;
    session_type: SessionType;
  }): Promise<FocusSession> {
    const row = {
      ...input,
      user_id: getLocalUserId(),
      start_time: new Date().toISOString(),
      end_time: null,
      completed: false,
      os: detectOs(),
      browser: detectBrowser(),
    };
    return unwrap(await localDb.from<FocusSession>("focus_sessions").insert([row]).select().single(), "create focus session");
  },

  async updateFocusSession(id: string, patch: Partial<FocusSession>): Promise<FocusSession> {
    return unwrap(
      await localDb
        .from<FocusSession>("focus_sessions")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single(),
      "update focus session",
    );
  },

  async getUserFocusSessions(limit = 10): Promise<FocusSession[]> {
    const { data } = await localDb.from<FocusSession>("focus_sessions").select("*").order("created_at", { ascending: false }).limit(limit);
    return data ?? [];
  },

  /** Minutes between start and end of today's finished focus sessions, pauses included. */
  async getTodayFocusMinutes(): Promise<number> {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const { data } = await localDb
      .from<FocusSession>("focus_sessions")
      .select("start_time, end_time")
      .eq("session_type", "focus")
      .gte("created_at", midnight.toISOString())
      .not("start_time", "is", null)
      .not("end_time", "is", null);
    const total = (data ?? []).reduce(
      (sum, row) => sum + (new Date(row.end_time ?? 0).getTime() - new Date(row.start_time ?? 0).getTime()) / 60000,
      0,
    );
    return Math.round(total);
  },

  async getTags(): Promise<Tag[]> {
    const { data } = await localDb
      .from<Tag>("tags")
      .select("*")
      .eq("user_id", getLocalUserId())
      .eq("archived", false)
      .order("name", { ascending: true });
    return data ?? [];
  },

  async createTag(name: string, color = "#3b82f6"): Promise<Tag> {
    const row = { user_id: getLocalUserId(), name: name.trim(), color, archived: false };
    return unwrap(await localDb.from<Tag>("tags").insert([row]).select().single(), "create tag");
  },

  async addTagToSession(sessionId: string, tagId: string): Promise<void> {
    await localDb.from("connections").insert([
      { user_id: getLocalUserId(), source_type: "focus_session", source_id: sessionId, target_type: "tag", target_id: tagId },
    ]);
  },

  async createPause(sessionId: string, startTime = new Date().toISOString()): Promise<SessionPause> {
    const row = { session_id: sessionId, pause_start_time: startTime, pause_end_time: null };
    return unwrap(await localDb.from<SessionPause>("focus_session_pauses").insert([row]).select().single(), "create pause");
  },

  async updatePauseEndTime(id: string, endTime: string): Promise<void> {
    await localDb.from("focus_session_pauses").update({ pause_end_time: endTime }).eq("id", id);
  },

  async getSessionPauses(sessionId: string): Promise<SessionPause[]> {
    const { data } = await localDb
      .from<SessionPause>("focus_session_pauses")
      .select("*")
      .eq("session_id", sessionId)
      .order("pause_start_time", { ascending: true });
    return data ?? [];
  },

  async getUserSettings(): Promise<UserSettings | null> {
    const { data } = await localDb.from<UserSettings>("user_settings").select("*").eq("user_id", getLocalUserId()).maybeSingle();
    return data;
  },

  async updateUserSettings(patch: { auto_shuffle_animations?: boolean }): Promise<void> {
    await localDb
      .from("user_settings")
      .upsert({ user_id: getLocalUserId(), ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  },
};
