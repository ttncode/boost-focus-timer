"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, Clock, Pencil, Plus, Tag as TagIcon, Target, X } from "../icons";
import { useHotkey, useHotkeyLabel } from "../hotkeys/HotkeysProvider";
import { databaseService, type Tag } from "../lib/database-service";
import { useDialog } from "../dialogs/DialogProvider";

export const hotkeyHint = (label: string, combo: string | null): string | undefined =>
  combo ? `${label} (${combo})` : undefined;

const TAG_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

function useOutsideDismiss(isOpen: boolean, onDismiss: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  });
  useEffect(() => {
    if (!isOpen) return;
    const handle = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) dismiss.current();
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [isOpen]);
  return ref;
}

function TagChip({ tag, onRemove }: { tag: Tag; onRemove(): void }) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: tag.color }}
    >
      <span>{tag.name}</span>
      <button onClick={onRemove} className="hover:bg-black/20 rounded-full p-0.5 transition-colors">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function NewTagForm({ onCreate, onCancel }: { onCreate(name: string, color: string): void; onCancel(): void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(TAG_COLORS[0]);
  const submit = () => {
    if (name.trim()) onCreate(name, color);
  };
  return (
    <div className="space-y-3">
      <div>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
            if (event.key === "Escape") onCancel();
          }}
          placeholder="Tag name"
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          maxLength={30}
        />
      </div>
      <div>
        <div className="text-xs text-gray-400 mb-2">Color</div>
        <div className="grid grid-cols-8 gap-2">
          {TAG_COLORS.map((swatch) => (
            <button
              key={swatch}
              onClick={() => setColor(swatch)}
              className={`w-6 h-6 rounded-full transition-transform ${color === swatch ? "ring-2 ring-white scale-110" : "hover:scale-105"}`}
              style={{ backgroundColor: swatch }}
            />
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={!name.trim()}
          className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function TagSelector({
  selectedTags,
  onTagsChange,
  onEditTags,
  isActive,
}: {
  selectedTags: readonly Tag[];
  onTagsChange(tags: Tag[]): void;
  onEditTags(): void;
  isActive: boolean;
}) {
  const dialog = useDialog();
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    setIsOpen(false);
    setIsCreating(false);
  };
  const ref = useOutsideDismiss(isOpen, close);
  const addTagCombo = useHotkeyLabel("timer.addTag");
  // The Tags row stays mounted but hidden below the `wide` breakpoint.
  useHotkey("timer.addTag", () => {
    if (ref.current?.getClientRects().length) setIsOpen(true);
  }, isActive);

  // Opening (by click or Alt+Shift+T) puts focus on the first action so the keyboard can carry on.
  useEffect(() => {
    if (isOpen && !isCreating) createButtonRef.current?.focus();
  }, [isOpen, isCreating]);

  useEffect(() => {
    if (isOpen) databaseService.getTags().then(setAllTags).catch((error: unknown) => console.error("Failed to load tags:", error));
  }, [isOpen]);

  const toggle = (tag: Tag) =>
    onTagsChange(
      selectedTags.some((selected) => selected.id === tag.id)
        ? selectedTags.filter((selected) => selected.id !== tag.id)
        : [...selectedTags, tag],
    );

  const create = async (name: string, color: string) => {
    try {
      const tag = await databaseService.createTag(name, color);
      setAllTags((tags) => [...tags, tag]);
      onTagsChange([...selectedTags, tag]);
      setIsCreating(false);
    } catch (error) {
      console.error("Failed to create tag:", error);
      void dialog.alert("Failed to create tag. It might already exist.");
    }
  };

  return (
    <div className="relative" ref={ref}>
      <div className="flex flex-wrap items-center gap-2">
        {selectedTags.map((tag) => (
          <TagChip key={tag.id} tag={tag} onRemove={() => onTagsChange(selectedTags.filter((t) => t.id !== tag.id))} />
        ))}
        <button
          onClick={() => setIsOpen((open) => !open)}
          title={hotkeyHint("Add Tag", addTagCombo)}
          className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700"
        >
          <TagIcon className="w-3 h-3" />
          <span>Add Tag</span>
        </button>
        {selectedTags.length >= 1 ? (
          <button
            onClick={() => onTagsChange([])}
            className="flex items-center justify-center w-6 h-6 rounded-full transition-colors bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300 border border-gray-700"
            title="Clear all tags"
          >
            <X className="w-3 h-3" />
          </button>
        ) : null}
      </div>
      {isOpen ? (
        <div
          className="absolute top-full left-0 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !isCreating) close();
          }}
        >
          <div className="p-2">
            {isCreating ? (
              <NewTagForm onCreate={create} onCancel={() => setIsCreating(false)} />
            ) : (
              <>
                <div className="mb-2 flex gap-1">
                  <button
                    ref={createButtonRef}
                    onClick={() => setIsCreating(true)}
                    className="flex-1 flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create new tag</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      onEditTags();
                    }}
                    className="flex items-center gap-1 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded transition-colors"
                    title="Edit tags"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
                {allTags.length > 0 ? (
                  <>
                    <div className="border-t border-gray-700 my-2" />
                    <div className="space-y-1">
                      {allTags.map((tag) => (
                        <button
                          key={tag.id}
                          onClick={() => toggle(tag)}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-gray-700 rounded transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                            <span className="text-gray-300">{tag.name}</span>
                          </div>
                          {selectedTags.some((selected) => selected.id === tag.id) ? (
                            <Check className="w-4 h-4 text-blue-400 shrink-0" />
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const INPUT_CLASS =
  "w-full px-4 py-3 bg-gray-900 border border-gray-700 text-white rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-1000";

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="block text-sm font-medium text-gray-300 mb-2 whitespace-nowrap">{children}</label>;
}

export interface GoalFormProps {
  goal: string;
  onGoalChange(goal: string): void;
  goalHistory: readonly string[];
  inputMinutes: string;
  onMinutesChange(minutes: string): void;
  onStart(): void;
  selectedTags: readonly Tag[];
  onTagsChange(tags: Tag[]): void;
  onEditTags(): void;
  isActive: boolean;
}

export function GoalForm({
  goal,
  onGoalChange,
  goalHistory,
  inputMinutes,
  onMinutesChange,
  onStart,
  selectedTags,
  onTagsChange,
  onEditTags,
  isActive,
}: GoalFormProps) {
  const goalInput = useRef<HTMLInputElement>(null);
  useHotkey("timer.goal", () => {
    goalInput.current?.focus();
    goalInput.current?.select();
  }, isActive);
  // -1 = typing a fresh goal; otherwise the index into goalHistory being previewed.
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [draftGoal, setDraftGoal] = useState("");

  const browseHistory = (index: number) => {
    setHistoryIndex(index);
    onGoalChange(index === -1 ? draftGoal : goalHistory[index]);
  };

  const onGoalKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") return onStart();
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (historyIndex === -1 && goalHistory.length > 0) setDraftGoal(goal);
      if (historyIndex < goalHistory.length - 1) browseHistory(historyIndex + 1);
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (historyIndex > -1) browseHistory(historyIndex - 1);
    }
  };

  return (
    <div className="mb-8 px-2 sm:px-0">
      <div className="flex gap-4">
        <div className="flex-1">
          <FieldLabel>
            <Target className="w-4 h-4 inline mr-2" />
            <span className="hidden sm:inline">What&apos;s your focus goal?</span>
            <span className="sm:hidden">Focus goal</span>
          </FieldLabel>
          <input
            ref={goalInput}
            type="text"
            value={goal}
            onChange={(event) => {
              onGoalChange(event.target.value);
              setHistoryIndex(-1);
            }}
            onKeyDown={onGoalKeyDown}
            placeholder="Enter a focus goal"
            title="Press ↑ or ↓ to browse previous goals"
            className={`${INPUT_CLASS} placeholder-gray-500`}
          />
        </div>
        <div className="w-20 sm:w-32 relative">
          <FieldLabel>
            <Clock className="w-4 h-4 inline mr-2" />
            Minutes
          </FieldLabel>
          <input
            type="number"
            value={inputMinutes}
            onChange={(event) => onMinutesChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onStart();
            }}
            min="1"
            max="120"
            className={INPUT_CLASS}
          />
        </div>
      </div>
      <div className="mt-4 hidden wide:block">
        <div className="flex items-center mb-2">
          <span className="text-sm font-medium text-gray-300">Tags</span>
        </div>
        <TagSelector selectedTags={selectedTags} onTagsChange={onTagsChange} onEditTags={onEditTags} isActive={isActive} />
      </div>
    </div>
  );
}
