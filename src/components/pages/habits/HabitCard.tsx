"use client";

import { useState, type DragEvent, type ReactNode } from "react";
import { Archive, Check, ChevronDown, ChevronUp, GripVertical, MessageSquare, MoreVertical, Pencil, X } from "../../icons";
import { ColorPicker, FIELD_INPUT, FieldLabel, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./HabitFields";
import { DAYS, colorFor, localDateString, noteKey, type Habit, type HabitNote, type ViewMode } from "./habit-model";

export interface HabitEdit {
  name: string;
  description: string;
  color: string;
}

interface HabitCardProps {
  habit: Habit;
  days: readonly Date[];
  viewMode: ViewMode;
  notes: Readonly<Record<string, HabitNote>>;
  isCompleted(habitId: string, date: string): boolean;
  dragging: boolean;
  menuOpen: boolean;
  editing: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onDragStart(): void;
  onDragOver(e: DragEvent): void;
  onDragEnd(): void;
  onToggleMenu(): void;
  onStartEdit(): void;
  onCancelEdit(): void;
  onSaveEdit(edit: HabitEdit): void;
  onArchive(): void;
  onAccept(): void;
  onDecline(): void;
  onMove(direction: "up" | "down"): void;
  onToggleDay(date: string): void;
  onOpenNote(date: Date): void;
}

const MENU_ITEM = "w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors";
const NO_TAP_HIGHLIGHT = { WebkitTapHighlightColor: "transparent", userSelect: "none" } as const;

function EditForm({ habit, onSave, onCancel }: { habit: Habit; onSave(edit: HabitEdit): void; onCancel(): void }) {
  const [name, setName] = useState(habit.name);
  const [description, setDescription] = useState(habit.description);
  const [color, setColor] = useState(habit.color);
  return (
    <div className="mb-4 space-y-4">
      <div>
        <FieldLabel>Habit Name</FieldLabel>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={FIELD_INPUT} />
      </div>
      <div>
        <FieldLabel>Description (Optional)</FieldLabel>
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className={FIELD_INPUT} />
      </div>
      <ColorPicker value={color} onChange={setColor} />
      <div className="flex gap-3">
        <button onClick={() => name.trim() && onSave({ name: name.trim(), description: description.trim(), color })} disabled={!name.trim()} className={PRIMARY_BUTTON}>
          Save Changes
        </button>
        <button onClick={onCancel} className={SECONDARY_BUTTON}>
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

function MoveArrow({ enabled, onClick, children }: { enabled: boolean; onClick(): void; children: ReactNode }) {
  return (
    <div onClick={() => enabled && onClick()} className={"text-gray-500 " + (enabled ? "active:text-gray-300 cursor-pointer" : "opacity-30") + " transition-colors p-0.5"} style={NO_TAP_HIGHLIGHT}>
      {children}
    </div>
  );
}

function DayCell({ props, date }: { props: HabitCardProps; date: Date }) {
  const { habit, viewMode, notes } = props;
  const week = viewMode === "7days";
  const dateString = localDateString(date);
  const completed = props.isCompleted(habit.id, dateString);
  const isToday = dateString === localDateString(new Date());
  const note = notes[noteKey(habit.id, dateString)];
  const color = colorFor(habit.color);
  return (
    <div className="relative group">
      <button
        onClick={() => props.onToggleDay(dateString)}
        className={
          "w-full flex flex-col items-center gap-1 " +
          (week ? "p-3" : "p-2") +
          " rounded-lg transition-all " +
          (completed ? color.bg + " " + color.hover : "bg-gray-800 hover:bg-gray-700") +
          " " +
          (isToday ? "ring-2 ring-blue-500" : "")
        }
        title={note?.content}
      >
        {week && <span className="text-xs text-gray-400">{DAYS[date.getDay()]}</span>}
        <span className={(week ? "text-sm" : "text-xs") + " font-medium text-white"}>{date.getDate()}</span>
        <div className={(week ? "h-4" : "h-3") + " w-full flex items-center justify-center " + (week ? "px-1" : "px-0.5")}>
          {note ? (
            <p className={(week ? "text-xs" : "text-[10px]") + " text-gray-200 truncate leading-tight w-full text-center"}>{note.content}</p>
          ) : completed ? (
            <Check className={(week ? "w-4 h-4" : "w-3 h-3") + " text-white"} />
          ) : null}
        </div>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          props.onOpenNote(date);
        }}
        className={"absolute top-1 right-1 p-1 rounded bg-gray-900/0 hover:bg-gray-900/80 transition-all opacity-0 group-hover:opacity-100 " + (note ? "text-blue-400" : "text-gray-400")}
        title="Add note"
      >
        <MessageSquare className="w-3 h-3" />
      </button>
    </div>
  );
}

function HabitHeader(props: HabitCardProps) {
  const { habit } = props;
  return (
    <div className="flex items-start justify-between mb-4 group">
      <div className="flex items-start gap-3 flex-1">
        {!habit.is_suggested && (
          <div className="hidden sm:flex shrink-0 text-gray-500 cursor-move mt-1" draggable={false}>
            <GripVertical size={20} />
          </div>
        )}
        <div className="flex-1">
          <h3 className={"text-lg font-semibold " + colorFor(habit.color).text}>{habit.name}</h3>
          {habit.description && <p className="text-gray-400 text-sm mt-1">{habit.description}</p>}
        </div>
      </div>
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            props.onToggleMenu();
          }}
          className="text-gray-500 hover:text-white transition-colors p-2 rounded-lg hover:bg-gray-800"
        >
          <MoreVertical className="w-5 h-5" />
        </button>
        {props.menuOpen && (
          <div className="absolute right-0 top-10 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10 py-1 min-w-[140px]">
            <button onClick={props.onStartEdit} className={MENU_ITEM + " hover:text-white"}>
              <Pencil className="w-4 h-4" /> Edit
            </button>
            <button onClick={props.onArchive} className={MENU_ITEM + " hover:text-red-400"}>
              <Archive className="w-4 h-4" /> Archive
            </button>
          </div>
        )}
      </div>
      {!habit.is_suggested && (
        <div className="flex sm:hidden flex-col gap-0.5">
          <MoveArrow enabled={props.canMoveUp} onClick={() => props.onMove("up")}>
            <ChevronUp className="w-4 h-4" />
          </MoveArrow>
          <MoveArrow enabled={props.canMoveDown} onClick={() => props.onMove("down")}>
            <ChevronDown className="w-4 h-4" />
          </MoveArrow>
        </div>
      )}
    </div>
  );
}

