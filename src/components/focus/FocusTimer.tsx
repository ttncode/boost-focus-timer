"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Clock, Pause, Play, RotateCcw, Target, X } from "../icons";
import { databaseService, type FocusSession, type Tag } from "../lib/database-service";
import { clearRunningTimer, readRunningTimer, trackRunningTimer, type RunningTimer } from "../lib/extension";
import { useHotkey, useHotkeyLabel } from "../hotkeys/HotkeysProvider";
import type { FocusTimerHandle, FocusTimerProps } from "../types";
import { AnimationPicker } from "./AnimationPicker";
import { ANIMATIONS, DEFAULT_ANIMATION, currentFrame, isAnimationType, metaOf, type AnimationType, type FrameState } from "./animations";
import { GoalForm, hotkeyHint } from "./GoalForm";
import { PixelArt } from "./PixelArt";
import { notify } from "./notifications";
import { OWN_SOUND_ATTRIBUTE, playSound } from "./sounds";
import { useDialog } from "../dialogs/DialogProvider";

const DEFAULT_TITLE = "Boost Focus Timer";
const HEARTBEAT_MS = 5000;
const RESTORE_WINDOW_MS = 4 * 60 * 60 * 1000;
const STALE_HEARTBEAT_MS = 30000;
const MINUTE_MS = 60000;

interface Countdown {
  readonly minutes: number;
  readonly seconds: number;
  readonly isRunning: boolean;
  readonly isCompleted: boolean;
}

const IDLE: Countdown = { minutes: 0, seconds: 0, isRunning: false, isCompleted: false };

const pad = (value: number) => value.toString().padStart(2, "0");
const formatClock = ({ minutes, seconds }: Countdown) => `${pad(minutes)}:${pad(seconds)}`;
const remainingMsOf = ({ minutes, seconds }: Countdown) => (minutes * 60 + seconds) * 1000;
const splitMs = (ms: number) => ({ minutes: Math.floor(ms / MINUTE_MS), seconds: Math.floor((ms % MINUTE_MS) / 1000) });
const nowIso = () => new Date().toISOString();
const storedFocusMinutes = () => localStorage.getItem("lastFocusDuration") || "25";
const storedBreakMinutes = () => localStorage.getItem("lastBreakDuration") || "5";
const logError = (what: string) => (error: unknown) => console.error(what, error);
const SELECTED_ANIMATION_KEY = "selectedAnimation";

function storedAnimation(): AnimationType {
  const stored = localStorage.getItem(SELECTED_ANIMATION_KEY);
  return isAnimationType(stored) ? stored : DEFAULT_ANIMATION;
}

function randomAnimationOtherThan(current: AnimationType): AnimationType {
  const choices = ANIMATIONS.map((animation) => animation.type).filter((type) => type !== current);
  return choices[Math.floor(Math.random() * choices.length)];
}

/** Ticks once a second against a wall-clock anchor so background throttling cannot drift the timer. */
function useCountdown(options: {
  isRunning: boolean;
  startTime: number | null;
  totalMs: number;
  titleSuffix: string;
  onTick(minutes: number, seconds: number): void;
  onComplete(): void;
}) {
  const { isRunning, startTime, totalMs, titleSuffix } = options;
  const handlers = useRef(options);
  useEffect(() => {
    handlers.current = options;
  });

  useEffect(() => {
    if (!isRunning || startTime === null) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, totalMs - (Date.now() - startTime));
      if (remaining <= 0) {
        clearInterval(timer);
        document.title = DEFAULT_TITLE;
        handlers.current.onComplete();
        return;
      }
      const { minutes, seconds } = splitMs(remaining);
      document.title = `${pad(minutes)}:${pad(seconds)} - ${titleSuffix}`;
      handlers.current.onTick(minutes, seconds);
    }, 1000);
    return () => clearInterval(timer);
  }, [isRunning, startTime, totalMs, titleSuffix]);
}

