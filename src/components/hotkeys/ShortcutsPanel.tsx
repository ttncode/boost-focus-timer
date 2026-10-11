"use client";

import { useEffect, useRef, useState } from "react";
import { comboFromEvent, type HotkeyAction } from "./bindings";
import { useHotkeys } from "./HotkeysProvider";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "";

function groupActions(actions: readonly HotkeyAction[]): [string, HotkeyAction[]][] {
  const groups = new Map<string, HotkeyAction[]>();
  actions.forEach((action) => groups.set(action.group, [...(groups.get(action.group) ?? []), action]));
  return [...groups.entries()];
}

function isExtensionPage(): boolean {
  return /^(chrome|moz|safari-web)-extension:$/.test(window.location.protocol);
}

export function ShortcutsPanel({ actions, onClose }: { actions: readonly HotkeyAction[]; onClose(): void }) {
  const { bindings, rebind, resetAll, setCapturing } = useHotkeys();
  const [editingId, setEditingId] = useState<string | null>(null);
  const doneRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    doneRef.current?.focus();
  }, []);

  useEffect(() => {
    setCapturing(editingId !== null);
    return () => setCapturing(false);
  }, [editingId, setCapturing]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (editingId === null) {
        if (event.key === "Escape") onClose();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") return setEditingId(null);
      if (event.key === "Backspace" || event.key === "Delete") {
        rebind(editingId, null);
        return setEditingId(null);
      }
      const combo = comboFromEvent(event);
      if (!combo) return;
      rebind(editingId, combo);
      setEditingId(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [editingId, onClose, rebind]);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 motion-safe:animate-[bft-fade-in_150ms_ease-out]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
        else setEditingId(null);
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="w-full max-w-md max-h-[85vh] flex flex-col bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden motion-safe:animate-[bft-sheet-in_200ms_ease-out]"
      >
        <div className="relative flex items-center justify-center px-5 pt-5 pb-2">
          <h2 id="shortcuts-title" className="text-base font-semibold text-white">
            Keyboard Shortcuts
          </h2>
          <button
            ref={doneRef}
            onClick={onClose}
            className="absolute right-4 rounded-md px-1.5 py-0.5 text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
          >
            Done
          </button>
        </div>
        <div className="overflow-y-auto force-scrollbar px-4 pb-5">
          <p className="px-1 pb-2 text-xs text-gray-500">Click a key, then press the new one. Esc cancels; Backspace removes it.</p>
          {groupActions(actions).map(([group, groupActionsList]) => (
            <section key={group} className="mt-3">
              <h3 className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-500">{group}</h3>
              <ul className="rounded-xl bg-gray-800/60 border border-gray-800 divide-y divide-gray-700/60">
                {groupActionsList.map((action) => {
                  const isEditing = editingId === action.id;
                  const combo = bindings[action.id];
                  return (
                    <li key={action.id} className="px-3.5 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-200">{action.label}</span>
                        <button
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={() => setEditingId(isEditing ? null : action.id)}
                          aria-label={`Change shortcut for ${action.label}`}
                          className={`shrink-0 min-w-[3rem] rounded-md px-2 py-1 font-mono text-xs transition-colors ${
                            isEditing
                              ? "bg-gray-900 text-blue-300 ring-2 ring-blue-500"
                              : combo
                                ? "bg-gray-700 text-gray-100 hover:bg-gray-600"
                                : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                          }`}
                        >
                          {isEditing ? "Press keys…" : (combo ?? "None")}
                        </button>
                      </div>
                      {isEditing ? (
                        <p className="mt-1.5 text-xs text-gray-500">
                          Press the new keys. Esc or a click elsewhere cancels; Backspace removes the key.
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <button
            onClick={resetAll}
            className="mt-5 w-full rounded-xl bg-gray-800/60 border border-gray-800 px-3.5 py-3 text-left text-sm text-red-400 hover:bg-gray-800 transition-colors"
          >
            Reset All to Default
          </button>
          {isExtensionPage() ? (
            <p className="mt-3 px-1 text-xs text-gray-500">
              To open the timer from anywhere, set a shortcut at <code className="font-mono">chrome://extensions/shortcuts</code>.
            </p>
          ) : null}
          {APP_VERSION ? <p className="mt-2 px-1 text-xs text-gray-600">Boost Focus Timer {APP_VERSION}</p> : null}
        </div>
      </div>
    </div>
  );
}
