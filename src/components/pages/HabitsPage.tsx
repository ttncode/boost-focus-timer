"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Archive, ArchiveRestore, Calendar, ChevronLeft, ChevronRight, Plus, Trash2 } from "../icons";
import { hotkeyHint } from "../focus/GoalForm";
import { useHotkey, useHotkeyLabel } from "../hotkeys/HotkeysProvider";
import { localDb } from "../lib/local-db";
import { HabitCard, type HabitEdit } from "./habits/HabitCard";
import { ColorPicker, FIELD_INPUT, FieldLabel, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./habits/HabitFields";
import { NoteModal, type NoteTarget } from "./habits/NoteModal";
import {
  byPosition,
  bySuggestedThenPosition,
  colorFor,
  daysEndingAt,
  habitFromRow,
  localDateString,
  logFromRow,
  noteFromRow,
  noteKey,
  rangeLabel,
  type AnyUserDataRow,
  type Habit,
  type HabitData,
  type HabitLog,
  type HabitLogRow,
  type HabitNote,
  type HabitNoteRow,
  type HabitRow,
  type ViewMode,
} from "./habits/habit-model";
import { useDialog } from "../dialogs/DialogProvider";

type NoteMap = Record<string, HabitNote>;

const REORDER_ECHO_MUTE_MS = 1000;
const table = <T extends AnyUserDataRow>() => localDb.from<T>("user_data");
const saveHabitData = (habit: Habit) => table<HabitRow>().update({ data: habit._data, updated_at: new Date().toISOString() }).eq("id", habit.id);
const renumber = (list: readonly Habit[]) => list.map((h, i) => ({ ...h, position: i, _data: { ...h._data, position: i } }));
const withoutKey = (map: NoteMap, key: string): NoteMap => Object.fromEntries(Object.entries(map).filter(([k]) => k !== key));

function useHabitData(userId: string) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitLog[]>([]);
  const [notes, setNotes] = useState<NoteMap>({});
  const [loading, setLoading] = useState(true);
  // Our own reorder writes echo back through realtime; ignore them briefly so they don't fight the optimistic order.
  const isReorderingRef = useRef(false);

  const loadHabits = useCallback(async () => {
    const { data, error } = await table<HabitRow>().select("*").eq("user_id", userId).eq("type", "habit");
    if (error) console.error("Failed to load habits:", error);
    else setHabits((data ?? []).map(habitFromRow).sort(byPosition));
    setLoading(false);
  }, [userId]);

  const loadCompletions = useCallback(async () => {
    const { data, error } = await table<HabitLogRow>().select("*").eq("user_id", userId).eq("type", "habit_log");
    if (error) console.error("Failed to load completions:", error);
    else setCompletions((data ?? []).map(logFromRow));
  }, [userId]);

  const loadNotes = useCallback(async () => {
    const { data, error } = await table<HabitNoteRow>().select("*").eq("user_id", userId).eq("type", "habit_note");
    if (error) console.error("Failed to load notes:", error);
    else setNotes(Object.fromEntries((data ?? []).map(noteFromRow).map((n) => [noteKey(n.habit_id, n.note_date), n])));
  }, [userId]);

  useEffect(() => {
    void loadHabits();
    void loadCompletions();
    void loadNotes();
    const channel = localDb
      .channel("user_data_habits:" + userId)
      .on<AnyUserDataRow>("postgres_changes", { event: "*", schema: "public", table: "user_data", filter: "user_id=eq." + userId }, (payload) => {
        if (isReorderingRef.current) return;
        // DELETE events carry `new: {}` with no `type`; local optimistic state already handles deletes.
        const row = payload.new || payload.old;
        if (!row) return;
        const { eventType } = payload;
        if (row.type === "habit") {
          const habitRow = payload.new as HabitRow;
          if (eventType === "INSERT") setHabits((prev) => (prev.some((h) => h.id === row.id) ? prev : [...prev, habitFromRow(habitRow)].sort(byPosition)));
          else if (eventType === "UPDATE") setHabits((prev) => prev.map((h) => (h.id === row.id ? habitFromRow(habitRow) : h)).sort(byPosition));
          else setHabits((prev) => prev.filter((h) => h.id !== payload.old.id));
        } else if (row.type === "habit_log") {
          if (eventType === "INSERT") setCompletions((prev) => (prev.some((c) => c.id === row.id) ? prev : [...prev, logFromRow(payload.new as HabitLogRow)]));
          else if (eventType === "DELETE") setCompletions((prev) => prev.filter((c) => c.id !== payload.old.id));
        } else if (row.type === "habit_note") {
          if (eventType === "DELETE") {
            const gone = noteFromRow(payload.old as HabitNoteRow);
            setNotes((prev) => withoutKey(prev, noteKey(gone.habit_id, gone.note_date)));
          } else {
            const note = noteFromRow(payload.new as HabitNoteRow);
            setNotes((prev) => ({ ...prev, [noteKey(note.habit_id, note.note_date)]: note }));
          }
        }
      })
      .subscribe();
    return () => localDb.removeChannel(channel);
  }, [loadHabits, loadCompletions, loadNotes, userId]);

  const persistOrder = async (list: readonly Habit[]) => {
    isReorderingRef.current = true;
    try {
      await Promise.all(list.map((h) => Promise.resolve(saveHabitData(h))));
    } catch (err) {
      console.error("Failed to reorder habits:", err);
      void loadHabits();
    } finally {
      setTimeout(() => {
        isReorderingRef.current = false;
      }, REORDER_ECHO_MUTE_MS);
    }
  };

  return { habits, setHabits, completions, setCompletions, notes, setNotes, loading, loadCompletions, persistOrder };
}