/** Rebuilds a paused countdown from an unfinished session row, counting a silent gap as a pause. */
async function restoreSession(session: FocusSession) {
  if (!session.start_time) {
    return { countdown: { ...IDLE, minutes: session.planned_duration_minutes }, totalMs: 0, pauseId: null };
  }
  const startedAt = new Date(session.start_time).getTime();
  const totalMs = session.planned_duration_minutes * MINUTE_MS;
  const pauses = await databaseService.getSessionPauses(session.id);
  const pausedMs = pauses
    .filter((pause) => pause.pause_end_time)
    .reduce((sum, pause) => sum + new Date(pause.pause_end_time ?? 0).getTime() - new Date(pause.pause_start_time).getTime(), 0);
  let pauseId = pauses.find((pause) => !pause.pause_end_time)?.id ?? null;
  let endedAt = Date.now();
  const heartbeat = session.last_heartbeat ? new Date(session.last_heartbeat).getTime() : null;
  if (heartbeat !== null && Date.now() - heartbeat >= STALE_HEARTBEAT_MS) {
    endedAt = heartbeat;
    pauseId ??= (await databaseService.createPause(session.id, session.last_heartbeat ?? nowIso())).id;
  }
  const remaining = Math.max(0, totalMs - (endedAt - startedAt - pausedMs));
  const countdown = remaining > 0 ? { ...IDLE, ...splitMs(remaining) } : { ...IDLE, isCompleted: true };
  return { countdown, totalMs, pauseId };
}

const BUTTON_BASE = "flex items-center gap-2 text-white rounded-xl font-medium transition-all transform hover:scale-105 active:scale-95";
const BUTTON_LARGE = `${BUTTON_BASE} px-6 py-3`;
const BUTTON_SMALL = `${BUTTON_BASE} px-3 sm:px-4 py-3 text-sm sm:text-base`;
const ICON_SMALL = "w-4 h-4 sm:w-5 sm:h-5";

function TimerButton({
  onClick,
  className,
  title,
  children,
}: {
  onClick(): void;
  className: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button onClick={onClick} className={className} title={title} {...{ [OWN_SOUND_ATTRIBUTE]: "" }}>
      {children}
    </button>
  );
}

