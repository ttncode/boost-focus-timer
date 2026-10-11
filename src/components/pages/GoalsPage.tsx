"use client";

import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Archive, ArchiveRestore, Plus } from "../icons";
import { useHotkey } from "../hotkeys/HotkeysProvider";
import { localDb, type ChangePayload } from "../lib/local-db";
import { GoalCard, type EditDraft } from "./goals/GoalCard";
import {
  byPosition,
  deleteUserDataRow,
  saveGoalData,
  toComment,
  toGoal,
  todayIso,
  type CommentsByGoal,
  type Goal,
  type GoalData,
  type UserDataRow,
} from "./goals/goal-rows";
import { useDialog } from "../dialogs/DialogProvider";

const DELETE_GOAL_PROMPT =
  "Are you sure you want to permanently delete this goal?\n\nConsider archiving it instead to keep your history.";

function groupComments(rows: readonly UserDataRow[]): CommentsByGoal {
  const grouped: Record<string, ReturnType<typeof toComment>[]> = {};
  rows.map(toComment).forEach((comment) => {
    (grouped[comment.goalId] ??= []).push(comment);
  });
  return grouped;
}

/** Reassigns `position` from array order; returns only the goals whose position changed. */
function renumber(list: readonly Goal[]): { list: Goal[]; changed: Goal[] } {
  const next = list.map((goal, i) => (goal.data.position === i ? goal : { ...goal, data: { ...goal.data, position: i } }));
  return { list: next, changed: next.filter((goal, i) => goal !== list[i]) };
}

