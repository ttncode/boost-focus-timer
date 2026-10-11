"use client";

import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { FocusTimer } from "./focus/FocusTimer";
import { HotkeysProvider, useHotkey, useHotkeyMap } from "./hotkeys/HotkeysProvider";
import { databaseService } from "./lib/database-service";
import { getLocalUserId } from "./lib/local-db";
import { getDisplayName, saveDisplayName } from "./lib/profile";
import { BottomNav } from "./shell/BottomNav";
import { StartMenu } from "./shell/StartMenu";
import { TopBar } from "./shell/TopBar";
import { MOBILE_NAV_OFFSET, MOBILE_QUERY, SHORT_VIEWPORT_QUERY, useMediaQuery } from "./shell/use-media-query";
import type { FocusTimerHandle, Tab } from "./types";

const TodosPage = dynamic(() => import("./pages/TodosPage").then((m) => m.TodosPage));
const HabitsPage = dynamic(() => import("./pages/HabitsPage").then((m) => m.HabitsPage));
const GoalsPage = dynamic(() => import("./pages/GoalsPage").then((m) => m.GoalsPage));
const HistoryPage = dynamic(() => import("./pages/HistoryPage").then((m) => m.HistoryPage));
const AboutMePage = dynamic(() => import("./pages/AboutMePage").then((m) => m.AboutMePage));
const BoostFeed = dynamic(() => import("./boost/BoostFeed").then((m) => m.BoostFeed));
const TagsPage = dynamic(() => import("./settings/TagsPage").then((m) => m.TagsPage));

function formatTodayMinutes(minutes: number): string {
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

export function BoostApp() {
  return (
    <HotkeysProvider>
      <AppShell />
    </HotkeysProvider>
  );
}

const NAV_TABS: readonly Tab[] = ["timer", "todos", "habits", "goals", "boost", "history", "aboutme", "tags"];

function useNavigationHotkeys(navigate: (tab: Tab) => void) {
  useHotkeyMap(Object.fromEntries(NAV_TABS.map((tab) => [`nav.${tab}`, () => navigate(tab)])));
}

function AppShell() {
  const [userId] = useState(getLocalUserId);
  const [tab, setTab] = useState<Tab>("timer");
  const [previousTab, setPreviousTab] = useState<Tab>("timer");
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [displayName, setDisplayName] = useState(getDisplayName);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [pendingTodo, setPendingTodo] = useState<{ title: string; minutes: number } | null>(null);
  const timerRef = useRef<FocusTimerHandle>(null);
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const isShortViewport = useMediaQuery(SHORT_VIEWPORT_QUERY);

  useEffect(() => {
    databaseService.getTodayFocusMinutes().then(setTodayMinutes, (error: unknown) => {
      console.error("Error loading today minutes:", error);
    });
  }, []);

  const navigateFromCurrent = useCallback(
    (next: Tab) => {
      setPreviousTab(tab);
      setTab(next);
    },
    [tab],
  );

  const goBack = () => setTab(previousTab);

  useNavigationHotkeys(navigateFromCurrent);
  useHotkey("app.displayName", () => setIsEditingName(true));

  const saveName = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    saveDisplayName(trimmed);
    setDisplayName(trimmed);
    setIsEditingName(false);
    setNewName("");
  };

  const focusWithTodo = (title: string, minutes: number) => {
    const timer = timerRef.current;
    if (timer && (timer.isTimerRunning() || timer.isBreakRunning())) {
      setPendingTodo({ title, minutes });
    } else {
      timer?.setGoalAndMinutes(title, minutes);
    }
    setTab("timer");
  };

  const confirmPendingTodo = () => {
    if (!pendingTodo || !timerRef.current) return;
    timerRef.current.resetTimer();
    timerRef.current.setGoalAndMinutes(pendingTodo.title, pendingTodo.minutes);
    setPendingTodo(null);
  };

  const navHeight = isMobile ? "8rem" : MOBILE_NAV_OFFSET;
  const paddingBottom =
    tab === "timer" && !isShortViewport && !isMobile ? "0.25rem" : `calc(1rem + ${navHeight} + env(safe-area-inset-bottom, 0px))`;

  return (
    <>
      <div
        className="min-h-screen bg-black wide:bg-gray-900 flex flex-col items-center p-0 min-[42rem]:p-4 overflow-x-hidden"
        style={{ paddingTop: "max(env(safe-area-inset-top), 1rem)", paddingBottom }}
      >
        <div
          className={`bg-black wide:border wide:border-gray-800 wide:rounded-3xl wide:shadow-2xl p-4 sm:p-8 w-full max-w-2xl mx-auto ${
            tab === "timer" ? "mt-auto" : "wide:mt-auto"
          }`}
          style={{ paddingTop: isMobile ? "4rem" : undefined }}
        >
          {/* Kept mounted while hidden so a running session survives tab switches. */}
          <div className={tab === "timer" ? "" : "hidden"}>
            <FocusTimer
              ref={timerRef}
              userId={userId}
              isActive={tab === "timer"}
              onNavigateToTab={setTab}
              onTodayMinutesChange={setTodayMinutes}
            />
          </div>
          {/* Lazy pages suspend here, not at the app root, so the shell never flashes "Loading...". */}
          <Suspense fallback={null}>
            {tab === "boost" ? <BoostFeed /> : null}
            {tab === "todos" ? <TodosPage userId={userId} onFocusWithTodo={focusWithTodo} /> : null}
            {tab === "habits" ? <HabitsPage userId={userId} /> : null}
            {tab === "goals" ? <GoalsPage userId={userId} /> : null}
            {tab === "history" ? <HistoryPage userId={userId} /> : null}
            {tab === "aboutme" ? <AboutMePage userId={userId} /> : null}
            {tab === "tags" ? <TagsPage userId={userId} onBack={goBack} /> : null}
          </Suspense>
        </div>

        {isEditingName ? (
          <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md">
              <h3 className="text-xl font-semibold text-white mb-4">Edit Display Name</h3>
              <p className="text-gray-400 text-sm mb-4">Choose a display name that will appear in the welcome message</p>
              <input
                type="text"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Enter display name"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveName();
                  if (event.key === "Escape") setIsEditingName(false);
                }}
              />
              <div className="flex gap-3">
                <button
                  onClick={saveName}
                  disabled={!newName.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setIsEditingName(false);
                    setNewName("");
                  }}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="py-2 mt-1 mb-auto hidden wide:block" />

        {pendingTodo ? (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-2xl p-6 max-w-md w-full border border-gray-700 shadow-2xl">
              <h2 className="text-xl font-bold text-white mb-4">End Current Session?</h2>
              <p className="text-gray-300 mb-6 text-center">
                You have a session currently running. Do you want to end it and start a new focus session with this to-do?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setPendingTodo(null)}
                  className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmPendingTodo}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  End &amp; Start New
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <TopBar
          displayName={displayName}
          displayTime={formatTodayMinutes(todayMinutes)}
          onEditDisplayName={() => setIsEditingName(true)}
          onOpenHistory={() => setTab("history")}
        />
        <BottomNav activeTab={tab} onTabChange={setTab} />
      </div>
      <StartMenu onNavigate={navigateFromCurrent} />
    </>
  );
}