export function HabitCard(props: HabitCardProps) {
  const { habit, days, viewMode } = props;
  const draggable = !habit.is_suggested;
  return (
    <div
      draggable={draggable}
      onDragStart={() => draggable && props.onDragStart()}
      onDragOver={(e) => draggable && props.onDragOver(e)}
      onDragEnd={props.onDragEnd}
      className={"bg-gray-900 rounded-xl border border-gray-800 transition-all " + (props.dragging ? "opacity-50" : "opacity-100")}
    >
      {habit.is_suggested && (
        <div className="flex justify-between items-center px-3 py-1.5 bg-gray-800/50 border-b border-gray-700 rounded-t-xl">
          <span className="text-xs text-gray-400">Suggested</span>
          <div className="flex items-center gap-1.5">
            <button onClick={props.onAccept} className="px-1.5 py-0.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors">
              Accept
            </button>
            <button onClick={props.onDecline} className="px-1.5 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors">
              Decline
            </button>
          </div>
        </div>
      )}
      <div className="p-6">
        {props.editing ? <EditForm habit={habit} onSave={props.onSaveEdit} onCancel={props.onCancelEdit} /> : <HabitHeader {...props} />}
        <div className={"grid gap-2 " + (viewMode === "7days" ? "grid-cols-7" : "grid-cols-10")}>
          {days.map((date) => (
            <DayCell key={localDateString(date)} props={props} date={date} />
          ))}
        </div>
      </div>
    </div>
  );
}
