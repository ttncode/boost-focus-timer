"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useHotkeyLabel } from "../hotkeys/HotkeysProvider";
import { Shuffle } from "../icons";
import { ANIMATIONS, metaOf, type AnimationType } from "./animations";
import { hotkeyHint } from "./GoalForm";
import { PixelArt } from "./PixelArt";

const FORWARD_SWEEP_MS = 5000;
const REWIND_SWEEP_MS = 1000;
const CYCLE_MS = FORWARD_SWEEP_MS + REWIND_SWEEP_MS;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const usePrefersReducedMotion = () =>
  useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );

/** Frame (1-based) at `elapsedMs` into a cycle that plays forward over 5s and rewinds over 1s. */
function previewFrame(elapsedMs: number, frames: number): number {
  const time = elapsedMs % CYCLE_MS;
  const progress = time < FORWARD_SWEEP_MS ? time / FORWARD_SWEEP_MS : 1 - (time - FORWARD_SWEEP_MS) / REWIND_SWEEP_MS;
  return 1 + Math.round(progress * (frames - 1));
}

/** Gallery thumbnail: plays forward over 5s, rewinds over 1s, repeats; a still full frame under reduced motion. */
function AnimationPreview({ type, className = "w-16 h-16" }: { type: AnimationType; className?: string }) {
  const { frames, title } = metaOf(type);
  const reducedMotion = usePrefersReducedMotion();
  const [frame, setFrame] = useState(1);

  useEffect(() => {
    if (reducedMotion) return;
    const startedAt = Date.now();
    const timer = setInterval(() => setFrame(previewFrame(Date.now() - startedAt, frames)), REWIND_SWEEP_MS / frames);
    return () => clearInterval(timer);
  }, [frames, reducedMotion]);

  return <PixelArt type={type} frame={reducedMotion ? frames : frame} className={className} label={`${title} animation`} />;
}

export interface AnimationPickerProps {
  isVisible: boolean;
  onToggleVisibility(): void;
  selectedAnimation: AnimationType;
  onAnimationSelect(type: AnimationType): void;
  autoShuffle: boolean;
  onAutoShuffleToggle(): void;
}

export function AnimationPicker({
  isVisible,
  onToggleVisibility,
  selectedAnimation,
  onAnimationSelect,
  autoShuffle,
  onAutoShuffleToggle,
}: AnimationPickerProps) {
  const toggleCombo = useHotkeyLabel("timer.animation");
  const shuffleCombo = useHotkeyLabel("timer.shuffle");
  const nextCombo = useHotkeyLabel("timer.nextAnimation");
  return (
    <div className="mb-8 px-2 sm:px-0 relative">
      <button
        type="button"
        onClick={onToggleVisibility}
        title={hotkeyHint("Choose Animation", toggleCombo)}
        className="flex items-center gap-2 w-full text-left text-sm font-medium text-gray-300 mb-3 hover:text-gray-200 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
          />
        </svg>
        <span>Choose Animation</span>
        <svg
          className={`w-4 h-4 transition-transform ${isVisible ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isVisible ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={onAutoShuffleToggle}
            title={hotkeyHint("Auto-shuffle animations", shuffleCombo)}
            className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all ${
              autoShuffle ? "border-blue-500 bg-blue-900/30" : "border-gray-700 bg-gray-900 hover:border-gray-600"
            }`}
          >
            <div className="flex items-center gap-3">
              <Shuffle className={`w-4 h-4 shrink-0 ${autoShuffle ? "text-blue-400" : "text-gray-400"}`} />
              <div className="text-left">
                <div className={`text-sm font-medium ${autoShuffle ? "text-blue-400" : "text-gray-300"}`}>
                  Auto-shuffle animations
                </div>
                <div className="text-xs text-gray-500">Pick a random animation each session</div>
              </div>
            </div>
            <div className={`relative w-10 h-6 rounded-full shrink-0 transition-colors ${autoShuffle ? "bg-blue-500" : "bg-gray-700"}`}>
              <div
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${autoShuffle ? "left-[18px]" : "left-0.5"}`}
              />
            </div>
          </button>

          <div className="grid grid-cols-3 gap-3" title={hotkeyHint("Next animation", nextCombo)}>
            {ANIMATIONS.map(({ type, title }) => {
              const isSelected = selectedAnimation === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onAnimationSelect(type)}
                  aria-pressed={isSelected}
                  className={`p-4 rounded-xl border-2 transition-all hover:border-blue-500 hover:bg-blue-900/20 ${
                    isSelected ? "border-blue-500 bg-blue-900/30" : "border-gray-700 bg-gray-900"
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <AnimationPreview type={type} />
                    <span className={`text-sm font-medium text-center ${isSelected ? "text-blue-400" : "text-gray-400"}`}>{title}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