export function GoalsPage({ userId }: { userId: string }) {
  const dialog = useDialog();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [comments, setComments] = useState<CommentsByGoal>({});
  const [loading, setLoading] = useState(true);
  const [newGoal, setNewGoal] = useState("");
  const [newGoalDate, setNewGoalDate] = useState(todayIso);
  const [saving, setSaving] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<(EditDraft & { id: string }) | null>(null);
  const [commentsOpenId, setCommentsOpenId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useHotkey("list.new", () => inputRef.current?.focus());
  // Realtime echoes of our own position writes would fight the optimistic order, so drop them mid-reorder.
  const reorderingRef = useRef(false);

  useEffect(() => {
    const rowsOfType = (type: string) =>
      localDb.from<UserDataRow>("user_data").select("*").eq("user_id", userId).eq("type", type);

    Promise.all([rowsOfType("goal"), rowsOfType("goal_comment").order("created_at", { ascending: false })]).then(
      ([goalRes, commentRes]) => {
        setGoals((goalRes.data ?? []).map(toGoal).sort(byPosition));
        setComments(groupComments(commentRes.data ?? []));
        setLoading(false);
      },
    );

    const onChange = (payload: ChangePayload<UserDataRow>) => {
      if (reorderingRef.current) return;
      const row = payload.eventType === "DELETE" ? (payload.old as UserDataRow) : payload.new;
      if (row.user_id !== userId) return;
      if (row.type === "goal") applyGoalChange(payload.eventType, row);
      if (row.type === "goal_comment") applyCommentChange(payload.eventType, row);
    };

    const applyGoalChange = (event: ChangePayload<UserDataRow>["eventType"], row: UserDataRow) => {
      if (event === "DELETE") return setGoals((prev) => prev.filter((goal) => goal.id !== row.id));
      const incoming = toGoal(row);
      setGoals((prev) => {
        const exists = prev.some((goal) => goal.id === row.id);
        if (event === "INSERT" && exists) return prev;
        const next = exists ? prev.map((goal) => (goal.id === row.id ? incoming : goal)) : [...prev, incoming];
        return next.sort(byPosition);
      });
    };

    const applyCommentChange = (event: ChangePayload<UserDataRow>["eventType"], row: UserDataRow) => {
      if (event === "DELETE") {
        setComments((prev) =>
          Object.fromEntries(Object.entries(prev).map(([goalId, list]) => [goalId, list.filter((c) => c.id !== row.id)])),
        );
        return;
      }
      if (event !== "INSERT") return;
      const comment = toComment(row);
      setComments((prev) => {
        const list = prev[comment.goalId] ?? [];
        if (list.some((c) => c.id === comment.id)) return prev;
        return { ...prev, [comment.goalId]: [comment, ...list] };
      });
    };

    const channel = localDb
      .channel(`user_data_goals:${userId}`)
      .on<UserDataRow>(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_data", filter: `user_id=eq.${userId}` },
        onChange,
      )
      .subscribe();
    return () => localDb.removeChannel(channel);
  }, [userId]);

  const updateGoal = (id: string, patch: Partial<GoalData>) => {
    const goal = goals.find((g) => g.id === id);
    if (!goal) return;
    const updated = { ...goal, data: { ...goal.data, ...patch } };
    setGoals((prev) => prev.map((g) => (g.id === id ? updated : g)));
    saveGoalData(updated);
  };

  const addGoal = async (e: FormEvent) => {
    e.preventDefault();
    if (!newGoal.trim()) return;
    setSaving(true);
    const topPosition = goals.length > 0 ? Math.min(...goals.map((g) => g.data.position)) : 1;
    const data: GoalData = {
      content: newGoal.trim(),
      completed: false,
      completed_at: null,
      position: topPosition - 1,
      target_date: newGoalDate || null,
      archived: false,
      is_suggested: false,
      metric_goal_id: null,
    };
    const { error } = await localDb.from("user_data").insert({ user_id: userId, type: "goal", data });
    setSaving(false);
    if (error) {
      console.error("Error adding goal:", error);
      return;
    }
    setNewGoal("");
    setNewGoalDate(todayIso());
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const deleteGoal = async (id: string) => {
    if (!(await dialog.confirm(DELETE_GOAL_PROMPT, { confirmLabel: "Delete", destructive: true }))) return;
    setGoals((prev) => prev.filter((g) => g.id !== id));
    deleteUserDataRow(id);
  };

  const toggleComplete = (goal: Goal) =>
    updateGoal(goal.id, {
      completed: !goal.data.completed,
      completed_at: goal.data.completed ? null : new Date().toISOString(),
      is_suggested: false,
    });

  const addComment = async (goalId: string, content: string): Promise<boolean> => {
    const { error } = await localDb
      .from("user_data")
      .insert({ user_id: userId, type: "goal_comment", data: { goal_id: goalId, content } });
    if (error) console.error("Error adding comment:", error);
    return !error;
  };

  const deleteComment = async (id: string) => {
    if (await dialog.confirm("Delete this comment?", { confirmLabel: "Delete", destructive: true })) deleteUserDataRow(id);
  };

  const persistOrder = async (ordered: readonly Goal[]) => {
    const { list, changed } = renumber(ordered);
    reorderingRef.current = true;
    setGoals(list);
    await Promise.all(changed.map(saveGoalData));
    reorderingRef.current = false;
  };

  const dragOver = (e: DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    setGoals((prev) => {
      const from = prev.findIndex((g) => g.id === draggedId);
      const to = prev.findIndex((g) => g.id === targetId);
      const next = prev.filter((g) => g.id !== draggedId);
      next.splice(to, 0, prev[from]);
      return next;
    });
  };

  const dragEnd = () => {
    if (!draggedId) return;
    setDraggedId(null);
    void persistOrder(goals);
  };

  const activeGoals = goals.filter((g) => !g.data.archived);
  const archivedGoals = goals.filter((g) => g.data.archived);

  const swapActive = (index: number, other: number) => {
    const reordered = [...activeGoals];
    [reordered[index], reordered[other]] = [reordered[other], reordered[index]];
    void persistOrder([...reordered, ...archivedGoals]);
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-400">Loading your goals...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Goals</h1>
        <p className="text-gray-400 text-sm">Track long term goals</p>
      </div>

      <div className="mb-6">
        <form onSubmit={(e) => void addGoal(e)} className="space-y-3">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={newGoal}
              onChange={(e) => setNewGoal(e.target.value)}
              placeholder="Enter a new goal..."
              disabled={saving}
              className="flex-1 min-w-0 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="date"
              value={newGoalDate}
              onChange={(e) => setNewGoalDate(e.target.value)}
              disabled={saving}
              className="w-32 sm:w-auto px-2 sm:px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={saving || !newGoal.trim()}
              className="px-3 sm:px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              <Plus size={20} />
              <span className="hidden sm:inline">Add</span>
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-3">
        {activeGoals.map((goal, index) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            comments={comments[goal.id] ?? []}
            isDragged={draggedId === goal.id}
            isFirst={index === 0}
            isLast={index === activeGoals.length - 1}
            commentsOpen={commentsOpenId === goal.id}
            onToggleComments={() => setCommentsOpenId(commentsOpenId === goal.id ? null : goal.id)}
            onAddComment={(content) => addComment(goal.id, content)}
            onDeleteComment={deleteComment}
            editDraft={editing?.id === goal.id ? editing : null}
            onEditDraft={(draft) => setEditing(draft && { ...draft, id: goal.id })}
            onSave={(content, targetDate) => {
              updateGoal(goal.id, { content, target_date: targetDate, is_suggested: false });
              setEditing(null);
            }}
            onArchive={() => updateGoal(goal.id, { archived: true })}
            onDelete={() => deleteGoal(goal.id)}
            onToggleComplete={() => toggleComplete(goal)}
            onMoveUp={() => swapActive(index, index - 1)}
            onMoveDown={() => swapActive(index, index + 1)}
            onDragStart={() => setDraggedId(goal.id)}
            onDragOver={(e) => dragOver(e, goal.id)}
            onDragEnd={dragEnd}
          />
        ))}

        {activeGoals.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-400">No goals yet. Add one above!</p>
          </div>
        )}
      </div>

      {archivedGoals.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2 mx-auto mb-4"
          >
            <Archive size={16} />
            {showArchived ? "Hide archived goals" : `Show archived goals (${archivedGoals.length})`}
          </button>
          {showArchived && (
            <div className="space-y-3">
              {archivedGoals.map((goal) => (
                <div
                  key={goal.id}
                  className="rounded-lg border p-4 flex items-start gap-3 group transition-colors bg-gray-800/50 border-gray-600"
                >
                  <div className="flex-1">
                    <div className="text-gray-400 line-through">{goal.data.content}</div>
                    {goal.data.target_date && (
                      <div className="text-sm text-gray-500 mt-1">{`Target: ${goal.data.target_date}`}</div>
                    )}
                  </div>
                  <button
                    onClick={() => updateGoal(goal.id, { archived: false })}
                    className="text-gray-500 hover:text-yellow-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                    title="Unarchive goal"
                  >
                    <ArchiveRestore size={20} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
