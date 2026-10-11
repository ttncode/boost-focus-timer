"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, ArchiveX, ArrowLeft, Pen, Plus, Save, Trash2, XCircle } from "../icons";
import { useHotkey } from "../hotkeys/HotkeysProvider";
import { localDb } from "../lib/local-db";
import { createTagInDb, fetchTags, type Tag } from "../pages/history/data";
import type { SubPageProps } from "../types";

const TAG_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#6366f1", "#f97316", "#14b8a6", "#a855f7"];

const DELETE_ARCHIVED_CONFIRM = "Are you sure you want to delete this tag? This will remove it from all focus sessions and cannot be undone.";
const DELETE_ACTIVE_CONFIRM = `Are you sure you want to delete this tag?

This will:
• Remove it from all focus sessions
• Delete the tag permanently

Consider archiving instead if you want to keep the historical data. This action cannot be undone.`;

const INPUT_CLASS =
  "w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500";

async function updateTag(id: string, patch: Partial<Tag>): Promise<Tag> {
  const { data, error } = await localDb
    .from<Tag>("tags")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error || !data) throw new Error(`Failed to update tag: ${error?.message}`);
  return data;
}

async function deleteTag(id: string): Promise<void> {
  const { error: connError } = await localDb.from("connections").delete().eq("target_type", "tag").eq("target_id", id);
  if (connError) throw new Error(`Failed to delete tag connections: ${connError.message}`);
  const { error } = await localDb.from("tags").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete tag: ${error.message}`);
}

async function assertNameFree(userId: string, name: string, exceptId: string): Promise<void> {
  const { data } = await localDb.from<Tag>("tags").select("*").eq("user_id", userId).eq("name", name);
  // localStorage has no unique constraints, so (user_id, name) uniqueness is enforced here.
  if (data?.some((t) => t.id !== exceptId)) throw new Error("duplicate key value violates unique constraint");
}

function ColorGrid({ value, onChange }: { value: string; onChange(color: string): void }) {
  return (
    <div>
      <div className="text-xs text-gray-400 mb-2">Color</div>
      <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
        {TAG_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => onChange(color)}
            className={`w-8 h-8 rounded-full transition-transform ${value === color ? "ring-2 ring-white scale-110" : "hover:scale-105"}`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  );
}

export function TagsPage({ userId, onBack }: SubPageProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TAG_COLORS[0]);
  const [showArchived, setShowArchived] = useState(false);
  useHotkey("list.new", () => setIsAdding(true));

  const loadTags = useCallback(async () => {
    try {
      setTags(await fetchTags(userId, true));
    } catch (error) {
      console.error("Error loading tags:", error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    queueMicrotask(() => void loadTags());
  }, [loadTags]);

  function resetNew() {
    setIsAdding(false);
    setNewName("");
    setNewColor(TAG_COLORS[0]);
  }

  async function addTag() {
    if (!newName.trim()) return;
    try {
      const tag = await createTagInDb(userId, newName.trim(), newColor);
      setTags([...tags, tag]);
      resetNew();
    } catch (error) {
      console.error("Error adding tag:", error);
      alert("Failed to create tag. It might already exist.");
    }
  }

  function startEdit(tag: Tag) {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    try {
      await assertNameFree(userId, editName.trim(), id);
      const updated = await updateTag(id, { name: editName.trim(), color: editColor });
      setTags(tags.map((t) => (t.id === id ? updated : t)));
      setEditingId(null);
    } catch (error) {
      console.error("Error updating tag:", error);
      alert("Failed to update tag. The name might already exist.");
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditColor("");
  }

  async function toggleArchive(tag: Tag) {
    try {
      await updateTag(tag.id, { archived: !tag.archived });
      await loadTags();
    } catch (error) {
      console.error("Error archiving/unarchiving tag:", error);
      alert("Failed to archive/unarchive tag.");
    }
  }

  async function removeTag(tag: Tag) {
    if (!confirm(tag.archived ? DELETE_ARCHIVED_CONFIRM : DELETE_ACTIVE_CONFIRM)) return;
    try {
      await deleteTag(tag.id);
      setTags(tags.filter((t) => t.id !== tag.id));
    } catch (error) {
      console.error("Error deleting tag:", error);
      alert("Failed to delete tag.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  const activeTags = tags.filter((t) => !t.archived);
  const archivedTags = tags.filter((t) => t.archived);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-3xl font-bold text-white">Tags</h2>
            <p className="text-gray-400 text-sm mt-1">Organize your focus sessions</p>
          </div>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New Tag</span>
        </button>
      </div>

      {isAdding && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-3 mb-6">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addTag();
              } else if (e.key === "Escape") resetNew();
            }}
            className={INPUT_CLASS}
            placeholder="Tag name"
            maxLength={30}
            autoFocus
          />
          <ColorGrid value={newColor} onChange={setNewColor} />
          <div className="flex gap-2 justify-end">
            <button onClick={resetNew} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
              Cancel
            </button>
            <button
              onClick={() => void addTag()}
              disabled={!newName.trim()}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-4 mb-6">
        {activeTags.length === 0 && !isAdding ? (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg mb-2">No tags yet</p>
            <p className="text-gray-500 text-sm">Create tags to organize your focus sessions</p>
          </div>
        ) : (
          activeTags.map((tag) => (
            <div key={tag.id} className="bg-gray-800 border border-gray-700 rounded-xl p-5">
              {editingId === tag.id ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className={INPUT_CLASS}
                    placeholder="Tag name"
                    maxLength={30}
                    autoFocus
                  />
                  <ColorGrid value={editColor} onChange={setEditColor} />
                  <div className="flex gap-2 justify-end">
                    <button onClick={cancelEdit} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2">
                      <XCircle className="w-4 h-4" />
                      Cancel
                    </button>
                    <button
                      onClick={() => void saveEdit(tag.id)}
                      className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-semibold text-lg">{tag.name}</h3>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => startEdit(tag)} className="text-gray-400 hover:text-blue-400 transition-colors p-2 hover:bg-gray-900 rounded-lg" title="Edit tag">
                      <Pen className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => void toggleArchive(tag)}
                      className="text-gray-400 hover:text-yellow-400 transition-colors p-2 hover:bg-gray-900 rounded-lg"
                      title={tag.archived ? "Unarchive tag" : "Archive tag"}
                    >
                      {tag.archived ? <ArchiveX className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                    </button>
                    <button onClick={() => void removeTag(tag)} className="text-gray-400 hover:text-red-400 transition-colors p-2 hover:bg-gray-900 rounded-lg" title="Delete tag">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}

        {archivedTags.length > 0 && (
          <div className="mt-8">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2 mx-auto mb-4"
            >
              <Archive className="w-4 h-4" />
              {showArchived ? "Hide archived tags" : `Show archived tags (${archivedTags.length})`}
            </button>
            {showArchived && (
              <div className="space-y-4">
                {archivedTags.map((tag) => (
                  <div key={tag.id} className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 opacity-60">
                    <div className="flex items-center gap-4">
                      <div className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-gray-400 font-semibold text-lg line-through">{tag.name}</h3>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => void toggleArchive(tag)} className="text-gray-500 hover:text-blue-400 transition-colors p-2 hover:bg-gray-900 rounded-lg" title="Unarchive tag">
                          <ArchiveX className="w-4 h-4" />
                        </button>
                        <button onClick={() => void removeTag(tag)} className="text-gray-500 hover:text-red-400 transition-colors p-2 hover:bg-gray-900 rounded-lg" title="Delete tag">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
