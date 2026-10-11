export type AnimationType = "coffee-cup" | "battery" | "rocket";

export interface AnimationMeta {
  readonly type: AnimationType;
  readonly title: string;
  readonly frames: number;
}

export const ANIMATIONS: readonly AnimationMeta[] = [
  { type: "coffee-cup", title: "Coffee Cup", frames: 17 },
  { type: "battery", title: "Battery", frames: 6 },
  { type: "rocket", title: "Rocket", frames: 30 },
];

export const DEFAULT_ANIMATION: AnimationType = "coffee-cup";

export const isAnimationType = (value: unknown): value is AnimationType =>
  ANIMATIONS.some((animation) => animation.type === value);

export const metaOf = (type: AnimationType): AnimationMeta =>
  ANIMATIONS.find((animation) => animation.type === type) ?? ANIMATIONS[0];

export interface FrameState {
  readonly isOnBreak: boolean;
  readonly hasStartedBreak: boolean;
  readonly hasStarted: boolean;
  readonly showDirectBreak: boolean;
  readonly isCompleted: boolean;
  readonly totalSeconds: number;
  readonly currentSeconds: number;
}

type Phase = "idle" | "full" | "running";

/** Where the animation sits: `idle` = first frame, `full` = last frame (or reversed on breaks). */
function phaseOf(state: FrameState): Phase {
  if (state.isOnBreak) {
    if (!state.hasStartedBreak) return "idle";
    return state.isCompleted ? "full" : "running";
  }
  if (!state.hasStarted && !state.showDirectBreak) return "idle";
  return state.isCompleted || state.showDirectBreak ? "full" : "running";
}

function elapsedFraction(state: FrameState): number {
  const fraction = (state.totalSeconds - state.currentSeconds) / state.totalSeconds;
  return Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
}

const clampFrame = (frame: number, frames: number) => Math.min(frames, Math.max(1, frame));

/** Fills up while focusing and drains back down on a break. */
function fillingFrame(state: FrameState, frames: number): number {
  const phase = phaseOf(state);
  if (state.isOnBreak) {
    if (phase === "idle") return frames;
    if (phase === "full") return 1;
    return clampFrame(frames - Math.floor(elapsedFraction(state) * (frames - 1)), frames);
  }
  if (phase === "idle") return 1;
  if (phase === "full") return frames;
  return clampFrame(Math.floor(elapsedFraction(state) * (frames - 1)) + 1, frames);
}

export function currentFrame(type: AnimationType, state: FrameState): number {
  const { frames } = metaOf(type);
  // The rocket sits on the pad before and after a break instead of hovering at the top.
  if (type === "rocket" && state.isOnBreak && phaseOf(state) !== "running") return 1;
  return fillingFrame(state, frames);
}
