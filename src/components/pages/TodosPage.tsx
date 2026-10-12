"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Archive, ArchiveRestore, Clock, ListTodo, Plus, Trash2 } from "../icons";
import { hotkeyHint } from "../focus/GoalForm";
import { useHotkey, useHotkeyLabel } from "../hotkeys/HotkeysProvider";
import { localDb } from "../lib/local-db";
import { TodoItem, type TodoItemHandlers } from "./todos/TodoItem";
import { byPosition, formatTime, todoFromRow, type Todo, type TodoData, type TodoUpdates, type UserDataRow } from "./todos/todo-model";

type ListKind = "main" | "backlog";

const MAIN_LIST_ID = "main-list";
const BACKLOG_LIST_ID = "backlog-list";
const REORDER_ECHO_MUTE_MS = 1000;

const table = () => localDb.from<UserDataRow>("user_data");
const now = () => new Date().toISOString();
const saveData = (id: string, data: TodoData) => table().update({ data, updated_at: now() }).eq("id", id);

function DroppableList({ id, className, children }: { id: string; className: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={className + (isOver ? " ring-2 ring-blue-500/50" : "")}>
      {children}
    </div>
  );
}

function TodoStats({ todos }: { todos: readonly Todo[] }) {
  const completedCount = todos.filter((t) => t.completed).length;
  const totalMinutes = todos.reduce((sum, t) => sum + (t.estimated_minutes || 0), 0);
  const remainingMinutes = todos.filter((t) => !t.completed).reduce((sum, t) => sum + (t.estimated_minutes || 0), 0);
  if (todos.length === 0) return null;
  return (
    <div className="mt-6 p-4 bg-gray-900 rounded-xl border border-gray-800">
      <div className="flex justify-between text-sm">
        <span className="text-gray-400">
          {completedCount} of {todos.length} completed
        </span>
        <span className="text-gray-400">{todos.length - completedCount} remaining</span>
      </div>
      {totalMinutes > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-800 space-y-2">
          {remainingMinutes > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Time remaining:</span>
              <span className="text-blue-400 font-medium">{formatTime(remainingMinutes)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Total estimated time:</span>
            <span className="text-white font-medium">{formatTime(totalMinutes)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ArchivedTodos({ todos, onRestore, onDelete }: { todos: readonly Todo[]; onRestore(id: string): void; onDelete(id: string): void }) {
  const [open, setOpen] = useState(false);
  useHotkey("list.archived", () => setOpen((current) => !current), todos.length > 0);
  const archivedCombo = useHotkeyLabel("list.archived");
  if (todos.length === 0) return null;
  return (
    <div className="mt-8">
      <button onClick={() => setOpen(!open)} title={hotkeyHint(open ? "Hide archived" : "Show archived", archivedCombo)} className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2 mx-auto mb-4">
        <Archive size={16} />
        {open ? "Hide archived to-dos" : `Show archived to-dos (${todos.length})`}
      </button>
      {open && (
        <div className="space-y-2">
          {todos.map((todo) => (
            <div key={todo.id} className="flex items-center gap-3 p-4 bg-gray-900/50 border border-gray-800 rounded-xl opacity-60">
              <div className="flex-1">
                <span className="text-gray-400 line-through">{todo.title}</span>
                {todo.estimated_minutes ? (
                  <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                    <Clock className="w-3 h-3" />
                    {todo.estimated_minutes} min
                  </div>
                ) : null}
              </div>
              <button onClick={() => onRestore(todo.id)} className="shrink-0 p-1 text-gray-500 hover:text-blue-400 transition-colors" title="Unarchive to-do">
                <ArchiveRestore className="w-5 h-5" />
              </button>
              <button onClick={() => onDelete(todo.id)} className="shrink-0 p-1 text-gray-500 hover:text-red-400 transition-colors" title="Delete permanently">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TodosPage({ userId, onFocusWithTodo }: { userId: string; onFocusWithTodo(title: string, minutes: number): void }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBacklog, setShowBacklog] = useState(true);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [addTitle, setAddTitle] = useState("");
  const [addMinutes, setAddMinutes] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);
  useHotkey("list.new", () => addInputRef.current?.focus());
  // Our own reorder writes echo back through realtime; ignore them briefly so they don't fight the optimistic order.
  const isReorderingRef = useRef(false);

  const loadTodos = useCallback(async () => {
    const { data, error: fetchError } = await table().select("*").eq("user_id", userId).eq("type", "todo");
    if (fetchError) {
      console.error("Failed to load todos:", fetchError);
      setError("Failed to load to-dos");
    } else {
      setTodos((data ?? []).map(todoFromRow).sort(byPosition));
      setError(null);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadTodos();
    const channel = localDb
      .channel("user_data_todos:" + userId)
      .on<UserDataRow>("postgres_changes", { event: "*", schema: "public", table: "user_data", filter: "user_id=eq." + userId }, (payload) => {
        if (isReorderingRef.current) return;
        // DELETE events carry `new: {}`; local optimistic state already handles deletes.
        const row = payload.new || payload.old;
        if (row && row.type !== "todo") return;
        if (payload.eventType === "INSERT") {
          setTodos((prev) => (prev.some((t) => t.id === payload.new.id) ? prev : [...prev, todoFromRow(payload.new)].sort(byPosition)));
        } else if (payload.eventType === "UPDATE") {
          setTodos((prev) => prev.map((t) => (t.id === payload.new.id ? todoFromRow(payload.new) : t)).sort(byPosition));
        } else {
          setTodos((prev) => prev.filter((t) => t.id !== payload.old.id));
        }
      })
      .subscribe();
    return () => localDb.removeChannel(channel);
  }, [loadTodos, userId]);

  const mainTodos = useMemo(() => todos.filter((t) => !t.archived && !t.backlog && !t.is_suggested).sort(byPosition), [todos]);
  const suggestedTodos = useMemo(() => todos.filter((t) => !t.archived && !t.backlog && t.is_suggested).sort(byPosition), [todos]);
  const backlogTodos = useMemo(() => todos.filter((t) => !t.archived && t.backlog).sort(byPosition), [todos]);
  const archivedTodos = useMemo(() => todos.filter((t) => t.archived), [todos]);
  const mainSectionTodos = useMemo(() => [...suggestedTodos, ...mainTodos], [suggestedTodos, mainTodos]);
  const hasBacklogToggle = mainSectionTodos.length > 0 || backlogTodos.length > 0;
  useHotkey("list.backlog", () => setShowBacklog((current) => !current), hasBacklogToggle);
  const backlogCombo = useHotkeyLabel("list.backlog");

  const updateTodo = async (id: string, updates: TodoUpdates) => {
    const original = todos.find((t) => t.id === id);
    if (!original) return;
    const data: TodoData = { ...original._data, ...updates, updated_at: now() };
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates, _data: data } : t)));
    const { error: updateError } = await saveData(id, data);
    if (!updateError) return;
    console.error("Failed to update todo:", updateError);
    setError("Failed to update to-do");
    setTodos((prev) => prev.map((t) => (t.id === id ? original : t)));
  };

  const addTodo = async () => {
    if (!addTitle.trim()) return;
    const inMain = todos.filter((t) => !t.archived && !t.backlog);
    const data: TodoData = {
      title: addTitle.trim(),
      completed: false,
      position: inMain.length > 0 ? Math.min(...inMain.map((t) => t.position)) - 1 : 0,
      estimated_minutes: addMinutes ? parseInt(addMinutes, 10) : null,
      is_suggested: false,
      archived: false,
      backlog: false,
      note: null,
      vision_position_x: null,
      vision_position_y: null,
      metadata: {},
    };
    const { error: insertError } = await table().insert({ user_id: userId, type: "todo", data });
    if (insertError) {
      console.error("Failed to add todo:", insertError);
      setError("Failed to add to-do");
      return;
    }
    setAddTitle("");
    setAddMinutes("");
    addInputRef.current?.focus();
  };

  const deleteTodo = async (id: string) => {
    const backup = todos;
    setTodos((prev) => prev.filter((t) => t.id !== id));
    const { error: deleteError } = await table().delete().eq("id", id);
    if (!deleteError) return;
    console.error("Failed to delete todo:", deleteError);
    setError("Failed to delete to-do");
    setTodos(backup);
  };

  const persistPositions = async (writes: Promise<unknown>[]) => {
    isReorderingRef.current = true;
    try {
      await Promise.all(writes);
    } catch (err) {
      console.error("Failed to reorder:", err);
      setError("Failed to reorder to-dos");
      void loadTodos();
    } finally {
      setTimeout(() => {
        isReorderingRef.current = false;
      }, REORDER_ECHO_MUTE_MS);
    }
  };

  const reorderList = (ordered: readonly Todo[], kind: ListKind) => {
    const renumbered = ordered.map((todo, index) => ({ ...todo, position: index, _data: { ...todo._data, position: index } }));
    const untouched = todos.filter((t) => t.archived || (kind === "main" ? t.backlog : !t.backlog));
    setTodos([...renumbered, ...untouched].sort(byPosition));
    void persistPositions(renumbered.map((todo) => Promise.resolve(saveData(todo.id, todo._data))));
  };

  const moveTodo = (id: string, to: ListKind, atPosition?: number) => {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;
    const target = todos.filter((t) => !t.archived && (to === "backlog" ? t.backlog : !t.backlog));
    if (atPosition === undefined) {
      const position = target.length > 0 ? Math.max(...target.map((t) => t.position)) + 1 : 0;
      void updateTodo(id, { backlog: to === "backlog", position });
      return;
    }
    const updates = { backlog: to === "backlog", position: atPosition };
    const shifted = target.filter((t) => t.position >= atPosition);
    const shiftedIds = new Set(shifted.map((t) => t.id));
    setTodos((prev) =>
      prev.map((t) => {
        if (t.id === id) return { ...t, ...updates };
        return shiftedIds.has(t.id) ? { ...t, position: t.position + 1 } : t;
      }),
    );
    void persistPositions([
      Promise.resolve(saveData(id, { ...todo._data, ...updates })),
      ...shifted.map((t) => Promise.resolve(saveData(t.id, { ...t._data, position: t.position + 1 }))),
    ]);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id);

  const reorderWithin = (list: readonly Todo[], activeKey: string, overKey: string, kind: ListKind) => {
    const from = list.findIndex((t) => t.id === activeKey);
    const to = list.findIndex((t) => t.id === overKey);
    if (from === -1 || to === -1 || from === to) return;
    const ordered = arrayMove([...list], from, to);
    reorderList(kind === "main" ? ordered.filter((t) => !t.is_suggested) : ordered, kind);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);
    const dragged = todos.find((t) => t.id === activeKey);
    if (!dragged || dragged.archived) return;
    const fromBacklog = dragged.backlog;

    if (overKey === MAIN_LIST_ID || overKey === BACKLOG_LIST_ID) {
      const toBacklog = overKey === BACKLOG_LIST_ID;
      if (fromBacklog !== toBacklog) moveTodo(activeKey, toBacklog ? "backlog" : "main");
      return;
    }

    const target = todos.find((t) => t.id === overKey);
    if (!target || target.archived) return;
    if (!fromBacklog && target.backlog) {
      const index = backlogTodos.findIndex((t) => t.id === overKey);
      moveTodo(activeKey, "backlog", index >= 0 ? index : undefined);
    } else if (fromBacklog && !target.backlog) {
      const index = mainTodos.findIndex((t) => t.id === overKey);
      moveTodo(activeKey, "main", index >= 0 ? index : mainTodos.length);
    } else if (fromBacklog) {
      reorderWithin(backlogTodos, activeKey, overKey, "backlog");
    } else {
      reorderWithin(mainSectionTodos, activeKey, overKey, "main");
    }
  };

  const handlers: TodoItemHandlers = {
    onToggle: (id, completed) => void updateTodo(id, { completed: !completed, is_suggested: false }),
    onUpdateTitle: (id, title) => void updateTodo(id, { title, is_suggested: false }),
    onUpdateTime: (id, minutes) => void updateTodo(id, { estimated_minutes: minutes, is_suggested: false }),
    onUpdateNote: (id, note) => void updateTodo(id, { note, is_suggested: false }),
    onArchive: (id) => void updateTodo(id, { archived: true }),
    onFocus: async (todo) => {
      if (todo.is_suggested) await updateTodo(todo.id, { is_suggested: false });
      // 0 means "no estimate": the timer keeps its current minutes.
      onFocusWithTodo(todo.title, todo.estimated_minutes || 0);
    },
    onAccept: (id) => void updateTodo(id, { is_suggested: false }),
    onDecline: (id) => void deleteTodo(id),
  };

  const activeTodo = activeId ? todos.find((t) => t.id === activeId) : undefined;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-gray-400">Loading to-dos...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">To-Dos</h1>
        <p className="text-gray-400">Keep track of your tasks</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900 border border-red-700 rounded-xl">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="mb-6 space-y-2">
        <div className="flex gap-2">
          <input
            ref={addInputRef}
            type="text"
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void addTodo()}
            placeholder="Add a new to-do..."
            className="flex-1 min-w-0 px-4 py-3 bg-gray-900 border border-gray-700 text-white rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder-gray-500"
          />
          <input
            type="number"
            value={addMinutes}
            onChange={(e) => setAddMinutes(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void addTodo()}
            placeholder="Min"
            min="1"
            className="w-16 sm:w-20 px-2 sm:px-3 py-3 bg-gray-900 border border-gray-700 text-white rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder-gray-500 text-center"
          />
          <button onClick={() => void addTodo()} className="px-3 sm:px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 rounded-xl transition-all flex items-center gap-2">
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Add</span>
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <DroppableList id={MAIN_LIST_ID} className="space-y-2 min-h-[50px] rounded-xl transition-all">
          <SortableContext items={mainSectionTodos.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {mainSectionTodos.length > 0 ? (
              mainSectionTodos.map((todo) => <TodoItem key={todo.id} todo={todo} variant={todo.is_suggested ? "suggested" : "main"} handlers={handlers} />)
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500">No to-dos yet. Add one above!</p>
              </div>
            )}
          </SortableContext>
        </DroppableList>

        <TodoStats todos={mainTodos} />

        {hasBacklogToggle && (
          <div className="mt-6">
            <button onClick={() => setShowBacklog(!showBacklog)} title={hotkeyHint(showBacklog ? "Hide backlog" : "Show backlog", backlogCombo)} className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2 mx-auto mb-4">
              <ListTodo size={16} />
              {showBacklog ? "Hide backlog" : `Show backlog (${backlogTodos.length})`}
            </button>
            {showBacklog && (
              <DroppableList id={BACKLOG_LIST_ID} className={"space-y-2 min-h-[50px] rounded-xl transition-all " + (backlogTodos.length === 0 ? "p-3 border border-dashed border-gray-800" : "")}>
                <SortableContext items={backlogTodos.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  {backlogTodos.length > 0 ? (
                    backlogTodos.map((todo) => <TodoItem key={todo.id} todo={todo} variant="backlog" handlers={handlers} />)
                  ) : (
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                      <ListTodo className="w-4 h-4" />
                      <span>Drop items here to move to backlog</span>
                    </div>
                  )}
                </SortableContext>
              </DroppableList>
            )}
          </div>
        )}

        {createPortal(
          <DragOverlay dropAnimation={null}>
            {activeTodo && (
              <div className="bg-gray-900 border border-blue-500 rounded-xl shadow-lg opacity-90">
                <div className="flex items-center gap-3 p-4">
                  <div className="w-6 h-6 rounded-md border-2 border-gray-600" />
                  <span className="text-white">{activeTodo.title}</span>
                </div>
              </div>
            )}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>

      <ArchivedTodos todos={archivedTodos} onRestore={(id) => void updateTodo(id, { archived: false })} onDelete={(id) => void deleteTodo(id)} />
    </div>
  );
}
