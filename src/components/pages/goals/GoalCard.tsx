"use client";

import { useState, type DragEvent } from "react";
import { Archive, Check, ChevronDown, ChevronUp, GripVertical, MessageCircle, Pencil, Send, Trash2, X } from "../../icons";
import { formatCommentAge, type Goal, type GoalComment } from "./goal-rows";

const iconButton = "text-gray-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0";
const editField = "px-3 py-1 bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500";
const noTapHighlight = { WebkitTapHighlightColor: "transparent", userSelect: "none" } as const;
const stopDrag = (e: DragEvent) => e.stopPropagation();

export interface EditDraft {
  content: string;
  date: string;
}

export interface GoalCardProps {
  goal: Goal;
  comments: readonly GoalComment[];
  isDragged: boolean;
  isFirst: boolean;
  isLast: boolean;
  commentsOpen: boolean;
  onToggleComments(): void;
  onAddComment(content: string): Promise<boolean>;
  onDeleteComment(id: string): void;
  /** This card's edit draft; the page holds at most one, so opening another card's edit cancels this one. */
  editDraft: EditDraft | null;
  onEditDraft(draft: EditDraft | null): void;
  onSave(content: string, targetDate: string | null): void;
  onArchive(): void;
  onDelete(): void;
  onToggleComplete(): void;
  onMoveUp(): void;
  onMoveDown(): void;
  onDragStart(): void;
  onDragOver(e: DragEvent): void;
  onDragEnd(): void;
}

export function GoalCard(props: GoalCardProps) {
  const { goal, comments, commentsOpen } = props;
  const { content, completed, target_date: targetDate } = goal.data;
  const { editDraft: editing, onEditDraft: setEditing } = props;
  const [draft, setDraft] = useState("");

  const saveEdit = () => {
    if (!editing?.content.trim()) return;
    props.onSave(editing.content.trim(), editing.date || null);
  };

  const submitComment = async () => {
    if (!draft.trim()) return;
    if (await props.onAddComment(draft.trim())) setDraft("");
  };

  const cardTone = completed ? "bg-green-900/20 border-green-700" : "bg-gray-900 border-gray-700 hover:border-gray-600";

  return (
    <div className={`rounded-lg border transition-colors ${cardTone}${props.isDragged ? " opacity-50" : ""}`}>
      <div className="p-4 group">
        <div
          draggable
          onDragStart={props.onDragStart}
          onDragOver={props.onDragOver}
          onDragEnd={props.onDragEnd}
          className="flex items-start gap-3 cursor-move"
        >
          <div className="hidden sm:flex shrink-0 text-gray-500 cursor-move">
            <GripVertical size={20} />
          </div>

          {editing ? (
            <div className="flex-1 flex flex-col gap-2">
              <input
                type="text"
                value={editing.content}
                onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit();
                  if (e.key === "Escape") setEditing(null);
                }}
                className={`w-full ${editField}`}
                autoFocus
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={editing.date}
                  onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                  className={`flex-1 ${editField}`}
                />
                <button onClick={saveEdit} className="shrink-0 text-green-500 hover:text-green-400 transition-colors">
                  <Check size={20} />
                </button>
                <button onClick={() => setEditing(null)} className="shrink-0 text-gray-500 hover:text-gray-400 transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1">
                <div className={completed ? "text-gray-400 line-through" : "text-white"}>{content}</div>
                {targetDate && <div className="text-sm text-gray-500 mt-1">{`Target: ${targetDate}`}</div>}
              </div>
              <button
                onClick={() => setEditing({ content, date: targetDate ?? "" })}
                className={`${iconButton} hover:text-blue-500`}
                title="Edit goal"
              >
                <Pencil size={18} />
              </button>
              <button onClick={props.onArchive} className={`${iconButton} hover:text-yellow-500`} title="Archive goal">
                <Archive size={20} />
              </button>
              <button onClick={props.onDelete} className={`${iconButton} hover:text-red-500`} title="Delete goal">
                <Trash2 size={20} />
              </button>
              <button
                onClick={props.onToggleComplete}
                className={`px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors shrink-0 ${
                  completed ? "bg-green-600 text-white cursor-pointer" : "bg-gray-700 hover:bg-gray-600 text-gray-300"
                }`}
                title={completed ? "Completed" : "Mark as complete"}
                onDragStart={stopDrag}
              >
                <Check className="w-4 h-4 sm:hidden" />
                <span className="hidden sm:inline">{completed ? "Completed" : "Complete"}</span>
              </button>
              <div className="flex sm:hidden flex-col gap-0.5 shrink-0">
                <div
                  onClick={props.isFirst ? undefined : props.onMoveUp}
                  className={`text-gray-500 ${props.isFirst ? "opacity-30" : "active:text-gray-300 cursor-pointer"} transition-colors p-0.5`}
                  style={noTapHighlight}
                >
                  <ChevronUp className="w-4 h-4" />
                </div>
                <div
                  onClick={props.isLast ? undefined : props.onMoveDown}
                  className={`text-gray-500 ${props.isLast ? "opacity-30" : "active:text-gray-300 cursor-pointer"} transition-colors p-0.5`}
                  style={noTapHighlight}
                >
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>
            </>
          )}
        </div>

        {!editing && (
          <div className="mt-2 ml-8">
            <button
              onClick={props.onToggleComments}
              className="text-xs text-gray-500 hover:text-blue-400 transition-colors flex items-center gap-1"
            >
              <MessageCircle size={14} />
              {commentsOpen ? "Hide comments" : `${comments.length} comments`}
            </button>
          </div>
        )}

        {commentsOpen && (
          <div className="mt-3 ml-8 border-l-2 border-gray-700 pl-4 space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submitComment();
                  }
                }}
                placeholder="Add a comment..."
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => void submitComment()}
                disabled={!draft.trim()}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={16} />
              </button>
            </div>
            {comments.length > 0 ? (
              <div className="space-y-2">
                {comments.map((comment) => (
                  <div key={comment.id} className="bg-gray-800/50 rounded-lg p-3 group">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-gray-300 flex-1 whitespace-pre-wrap break-words">{comment.content}</p>
                      <button
                        onClick={() => props.onDeleteComment(comment.id)}
                        className="text-gray-500 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{formatCommentAge(comment.createdAt)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500 italic">No comments yet. Add one above!</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
