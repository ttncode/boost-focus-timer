export type Tab = "timer" | "todos" | "habits" | "goals" | "boost" | "history" | "aboutme" | "tags";

/** Imperative handle the shell uses to drive the always-mounted focus timer. */
export interface FocusTimerHandle {
  setGoalAndMinutes(goal: string, minutes: number): void;
  resetTimer(): void;
  isTimerRunning(): boolean;
  isBreakRunning(): boolean;
}

export interface FocusTimerProps {
  userId: string;
  /** False while another tab is shown; the timer stays mounted but must ignore its hotkeys. */
  isActive: boolean;
  onNavigateToTab(tab: Tab): void;
  onTodayMinutesChange(minutes: number): void;
}

export interface SubPageProps {
  userId: string;
  onBack(): void;
}
