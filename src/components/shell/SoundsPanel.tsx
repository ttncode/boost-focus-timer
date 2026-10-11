"use client";

import { useEffect, useRef, useState } from "react";
import {
  getSoundThemeId,
  OWN_SOUND_ATTRIBUTE,
  previewSound,
  setSoundThemeId,
  SOUND_THEMES,
  type SoundEvent,
  type SoundThemeId,
} from "../focus/sounds";
import { Check, Play } from "../icons";

const MOMENTS: readonly { event: SoundEvent; label: string }[] = [
  { event: "focusStart", label: "Start" },
  { event: "focusEnd", label: "Finish" },
  { event: "breakStart", label: "Break" },
  { event: "breakEnd", label: "Back to work" },
  { event: "pause", label: "Pause" },
  { event: "resume", label: "Resume" },
  { event: "tap", label: "Tap" },
];

const ownSound = { [OWN_SOUND_ATTRIBUTE]: "" };

export function SoundsPanel({ onClose }: { onClose(): void }) {
  const [selected, setSelected] = useState<SoundThemeId>(getSoundThemeId);
  const doneRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    doneRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const choose = (id: SoundThemeId) => {
    setSoundThemeId(id);
    setSelected(id);
    previewSound(id, "focusStart");
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 motion-safe:animate-[bft-fade-in_150ms_ease-out]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sounds-title"
        className="w-full max-w-lg max-h-[85vh] flex flex-col bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden motion-safe:animate-[bft-sheet-in_200ms_ease-out]"
      >
        <div className="relative flex items-center justify-center px-5 pt-5 pb-2">
          <h2 id="sounds-title" className="text-base font-semibold text-white">
            Sounds
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
          <p className="px-1 pb-3 text-xs text-gray-500">Pick a sound theme. Tap a moment to hear it.</p>
          <div role="radiogroup" aria-label="Sound theme" className="space-y-2.5">
            {SOUND_THEMES.map((theme) => {
              const isSelected = theme.id === selected;
              return (
                <div
                  key={theme.id}
                  className={`rounded-xl border px-3.5 py-3 transition-colors ${
                    isSelected ? "border-blue-500 bg-blue-950/40" : "border-gray-800 bg-gray-800/60 hover:border-gray-700"
                  }`}
                >
                  <button
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => choose(theme.id)}
                    className="w-full flex items-start gap-3 text-left"
                    {...ownSound}
                  >
                    <span
                      className={`mt-0.5 w-5 h-5 shrink-0 rounded-full border flex items-center justify-center ${
                        isSelected ? "bg-blue-600 border-blue-600" : "border-gray-600"
                      }`}
                    >
                      {isSelected ? <Check className="w-3.5 h-3.5 text-white" /> : null}
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-white">
                        {theme.name}
                        {theme.id === "classic" ? <span className="ml-2 text-xs font-normal text-gray-500">Default</span> : null}
                      </span>
                      <span className="block text-xs text-gray-400 mt-0.5">{theme.description}</span>
                    </span>
                  </button>
                  {theme.id === "silent" ? null : (
                    <div className="mt-2.5 pl-8 flex flex-wrap gap-1.5">
                      {MOMENTS.map(({ event, label }) => {
                        const isQuiet = theme.sounds[event] === null;
                        return (
                          <button
                            key={event}
                            onClick={() => previewSound(theme.id, event)}
                            disabled={isQuiet}
                            title={isQuiet ? `${label}: silent in this theme` : `Play “${label}”`}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs bg-gray-700/70 text-gray-200 hover:bg-gray-600 transition-colors disabled:bg-transparent disabled:text-gray-600 disabled:line-through disabled:cursor-default"
                            {...ownSound}
                          >
                            {isQuiet ? null : <Play className="w-3 h-3" fill="currentColor" />}
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
