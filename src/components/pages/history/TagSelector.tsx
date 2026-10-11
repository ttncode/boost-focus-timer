"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Check, Plus, Tag as TagIcon, X } from "../../icons";
import { addTagToSession, createTagInDb, fetchTags, removeTagFromSession, TAG_COLORS, type Tag } from "./data";

interface TagSelectorProps {
  userId: string;
  sessionId: string;
  selectedTags: Tag[];
  onTagsChange(tags: Tag[]): void;
  compact?: boolean;
}

export function TagSelector({ userId, sessionId, selectedTags, onTagsChange, compact = false }: TagSelectorProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [selectedColor, setSelectedColor] = useState(TAG_COLORS[0]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchTags(userId, false)
      .then((tags) => setAllTags(tags))
      .catch((e: unknown) => console.error("Failed to load tags:", e));
  }, [userId]);

  useEffect(() => {
    function handleClickOutside(event: globalThis.MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
        setIsCreating(false);
        setNewTagName("");
      }
    }
    if (showDropdown) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown]);

  useEffect(() => {
    if (isCreating && inputRef.current) inputRef.current.focus();
  }, [isCreating]);

  function handleToggleTag(tag: Tag) {
    const isSelected = selectedTags.some((t) => t.id === tag.id);
    if (isSelected) {
      removeTagFromSession(userId, sessionId, tag.id).catch((e: unknown) => console.error(e));
      onTagsChange(selectedTags.filter((t) => t.id !== tag.id));
    } else {
      addTagToSession(userId, sessionId, tag.id).catch((e: unknown) => console.error(e));
      onTagsChange(selectedTags.concat([tag]));
    }
  }

  function handleCreateTag() {
    if (!newTagName.trim()) return;
    createTagInDb(userId, newTagName, selectedColor)
      .then((newTag) => {
        setAllTags((prev) => prev.concat([newTag]));
        handleToggleTag(newTag);
        setNewTagName("");
        setIsCreating(false);
        setSelectedColor(TAG_COLORS[0]);
      })
      .catch((e: unknown) => {
        console.error("Failed to create tag:", e);
        alert("Failed to create tag. It might already exist.");
      });
  }

  function handleRemoveTag(tag: Tag, e: MouseEvent) {
    e.stopPropagation();
    removeTagFromSession(userId, sessionId, tag.id).catch((err: unknown) => console.error(err));
    onTagsChange(selectedTags.filter((t) => t.id !== tag.id));
  }

  function cancelCreate() {
    setIsCreating(false);
    setNewTagName("");
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex flex-wrap items-center gap-2">
        {selectedTags.map((tag) => (
          <div key={tag.id} className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: tag.color }}>
            <span>{tag.name}</span>
            <button onClick={(e) => handleRemoveTag(tag, e)} className="hover:bg-black/20 rounded-full p-0.5 transition-colors">
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className={
            "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors " +
            (compact ? "bg-gray-800 text-gray-300 hover:bg-gray-700" : "bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700")
          }
        >
          <TagIcon className="w-3 h-3" />
          <span>Add Tag</span>
        </button>
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
          <div className="p-2">
            {!isCreating ? (
              <>
                <div className="mb-2 flex gap-1">
                  <button onClick={() => setIsCreating(true)} className="flex-1 flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded transition-colors">
                    <Plus className="w-4 h-4" />
                    <span>Create new tag</span>
                  </button>
                </div>
                {allTags.length > 0 && (
                  <>
                    <div className="border-t border-gray-700 my-2"></div>
                    <div className="space-y-1">
                      {allTags.map((tag) => {
                        const isSelected = selectedTags.some((t) => t.id === tag.id);
                        return (
                          <button key={tag.id} onClick={() => handleToggleTag(tag)} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-gray-700 rounded transition-colors">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }}></div>
                              <span className="text-gray-300">{tag.name}</span>
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-blue-400 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <div>
                  <input
                    ref={inputRef}
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateTag();
                      else if (e.key === "Escape") cancelCreate();
                    }}
                    placeholder="Tag name"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    maxLength={30}
                  />
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-2">Color</div>
                  <div className="grid grid-cols-8 gap-2">
                    {TAG_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setSelectedColor(color)}
                        className={"w-6 h-6 rounded-full transition-transform " + (selectedColor === color ? "ring-2 ring-white scale-110" : "hover:scale-105")}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCreateTag} disabled={!newTagName.trim()} className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    Create
                  </button>
                  <button onClick={cancelCreate} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