function ArchivedHabits({ habits, onRestore, onDelete }: { habits: readonly Habit[]; onRestore(habit: Habit): void; onDelete(habit: Habit): void }) {
  const [open, setOpen] = useState(false);
  useHotkey("list.archived", () => setOpen((current) => !current), habits.length > 0);
  const archivedCombo = useHotkeyLabel("list.archived");
  if (habits.length === 0) return null;
  const iconButton = "text-gray-500 transition-colors p-2 rounded-lg hover:bg-gray-800 opacity-0 group-hover:opacity-100";
  return (
    <div className="mt-8">
      <button onClick={() => setOpen(!open)} title={hotkeyHint(open ? "Hide archived" : "Show archived", archivedCombo)} className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2 mx-auto mb-4">
        <Archive size={16} />
        {open ? "Hide archived habits" : `Show archived habits (${habits.length})`}
      </button>
      {open && (
        <div className="space-y-4">
          {habits.map((habit) => (
            <div key={habit.id} className="bg-gray-900/50 rounded-xl p-6 border border-gray-700">
              <div className="flex items-start justify-between mb-4 group">
                <div className="flex-1">
                  <h3 className={"text-lg font-semibold " + colorFor(habit.color).text + " opacity-60"}>{habit.name}</h3>
                  {habit.description && <p className="text-gray-500 text-sm mt-1">{habit.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => onRestore(habit)} className={iconButton + " hover:text-blue-400"} title="Unarchive habit">
                    <ArchiveRestore className="w-4 h-4" />
                  </button>
                  <button onClick={() => onDelete(habit)} className={iconButton + " hover:text-red-400"} title="Delete permanently">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateHabitForm({ onCreate, onClose }: { onCreate(edit: HabitEdit): Promise<boolean>; onClose(): void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("blue");
  const submit = async () => {
    if (!name.trim()) return;
    if (await onCreate({ name: name.trim(), description: description.trim(), color })) onClose();
  };
  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
      <h3 className="text-lg font-semibold text-white mb-4">Create Habit</h3>
      <div className="space-y-4">
        <div>
          <FieldLabel>Habit Name</FieldLabel>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} placeholder="e.g., Exercise, Read, Meditate" autoFocus className={FIELD_INPUT} />
        </div>
        <div>
          <FieldLabel>Description (Optional)</FieldLabel>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add a note about this habit" className={FIELD_INPUT} />
        </div>
        <ColorPicker value={color} onChange={setColor} />
        <div className="flex gap-3 pt-4">
          <button onClick={() => void submit()} disabled={!name.trim()} className={PRIMARY_BUTTON}>
            Create Habit
          </button>
          <button onClick={onClose} className={SECONDARY_BUTTON}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function HabitsPage({ userId }: { userId: string }) {
  const dialog = useDialog();
  const { habits, setHabits, completions, setCompletions, notes, setNotes, loading, loadCompletions, persistOrder } = useHabitData(userId);
  const [showAddForm, setShowAddForm] = useState(false);
  useHotkey("list.new", () => setShowAddForm(true));
  const [dayOffset, setDayOffset] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("7days");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [editingHabit, setEditingHabit] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openMenuId]);

  const archivedHabits = useMemo(() => habits.filter((h) => h.archived), [habits]);
  const sortedActive = useMemo(() => habits.filter((h) => !h.archived).sort(bySuggestedThenPosition), [habits]);
  const nonSuggested = useMemo(() => sortedActive.filter((h) => !h.is_suggested), [sortedActive]);
  const days = daysEndingAt(dayOffset, viewMode);

  const isCompleted = (habitId: string, date: string) => completions.some((c) => c.habit_id === habitId && c.completed_date === date);

  const updateHabit = async (id: string, updates: Partial<HabitData>) => {
    const original = habits.find((h) => h.id === id);
    if (!original) return;
    const updated: Habit = { ...original, ...updates, _data: { ...original._data, ...updates } };
    setHabits((prev) => prev.map((h) => (h.id === id ? updated : h)));
    const { error } = await saveHabitData(updated);
    if (!error) return;
    console.error("Failed to update habit:", error);
    setHabits((prev) => prev.map((h) => (h.id === id ? original : h)));
  };

  const createHabit = async ({ name, description, color }: HabitEdit): Promise<boolean> => {
    const data: HabitData = { name, description, color, position: habits.length, archived: false, is_suggested: false };
    const { error } = await table<HabitRow>().insert({ user_id: userId, type: "habit", data });
    if (error) console.error("Failed to create habit:", error);
    return !error;
  };

  const deleteHabit = async (habit: Habit) => {
    const confirmText = "Are you sure you want to permanently delete this habit? This will delete all tracking history.";
    if (!habit.is_suggested && !(await dialog.confirm(confirmText, { confirmLabel: "Delete", destructive: true }))) return;
    const backup = { habits, completions, notes };
    const relatedLogIds = completions.filter((c) => c.habit_id === habit.id).map((c) => c.id);
    const relatedNoteIds = Object.values(notes).filter((n) => n.habit_id === habit.id).map((n) => n.id);
    setHabits((prev) => prev.filter((h) => h.id !== habit.id));
    setCompletions((prev) => prev.filter((c) => c.habit_id !== habit.id));
    setNotes((prev) => Object.fromEntries(Object.entries(prev).filter(([, n]) => n.habit_id !== habit.id)));
    const { error } = await table().delete().in("id", [...relatedLogIds, ...relatedNoteIds, habit.id]);
    if (!error) return;
    console.error("Failed to delete habit:", error);
    setHabits(backup.habits);
    setCompletions(backup.completions);
    setNotes(backup.notes);
  };

  const toggleCompletion = async (habit: Habit, date: string) => {
    if (habit.is_suggested) await updateHabit(habit.id, { is_suggested: false });
    const existing = completions.find((c) => c.habit_id === habit.id && c.completed_date === date);
    if (existing) {
      setCompletions((prev) => prev.filter((c) => c.id !== existing.id));
      const { error } = await table().delete().eq("id", existing.id);
      if (error) {
        console.error("Failed to remove completion:", error);
        void loadCompletions();
      }
      return;
    }
    const { data, error } = await table<HabitLogRow>().insert({ user_id: userId, type: "habit_log", data: { habit_id: habit.id, completed_date: date } }).select().single();
    if (error || !data) {
      console.error("Failed to add completion:", error);
      return;
    }
    const log = logFromRow(data);
    // The realtime echo may already have added it.
    setCompletions((prev) => (prev.some((c) => c.id === log.id) ? prev : [...prev, log]));
  };

  const openNote = (habit: Habit, date: Date) => {
    const dateString = localDateString(date);
    setNoteTarget({
      habitId: habit.id,
      habitName: habit.name,
      date: date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }),
      dateString,
    });
    setNoteContent(notes[noteKey(habit.id, dateString)]?.content ?? "");
  };

  const closeNote = () => {
    setNoteTarget(null);
    setNoteContent("");
  };

  const saveNote = async () => {
    if (!noteTarget || !noteContent.trim()) return;
    setSavingNote(true);
    const key = noteKey(noteTarget.habitId, noteTarget.dateString);
    const existing = notes[key];
    const content = noteContent.trim();
    const data = { habit_id: noteTarget.habitId, note_date: noteTarget.dateString, content };
    const result = existing
      ? await table().update({ data, updated_at: new Date().toISOString() }).eq("id", existing.id)
      : await table<HabitNoteRow>().insert({ user_id: userId, type: "habit_note", data }).select().single();
    setSavingNote(false);
    if (result.error) {
      console.error("Failed to save note:", result.error);
      return;
    }
    const saved = existing ? { ...existing, content } : noteFromRow(result.data as HabitNoteRow);
    setNotes((prev) => ({ ...prev, [key]: saved }));
    closeNote();
  };

  const deleteNote = async () => {
    if (!noteTarget) return;
    const key = noteKey(noteTarget.habitId, noteTarget.dateString);
    const existing = notes[key];
    if (!existing || !(await dialog.confirm("Delete this note?", { confirmLabel: "Delete", destructive: true }))) return;
    const { error } = await table().delete().eq("id", existing.id);
    if (error) {
      console.error("Failed to delete note:", error);
      return;
    }
    setNotes((prev) => withoutKey(prev, key));
    closeNote();
  };

  const handleDragOver = (e: DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setHabits((prev) => {
      const active = prev.filter((h) => !h.archived).sort(bySuggestedThenPosition);
      const dragged = active[draggedIndex];
      if (!dragged) return prev;
      const reordered = active.filter((_, i) => i !== draggedIndex);
      reordered.splice(index, 0, dragged);
      return [...renumber(reordered), ...prev.filter((h) => h.archived)];
    });
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    if (draggedIndex === null) return;
    setDraggedIndex(null);
    void persistOrder(habits.filter((h) => !h.archived));
  };

  const moveHabit = (habit: Habit, direction: "up" | "down") => {
    const list = [...nonSuggested];
    const index = list.findIndex((h) => h.id === habit.id);
    const swap = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swap < 0 || swap >= list.length) return;
    [list[index], list[swap]] = [list[swap], list[index]];
    const updated = renumber(list);
    setHabits([...sortedActive.filter((h) => h.is_suggested), ...updated, ...archivedHabits]);
    void persistOrder(updated);
  };

  const pickView = (mode: ViewMode) => {
    setViewMode(mode);
    setDayOffset(0);
  };
  // The period bar is only rendered while there are active habits.
  const hasPeriodBar = !loading && sortedActive.length > 0;
  const previousPeriod = () => setDayOffset(dayOffset + 1);
  const nextPeriod = () => dayOffset > 0 && setDayOffset(dayOffset - 1);
  useHotkey("list.prev", previousPeriod, hasPeriodBar);
  useHotkey("list.next", nextPeriod, hasPeriodBar);
  useHotkey("list.range", () => pickView(viewMode === "7days" ? "30days" : "7days"), hasPeriodBar);
  const prevCombo = useHotkeyLabel("list.prev");
  const nextCombo = useHotkeyLabel("list.next");
  const rangeCombo = useHotkeyLabel("list.range");
  const viewButton = (mode: ViewMode) => "px-3 py-1 text-sm rounded-md transition-colors " + (viewMode === mode ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-400">Loading habits...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Habits</h1>
          <p className="text-gray-400">Track your daily habits</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAddForm(!showAddForm)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Habit</span>
          </button>
        </div>
      </div>

      {showAddForm && <CreateHabitForm onCreate={createHabit} onClose={() => setShowAddForm(false)} />}

      {sortedActive.length === 0 ? (
        <div className="text-center py-12 px-4">
          <Calendar className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No habits yet. Add one above!</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-gray-900 rounded-xl p-4 border border-gray-800">
            <button onClick={previousPeriod} title={hotkeyHint("Previous period", prevCombo)} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-4">
              <span className="text-white font-medium">{rangeLabel(dayOffset, viewMode)}</span>
              <div className="flex bg-gray-800 rounded-lg p-1" title={hotkeyHint("Switch 7 / 30 days", rangeCombo)}>
                <button onClick={() => pickView("7days")} className={viewButton("7days")}>
                  7 Days
                </button>
                <button onClick={() => pickView("30days")} className={viewButton("30days")}>
                  30 Days
                </button>
              </div>
            </div>
            <button
              onClick={nextPeriod}
              disabled={dayOffset === 0}
              title={hotkeyHint("Next period", nextCombo)}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {sortedActive.map((habit, index) => {
            const order = nonSuggested.findIndex((h) => h.id === habit.id);
            return (
              <HabitCard
                key={habit.id}
                habit={habit}
                days={days}
                viewMode={viewMode}
                notes={notes}
                isCompleted={isCompleted}
                dragging={draggedIndex === index}
                menuOpen={openMenuId === habit.id}
                editing={editingHabit === habit.id}
                canMoveUp={order > 0}
                canMoveDown={order >= 0 && order < nonSuggested.length - 1}
                onDragStart={() => setDraggedIndex(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                onToggleMenu={() => setOpenMenuId(openMenuId === habit.id ? null : habit.id)}
                onStartEdit={() => {
                  setEditingHabit(habit.id);
                  setOpenMenuId(null);
                }}
                onCancelEdit={() => setEditingHabit(null)}
                onSaveEdit={async (edit) => {
                  await updateHabit(habit.id, { ...edit, is_suggested: false });
                  setEditingHabit(null);
                }}
                onArchive={() => {
                  void updateHabit(habit.id, { archived: !habit.archived });
                  setOpenMenuId(null);
                }}
                onAccept={() => void updateHabit(habit.id, { is_suggested: false })}
                onDecline={() => void deleteHabit(habit)}
                onMove={(direction) => moveHabit(habit, direction)}
                onToggleDay={(date) => void toggleCompletion(habit, date)}
                onOpenNote={(date) => openNote(habit, date)}
              />
            );
          })}
        </div>
      )}

      <ArchivedHabits habits={archivedHabits} onRestore={(habit) => void updateHabit(habit.id, { archived: false })} onDelete={(habit) => void deleteHabit(habit)} />

      {noteTarget && (
        <NoteModal
          target={noteTarget}
          content={noteContent}
          saving={savingNote}
          hasExisting={!!notes[noteKey(noteTarget.habitId, noteTarget.dateString)]}
          onChange={setNoteContent}
          onCancel={closeNote}
          onSave={() => void saveNote()}
          onDelete={() => void deleteNote()}
        />
      )}
    </div>
  );
}