export const FocusTimer = forwardRef<FocusTimerHandle, FocusTimerProps>(function FocusTimer(props, ref) {
  const dialog = useDialog();
  const { isActive, onNavigateToTab, onTodayMinutesChange } = props;

  const [focus, setFocus] = useState<Countdown>(IDLE);
  const [focusStart, setFocusStart] = useState<number | null>(null);
  const [focusTotalMs, setFocusTotalMs] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [breakTimer, setBreakTimer] = useState<Countdown>(IDLE);
  const [breakStart, setBreakStart] = useState<number | null>(null);
  const [breakTotalMs, setBreakTotalMs] = useState(0);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [hasStartedBreak, setHasStartedBreak] = useState(false);
  const [showDirectBreak, setShowDirectBreak] = useState(false);
  const [goal, setGoal] = useState("");
  const [inputMinutes, setInputMinutes] = useState(() => localStorage.getItem("pendingMinutes") || storedFocusMinutes());
  const [breakMinutes, setBreakMinutes] = useState(storedBreakMinutes);
  const [extendMinutes, setExtendMinutes] = useState("10");

  const [session, setSession] = useState<FocusSession | null>(null);
  const [breakSession, setBreakSession] = useState<FocusSession | null>(null);
  const [pauseId, setPauseId] = useState<string | null>(null);
  const [breakPauseId, setBreakPauseId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [goalHistory, setGoalHistory] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);

  const [autoShuffle, setAutoShuffle] = useState(() => localStorage.getItem("autoShuffleAnimations") === "true");
  const [selectedAnimation, setSelectedAnimation] = useState<AnimationType>(() =>
    autoShuffle ? randomAnimationOtherThan(storedAnimation()) : storedAnimation(),
  );
  const [showPicker, setShowPicker] = useState(false);

  const reportTodayMinutes = useCallback(async () => {
    onTodayMinutesChange(await databaseService.getTodayFocusMinutes());
  }, [onTodayMinutesChange]);

  useEffect(() => {
    reportTodayMinutes().catch(logError("Error loading today minutes:"));
  }, [reportTodayMinutes]);

  useEffect(() => {
    databaseService
      .getUserFocusSessions(50)
      .then((sessions) =>
        setGoalHistory([...new Set(sessions.filter((s) => s.session_type === "focus" && s.goal?.trim()).map((s) => s.goal))]),
      )
      .catch(logError("Error loading goal history:"));
  }, []);

  useEffect(() => {
    databaseService
      .getUserSettings()
      .then((settings) => {
        if (settings?.auto_shuffle_animations !== undefined) setAutoShuffle(settings.auto_shuffle_animations);
      })
      .catch(logError("Failed to load user settings:"));
  }, []);

  const selectAnimation = (type: AnimationType) => {
    setSelectedAnimation(type);
    localStorage.setItem(SELECTED_ANIMATION_KEY, type);
  };

  const selectNextAnimation = () => {
    const index = ANIMATIONS.findIndex((animation) => animation.type === selectedAnimation);
    selectAnimation(ANIMATIONS[(index + 1) % ANIMATIONS.length].type);
  };

  const rerollAnimation = () => {
    if (autoShuffle) setSelectedAnimation(randomAnimationOtherThan(selectedAnimation));
  };

  const toggleAutoShuffle = () => {
    const next = !autoShuffle;
    setAutoShuffle(next);
    localStorage.setItem("autoShuffleAnimations", String(next));
    databaseService.updateUserSettings({ auto_shuffle_animations: next }).catch(logError("Failed to save user settings:"));
  };

  /**
   * Extension only: the popup window can be closed mid-session, so a countdown that was running when it
   * closed keeps running (or has finished) instead of coming back paused.
   */
  const continueRunningTimer = async (running: RunningTimer, latest: FocusSession): Promise<boolean> => {
    if (latest.id !== running.sessionId || latest.completed) return false;
    const remaining = running.endAt - Date.now();
    const startedAt = running.endAt - running.totalMs;
    if (running.kind === "focus") {
      setGoal(latest.goal);
      setInputMinutes(String(latest.planned_duration_minutes));
      setHasStarted(true);
      setFocusTotalMs(running.totalMs);
      if (remaining > 0) {
        setSession(latest);
        setFocusStart(startedAt);
        setFocus({ ...IDLE, ...splitMs(remaining), isRunning: true });
      } else {
        setSession(await databaseService.updateFocusSession(latest.id, { end_time: new Date(running.endAt).toISOString(), completed: true }));
        setFocus({ ...IDLE, isCompleted: true });
      }
      return true;
    }
    if (remaining > 0) {
      setBreakSession(latest);
      setIsOnBreak(true);
      setHasStartedBreak(true);
      setBreakTotalMs(running.totalMs);
      setBreakStart(startedAt);
      setBreakTimer({ ...IDLE, ...splitMs(remaining), isRunning: true });
    } else {
      await databaseService.updateFocusSession(latest.id, { end_time: new Date(running.endAt).toISOString(), completed: true });
      setBreakTimer({ ...IDLE, isCompleted: true });
    }
    return true;
  };

  useEffect(() => {
    const restore = async () => {
      const [latest] = await databaseService.getUserFocusSessions(1);
      const running = readRunningTimer();
      if (running && latest && (await continueRunningTimer(running, latest))) return;
      if (!latest || latest.completed || Date.now() - new Date(latest.created_at).getTime() >= RESTORE_WINDOW_MS) return;
      const restored = await restoreSession(latest);
      setSession(latest);
      setGoal(latest.goal);
      setInputMinutes(String(latest.planned_duration_minutes));
      setHasStarted(true);
      setFocus(restored.countdown);
      setFocusTotalMs(restored.totalMs);
      if (restored.pauseId) setPauseId(restored.pauseId);
    };
    restore()
      .catch(logError("Failed to load active session:"))
      .finally(() => setIsInitialized(true));
  }, []);

  // Keep the extension's running-timer record (and its background alarm) in step with the countdowns.
  useEffect(() => {
    if (!isInitialized) return;
    if (focus.isRunning && focusStart !== null && session) {
      trackRunningTimer({ kind: "focus", sessionId: session.id, endAt: focusStart + focusTotalMs, totalMs: focusTotalMs, goal });
    } else if (breakTimer.isRunning && breakStart !== null && breakSession) {
      trackRunningTimer({ kind: "break", sessionId: breakSession.id, endAt: breakStart + breakTotalMs, totalMs: breakTotalMs, goal: "" });
    } else {
      clearRunningTimer();
    }
  }, [isInitialized, focus.isRunning, focusStart, focusTotalMs, session, goal, breakTimer.isRunning, breakStart, breakTotalMs, breakSession]);

  const resetAll = () => {
    setFocus(IDLE);
    setBreakTimer(IDLE);
    setIsOnBreak(false);
    setHasStartedBreak(false);
    setHasStarted(false);
    setShowDirectBreak(false);
    setFocusStart(null);
    setBreakStart(null);
    setFocusTotalMs(0);
    setBreakTotalMs(0);
    setInputMinutes(storedFocusMinutes());
    setBreakMinutes(storedBreakMinutes());
    setExtendMinutes("10");
    setSession(null);
    setBreakSession(null);
    setPauseId(null);
    setBreakPauseId(null);
  };

  const resetTimer = () => {
    document.title = DEFAULT_TITLE;
    resetAll();
    rerollAnimation();
  };

  // An unfinished session has no end time, so its minutes never reach today's total.
  const confirmReset = async () => {
    if (session && !session.completed) {
      const confirmed = await dialog.confirm("Time focused so far won't count toward today.", {
        title: "Reset this session?",
        confirmLabel: "Reset",
        destructive: true,
      });
      if (!confirmed) return;
    }
    resetTimer();
  };

  const completeSession = async () => {
    if (!session || session.completed) return;
    try {
      const done = await databaseService.updateFocusSession(session.id, { end_time: nowIso(), completed: true });
      setSession(done);
      await reportTodayMinutes();
    } catch (error) {
      console.error("Failed to complete session:", error);
    }
  };

  const completeBreakSession = async () => {
    if (!breakSession) return;
    await databaseService
      .updateFocusSession(breakSession.id, { end_time: nowIso(), completed: true })
      .catch(logError("Failed to complete break session:"));
  };

  const endPause = async (id: string | null, clear: (value: null) => void) => {
    if (!id) return;
    await databaseService.updatePauseEndTime(id, nowIso()).catch(logError("Failed to update pause end time:"));
    clear(null);
  };

  const sendHeartbeat = useCallback((target: FocusSession | null) => {
    if (target) databaseService.updateFocusSession(target.id, { last_heartbeat: nowIso() }).catch(logError("Heartbeat failed:"));
  }, []);

  useEffect(() => {
    if (!focus.isRunning || !session) return;
    const timer = setInterval(() => sendHeartbeat(session), HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [focus.isRunning, session, sendHeartbeat]);

  useEffect(() => {
    if (!breakTimer.isRunning || !breakSession) return;
    const timer = setInterval(() => sendHeartbeat(breakSession), HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [breakTimer.isRunning, breakSession, sendHeartbeat]);

  useCountdown({
    isRunning: focus.isRunning,
    startTime: focusStart,
    totalMs: focusTotalMs,
    titleSuffix: goal || "Focus",
    onTick: (minutes, seconds) => setFocus((current) => ({ ...current, minutes, seconds })),
    onComplete: () => {
      playSound("focusEnd");
      notify("Focus session complete", `${goal.trim() || "Nice work"} · time for a break.`);
      setFocusStart(null);
      setFocus({ ...IDLE, isCompleted: true });
      void completeSession();
    },
  });

  const finishBreak = () => {
    setFocus(IDLE);
    setBreakTimer({ ...IDLE, isCompleted: true });
    setIsOnBreak(false);
    setHasStartedBreak(false);
    setHasStarted(false);
    setShowDirectBreak(false);
    setBreakSession(null);
    setBreakStart(null);
    setBreakTotalMs(0);
    setBreakPauseId(null);
    setInputMinutes(storedFocusMinutes());
    setBreakMinutes(storedBreakMinutes());
  };

  useCountdown({
    isRunning: breakTimer.isRunning,
    startTime: breakStart,
    totalMs: breakTotalMs,
    titleSuffix: "Break",
    onTick: (minutes, seconds) => setBreakTimer((current) => ({ ...current, minutes, seconds })),
    onComplete: () => {
      playSound("breakEnd");
      notify("Break is over", "Ready for the next focus session?");
      void completeBreakSession();
      finishBreak();
    },
  });

  const startFocus = async () => {
    if (!goal.trim() && !session) return void dialog.alert("Please enter a focus goal");
    const minutes = parseInt(inputMinutes);
    if (!minutes || minutes <= 0) return void dialog.alert("Please enter a valid time in minutes");
    localStorage.setItem("lastFocusDuration", String(minutes));
    try {
      const created = await databaseService.createFocusSession({ goal, planned_duration_minutes: minutes, session_type: "focus" });
      setSession(created);
      playSound("focusStart");
      if (goal.trim()) setGoalHistory((history) => [goal, ...history]);
      setFocusStart(Date.now());
      setFocusTotalMs(minutes * MINUTE_MS);
      setFocus({ minutes, seconds: 0, isRunning: true, isCompleted: false });
      setHasStarted(true);
      await Promise.all(selectedTags.map((tag) => databaseService.addTagToSession(created.id, tag.id))).catch(
        logError("Failed to link tags to session:"),
      );
      sendHeartbeat(created);
    } catch (error) {
      console.error("Failed to start session:", error);
      void dialog.alert("Failed to start focus session. Please try again.");
    }
  };

  const pauseFocus = async () => {
    playSound("pause");
    if (focusStart === null) return setFocus((current) => ({ ...current, isRunning: false }));
    const remaining = Math.max(0, focusTotalMs - (Date.now() - focusStart));
    setFocus((current) => ({ ...current, ...splitMs(remaining), isRunning: false }));
    setFocusStart(null);
    if (session) {
      const pause = await databaseService.createPause(session.id).catch(logError("Failed to create pause record:"));
      if (pause) setPauseId(pause.id);
    }
  };

  const resumeFocus = async () => {
    playSound("resume");
    await endPause(pauseId, setPauseId);
    sendHeartbeat(session);
    setFocusStart(Date.now() - (focusTotalMs - remainingMsOf(focus)));
    setFocus((current) => ({ ...current, isRunning: true }));
  };

  const completeEarly = async () => {
    playSound("focusEnd");
    document.title = DEFAULT_TITLE;
    setFocusStart(null);
    await endPause(pauseId, setPauseId);
    await completeSession();
    setFocus({ ...IDLE, isCompleted: true });
  };

  const extendFocus = async () => {
    const minutes = parseInt(extendMinutes);
    if (isNaN(minutes) || minutes <= 0) return void dialog.alert("Please enter a valid number of minutes");
    try {
      if (session) setSession(await databaseService.updateFocusSession(session.id, { completed: false, end_time: null }));
      setFocus({ minutes, seconds: 0, isRunning: true, isCompleted: false });
      setFocusStart(Date.now());
      setFocusTotalMs(minutes * MINUTE_MS);
    } catch (error) {
      console.error("Failed to extend session:", error);
      void dialog.alert("Failed to extend session. Please try again.");
    }
  };

  const startBreak = async () => {
    const minutes = parseInt(breakMinutes);
    if (!minutes || minutes <= 0) return void dialog.alert("Please enter a valid break time in minutes");
    localStorage.setItem("lastBreakDuration", String(minutes));
    setSession(null);
    setBreakTimer(IDLE);
    const created = await databaseService
      .createFocusSession({ goal: "Break time", planned_duration_minutes: minutes, session_type: "break" })
      .catch(logError("Failed to start break session:"));
    if (created) setBreakSession(created);
    playSound("breakStart");
    setBreakStart(Date.now());
    setBreakTotalMs(minutes * MINUTE_MS);
    setBreakTimer({ minutes, seconds: 0, isRunning: true, isCompleted: false });
    setIsOnBreak(true);
    setHasStartedBreak(true);
  };

  const pauseBreak = async () => {
    playSound("pause");
    if (breakStart === null) return setBreakTimer((current) => ({ ...current, isRunning: false }));
    const remaining = Math.max(0, breakTotalMs - (Date.now() - breakStart));
    setBreakTimer((current) => ({ ...current, ...splitMs(remaining), isRunning: false }));
    setBreakStart(null);
    if (breakSession) {
      const pause = await databaseService.createPause(breakSession.id).catch(logError("Failed to create break pause record:"));
      if (pause) setBreakPauseId(pause.id);
    }
  };

  const resumeBreak = async () => {
    playSound("resume");
    await endPause(breakPauseId, setBreakPauseId);
    setBreakStart(Date.now() - (breakTotalMs - remainingMsOf(breakTimer)));
    setBreakTimer((current) => ({ ...current, isRunning: true }));
  };

  const endBreak = async () => {
    playSound("breakEnd");
    document.title = DEFAULT_TITLE;
    await completeBreakSession();
    finishBreak();
  };

  useImperativeHandle(ref, () => ({
    isTimerRunning: () => focus.isRunning,
    isBreakRunning: () => breakTimer.isRunning,
    setGoalAndMinutes: (nextGoal, minutes) => {
      setFocus(IDLE);
      setHasStarted(false);
      setIsOnBreak(false);
      setHasStartedBreak(false);
      setBreakTimer(IDLE);
      setGoal(nextGoal);
      if (minutes) setInputMinutes(String(minutes));
    },
    resetTimer,
  }));

  const active = isOnBreak ? breakTimer : focus;
  const isIdle = !hasStarted && !isOnBreak && !showDirectBreak;
  const isDirectBreak = showDirectBreak && !isOnBreak;

  const toggleTimer = () => {
    if (isIdle) return void startFocus();
    if (isDirectBreak || (focus.isCompleted && !isOnBreak)) return void startBreak();
    if (isOnBreak) return void (breakTimer.isRunning ? pauseBreak() : resumeBreak());
    void (focus.isRunning ? pauseFocus() : resumeFocus());
  };

  const endCurrent = () => {
    if (isOnBreak) return void endBreak();
    if (hasStarted && !focus.isCompleted) void completeEarly();
  };

  const switchMode = () => {
    if (isIdle) setShowDirectBreak(true);
    else if (isDirectBreak) setShowDirectBreak(false);
  };

  useHotkey("timer.toggle", toggleTimer, isActive);
  useHotkey("timer.end", endCurrent, isActive);
  useHotkey("timer.switch", switchMode, isActive);
  useHotkey("timer.animation", () => setShowPicker((visible) => !visible), isActive && isIdle);
  useHotkey("timer.shuffle", toggleAutoShuffle, isActive && isIdle);
  useHotkey("timer.nextAnimation", selectNextAnimation, isActive && isIdle);
  const isSessionComplete = !isIdle && !isOnBreak && focus.isCompleted;
  useHotkey("timer.reset", () => void confirmReset(), isActive && !isIdle && !isDirectBreak && !isOnBreak);
  useHotkey("timer.extend", () => void extendFocus(), isActive && isSessionComplete);
  const toggleCombo = useHotkeyLabel("timer.toggle");
  const endCombo = useHotkeyLabel("timer.end");
  const switchCombo = useHotkeyLabel("timer.switch");
  const resetCombo = useHotkeyLabel("timer.reset");
  const extendCombo = useHotkeyLabel("timer.extend");
  const inputForPhase = isOnBreak ? breakMinutes : inputMinutes;
  const frameState: FrameState = {
    isOnBreak,
    hasStartedBreak,
    hasStarted,
    showDirectBreak,
    isCompleted: active.isCompleted,
    totalSeconds: parseInt(inputForPhase) * 60,
    currentSeconds: active.minutes * 60 + active.seconds,
  };

  const progressPercent = () => {
    if (isOnBreak ? !hasStartedBreak : !hasStarted) return 0;
    const totalMs = (isOnBreak ? breakTotalMs : focusTotalMs) || parseInt(inputForPhase) * MINUTE_MS;
    return Math.min(100, ((totalMs - remainingMsOf(active)) / totalMs) * 100);
  };

  const clockColor = active.isCompleted ? "text-green-600" : isOnBreak ? "text-orange-400" : "text-white";

  return (
    <>
      {!isInitialized ? (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
          <div className="text-white text-lg">Loading session...</div>
        </div>
      ) : null}

      {breakTimer.isCompleted && !hasStarted ? (
        <div className="mb-6 p-4 bg-green-900 border border-green-700 rounded-xl relative">
          <button
            onClick={() => setBreakTimer((current) => ({ ...current, isCompleted: false }))}
            className="absolute top-2 right-2 text-green-400 hover:text-green-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <p className="text-sm font-medium text-green-400 mb-1">Break Time is Over!</p>
          <p className="text-green-200">Ready to start a new focus session?</p>
        </div>
      ) : null}

      {hasStarted && goal && !isOnBreak ? (
        <div className="mb-6 p-4 text-center">
          <p className="text-white">{goal}</p>
        </div>
      ) : null}

      {isOnBreak ? (
        <div className="mb-6 p-4 bg-orange-900 border border-orange-700 rounded-xl">
          <p className="text-sm font-medium text-orange-400 mb-1">Break Time</p>
          <p className="text-orange-200">Take a well-deserved break!</p>
        </div>
      ) : null}

      <div className="text-center mb-7 sm:mb-12">
        <PixelArt
          type={selectedAnimation}
          frame={currentFrame(selectedAnimation, frameState)}
          label={`${metaOf(selectedAnimation).title} timer`}
          className="w-64 h-64 sm:w-96 sm:h-96 popup:w-40 popup:h-40 mx-auto"
        />
      </div>

      {isIdle ? (
        <>
          <GoalForm
            goal={goal}
            onGoalChange={setGoal}
            goalHistory={goalHistory}
            inputMinutes={inputMinutes}
            onMinutesChange={setInputMinutes}
            onStart={startFocus}
            selectedTags={selectedTags}
            onTagsChange={setSelectedTags}
            onEditTags={() => onNavigateToTab("tags")}
            isActive={isActive}
          />
          <AnimationPicker
            isVisible={showPicker}
            onToggleVisibility={() => setShowPicker((visible) => !visible)}
            selectedAnimation={selectedAnimation}
            onAnimationSelect={selectAnimation}
            autoShuffle={autoShuffle}
            onAutoShuffleToggle={toggleAutoShuffle}
          />
        </>
      ) : (
        <div className="text-center mb-8">
          <div className={`text-6xl font-bold ${clockColor} mb-4 font-mono`}>{formatClock(active)}</div>
          <div className="w-full bg-gray-800 rounded-full h-2 mb-4">
            <div
              className={`${isOnBreak ? "bg-orange-400" : "bg-white"} h-2 rounded-full transition-all duration-1000 ease-out`}
              style={{ width: `${progressPercent()}%` }}
            />
          </div>

          {isSessionComplete ? (
            <div className="bg-green-900/20 border border-green-700/40 rounded-xl px-3 py-2.5 mb-2.5 text-left">
              <div className="flex items-center justify-center gap-1.5 mb-2.5">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span className="text-green-400 text-sm font-semibold">Session complete!</span>
              </div>
              <div className="flex items-center gap-2 bg-gray-800/60 rounded-lg pl-3 pr-1.5 py-1.5">
                <span className="text-gray-300 text-xs font-medium whitespace-nowrap">Extend focus</span>
                <div className="ml-auto flex items-center gap-1.5">
                  <input
                    type="number"
                    value={extendMinutes}
                    onChange={(event) => setExtendMinutes(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void extendFocus();
                    }}
                    className="w-12 px-1.5 py-1 bg-gray-900 border border-gray-700 rounded-md text-white text-sm text-center focus:outline-none focus:border-green-500 transition-colors"
                    placeholder="10"
                    min="1"
                  />
                  <span className="text-gray-500 text-xs">min</span>
                  <button
                    onClick={extendFocus}
                    title={hotkeyHint("Extend", extendCombo)}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-medium transition-colors"
                  >
                    Extend
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {(focus.isCompleted || showDirectBreak) && !isOnBreak ? (
            <div className="flex items-center gap-2 bg-gray-800/60 rounded-lg pl-3 pr-1.5 py-1.5 mb-4 text-left">
              <Clock className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              <span className="text-gray-300 text-xs font-medium whitespace-nowrap">Break duration</span>
              <div className="ml-auto flex items-center gap-1.5">
                <input
                  type="number"
                  value={breakMinutes}
                  onChange={(event) => setBreakMinutes(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void startBreak();
                  }}
                  min="1"
                  max="60"
                  className="w-12 px-1.5 py-1 bg-gray-900 border border-gray-700 text-white text-sm text-center rounded-md focus:outline-none focus:border-orange-500 transition-colors"
                />
                <span className="text-gray-500 text-xs pr-1.5">min</span>
              </div>
            </div>
          ) : null}
        </div>
      )}

      <div className="flex gap-3 justify-center pb-4 sm:pb-0">
        {isIdle ? (
          <div className="flex flex-col items-center gap-2">
            <TimerButton onClick={startFocus} title={hotkeyHint("Start Focus", toggleCombo)} className={`${BUTTON_LARGE} bg-blue-600 hover:bg-blue-700`}>
              <Play className="w-5 h-5" />
              Start Focus
            </TimerButton>
            <button onClick={() => setShowDirectBreak(true)} title={hotkeyHint("Switch to Break", switchCombo)} className="text-xs text-gray-500 hover:text-orange-400 transition-colors">
              Switch to Break
            </button>
          </div>
        ) : isDirectBreak ? (
          <div className="flex flex-col items-center gap-2">
            <TimerButton onClick={startBreak} title={hotkeyHint("Start Break", toggleCombo)} className={`${BUTTON_LARGE} bg-orange-600 hover:bg-orange-700`}>
              <Play className="w-5 h-5" />
              Start Break
            </TimerButton>
            <button onClick={() => setShowDirectBreak(false)} title={hotkeyHint("Switch to Focus", switchCombo)} className="text-xs text-gray-500 hover:text-blue-400 transition-colors">
              Switch to Focus
            </button>
          </div>
        ) : isOnBreak ? (
          <>
            {breakTimer.isRunning ? (
              <TimerButton onClick={pauseBreak} title={hotkeyHint("Pause", toggleCombo)} className={`${BUTTON_SMALL} bg-orange-500 hover:bg-orange-600`}>
                <Pause className={ICON_SMALL} />
                <span>Pause</span>
              </TimerButton>
            ) : (
              <TimerButton onClick={resumeBreak} title={hotkeyHint("Resume", toggleCombo)} className={`${BUTTON_SMALL} bg-orange-500 hover:bg-orange-600`}>
                <Play className={ICON_SMALL} />
                <span>Resume</span>
              </TimerButton>
            )}
            <TimerButton onClick={endBreak} title={hotkeyHint("End", endCombo)} className={`${BUTTON_SMALL} bg-green-500 hover:bg-green-600`}>
              <Target className={ICON_SMALL} />
              <span>End</span>
            </TimerButton>
          </>
        ) : focus.isCompleted ? (
          <>
            <TimerButton onClick={startBreak} title={hotkeyHint("Start Break", toggleCombo)} className={`${BUTTON_BASE} px-4 py-3 bg-orange-600 hover:bg-orange-700`}>
              <Play className="w-5 h-5" />
              Start Break
            </TimerButton>
            <TimerButton onClick={() => void confirmReset()} title={hotkeyHint("Reset", resetCombo)} className={`${BUTTON_BASE} px-4 py-3 bg-gray-500 hover:bg-gray-600`}>
              <RotateCcw className="w-5 h-5" />
              Reset
            </TimerButton>
          </>
        ) : (
          <>
            {focus.isRunning ? (
              <TimerButton onClick={pauseFocus} title={hotkeyHint("Pause", toggleCombo)} className={`${BUTTON_SMALL} bg-orange-500 hover:bg-orange-600`}>
                <Pause className={ICON_SMALL} />
                Pause
              </TimerButton>
            ) : (
              <TimerButton onClick={resumeFocus} title={hotkeyHint("Resume", toggleCombo)} className={`${BUTTON_SMALL} bg-green-500 hover:bg-green-600`}>
                <Play className={ICON_SMALL} />
                Resume
              </TimerButton>
            )}
            <TimerButton onClick={completeEarly} title={hotkeyHint("Done", endCombo)} className={`${BUTTON_SMALL} bg-blue-500 hover:bg-blue-600`}>
              <Target className={ICON_SMALL} />
              <span>Done</span>
            </TimerButton>
            <TimerButton onClick={() => void confirmReset()} title={hotkeyHint("Reset", resetCombo)} className={`${BUTTON_SMALL} bg-gray-500 hover:bg-gray-600`}>
              <RotateCcw className={ICON_SMALL} />
              Reset
            </TimerButton>
          </>
        )}
      </div>
    </>
  );
});
