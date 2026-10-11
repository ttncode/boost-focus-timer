"use client";

import { forwardRef, useImperativeHandle } from "react";
import type { FocusTimerHandle, FocusTimerProps } from "../types";

export const FocusTimer = forwardRef<FocusTimerHandle, FocusTimerProps>(function FocusTimer(props, ref) {
  void props;
  useImperativeHandle(ref, () => ({
    setGoalAndMinutes: () => {},
    resetTimer: () => {},
    isTimerRunning: () => false,
    isBreakRunning: () => false,
  }));
  return null;
});
