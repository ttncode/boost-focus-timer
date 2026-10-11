"use client";

import { useState, type KeyboardEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, Clock, GripVertical, StickyNote, Target, X } from "../../icons";
import type { Todo } from "./todo-model";

export type TodoVariant = "main" | "backlog" | "suggested";

export interface TodoItemHandlers {
  onToggle(id: string, completed: boolean): void;
  onUpdateTitle(id: string, title: string): void;
  onUpdateTime(id: string, minutes: number | null): void;
  onUpdateNote(id: string, note: string | null): void;
  onArchive(id: string): void;
  onFocus(todo: Todo): void;
  onAccept?(id: string): void;
  onDecline?(id: string): void;
}

const VARIANT_CLASSES: Record<TodoVariant, string> = {
  main: "bg-gray-900 border border-gray-800 hover:border-gray-700",
  backlog: "bg-gray-900/70 border border-gray-800 hover:border-gray-700",
  suggested: "bg-gray-900 border border-gray-800 hover:border-gray-700",
};

const EDIT_INPUT = "bg-gray-800 border border-gray-600 text-white rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none";
const ICON_BUTTON = "shrink-0 p-1 text-gray-500 transition-colors";

const minutesText = (minutes: number | null) => (minutes ? String(minutes) : "");

function titleClass(todo: Todo, variant: TodoVariant): string {
  if (todo.completed) return "text-gray-500 line-through";
  return variant === "backlog" ? "text-gray-300" : "text-white";
}

export function TodoItem({ todo, variant, handlers }: { todo: Todo; variant: TodoVariant; handlers: TodoItemHandlers }) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(todo.title);
  const [editingTime, setEditingTime] = useState(false);
  const [timeValue, setTimeValue] = useState(minutesText(todo.estimated_minutes));
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(todo.note ?? "");

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const saveTitle = () => {
    if (titleValue.trim() && titleValue !== todo.title) handlers.onUpdateTitle(todo.id, titleValue.trim());
    setEditingTitle(false);
  };
  const startTitle = () => {
    setTitleValue(todo.title);
    setEditingTitle(true);
  };
  const onTitleKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") saveTitle();
    if (e.key === "Escape") {
      setTitleValue(todo.title);
      setEditingTitle(false);
    }
  };

  const saveTime = () => {
    const minutes = timeValue ? parseInt(timeValue, 10) : null;
    if (minutes !== todo.estimated_minutes) handlers.onUpdateTime(todo.id, minutes);
    setEditingTime(false);
  };
  const resetTime = (editing: boolean) => {
    setTimeValue(minutesText(todo.estimated_minutes));
    setEditingTime(editing);
  };
  const onTimeKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") saveTime();
    if (e.key === "Escape") resetTime(false);
  };

  const saveNote = () => {
    const note = noteValue.trim() || null;
    if (note !== (todo.note || null)) handlers.onUpdateNote(todo.id, note);
    setEditingNote(false);
  };
  const resetNote = (editing: boolean) => {
    setNoteValue(todo.note ?? "");
    setEditingNote(editing);
  };
  const onNoteKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveNote();
    }
    if (e.key === "Escape") resetNote(false);
  };

  return (
    <div ref={setNodeRef} style={style} className={"flex flex-col rounded-xl transition-all " + VARIANT_CLASSES[variant]}>
      {variant === "suggested" && (
        <div className="flex justify-between items-center px-3 py-1.5 bg-gray-800/50 border-b border-gray-700 rounded-t-xl">
          <span className="text-xs text-gray-400">Suggested</span>
          <div className="flex items-center gap-1.5">
            <button onClick={() => handlers.onAccept?.(todo.id)} className="px-1.5 py-0.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors">Accept</button>
            <button onClick={() => handlers.onDecline?.(todo.id)} className="px-1.5 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors">Decline</button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 p-4">
        <div {...attributes} {...listeners} className="flex shrink-0 text-gray-500 cursor-grab active:cursor-grabbing touch-none">
          <GripVertical className="w-5 h-5" />
        </div>

        <button
          onClick={() => handlers.onToggle(todo.id, todo.completed)}
          className={"shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all " + (todo.completed ? "bg-blue-600 border-blue-600" : "border-gray-600 hover:border-gray-500")}
        >
          {todo.completed && <Check className="w-4 h-4 text-white" />}
        </button>

        <div className="flex-1 flex flex-col gap-1 min-w-0">
          {editingTitle ? (
            <input type="text" value={titleValue} onChange={(e) => setTitleValue(e.target.value)} onKeyDown={onTitleKey} onBlur={saveTitle} autoFocus className={"flex-1 px-2 py-1 " + EDIT_INPUT} />
          ) : (
            <span onClick={startTitle} className={"cursor-text truncate " + titleClass(todo, variant)}>
              {todo.title}
            </span>
          )}

          {editingTime ? (
            <div className="flex items-center gap-2">
              <input type="number" value={timeValue} onChange={(e) => setTimeValue(e.target.value)} onKeyDown={onTimeKey} placeholder="Minutes" min="1" autoFocus className={"w-20 px-2 py-1 text-sm " + EDIT_INPUT} />
              <button onClick={saveTime} className="text-xs text-blue-400 hover:text-blue-300">Save</button>
              <button onClick={() => resetTime(false)} className="text-xs text-gray-500 hover:text-gray-400">Cancel</button>
            </div>
          ) : (
            <button onClick={() => resetTime(true)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-400 transition-colors w-fit">
              <Clock className="w-3 h-3" />
              {todo.estimated_minutes ? `${todo.estimated_minutes} min` : "Add time estimate"}
            </button>
          )}

          {editingNote ? (
            <div className="flex items-start gap-2 mt-1">
              <textarea
                // The inline ref re-runs every render, keeping focus and caret at the end.
                ref={(el) => {
                  if (!el) return;
                  el.focus();
                  el.setSelectionRange(el.value.length, el.value.length);
                }}
                value={noteValue}
                onChange={(e) => setNoteValue(e.target.value)}
                onKeyDown={onNoteKey}
                placeholder="Add a note..."
                rows={2}
                className={"flex-1 px-2 py-1 text-xs resize-none " + EDIT_INPUT}
              />
              <button onClick={saveNote} className="text-xs text-blue-400 hover:text-blue-300">Save</button>
              <button onClick={() => resetNote(false)} className="text-xs text-gray-500 hover:text-gray-400">Cancel</button>
            </div>
          ) : todo.note ? (
            <span onClick={() => resetNote(true)} className={"text-xs cursor-text whitespace-pre-wrap mt-1 " + (todo.completed ? "text-gray-500 line-through" : "text-white")}>
              {todo.note}
            </span>
          ) : null}
        </div>

        <button onClick={() => resetNote(true)} className={ICON_BUTTON + " hover:text-blue-400"} title={todo.note ? "Edit note" : "Add note"}>
          <StickyNote className="w-5 h-5" />
        </button>
        <button onClick={() => handlers.onFocus(todo)} className={ICON_BUTTON + " hover:text-blue-400"} title="Start focus session with this to-do">
          <Target className="w-5 h-5" />
        </button>
        <button onClick={() => handlers.onArchive(todo.id)} className={ICON_BUTTON + " hover:text-red-400"}>
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
