"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bar, BarChart, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Clock,
  Hash,
  Pen,
  Target,
  Trash2,
  X,
} from "../icons";
import {
  DayTick,
  DayTooltip,
  formatMinutes,
  PeriodButton,
  type DailyFocusPeriod,
} from "./history/charts";
import {
  deleteSessionById,
  fetchSessionPauses,
  fetchSessionsForDateRange,
  fetchSessionsPaginated,
  fetchSessionsWithTags,
  PAGE_SIZE,
  readStored,
  store,
  updateSession,
  type FocusSession,
  type Tag,
} from "./history/data";
import {
  activeSegments,
  buildDayData,
  calculateComparisonStats,
  calculateStats,
  chartLayout,
  chartRange,
  formatDuration,
  formatSessionTime,
  formatTimeOnly,
  formatTimeValue,
  getDailyComparisonData,
  getYTicks,
  groupSessionsByDate,
  toLocalInput,
  yAxisFormatter,
  type DailyComparison,
} from "./history/stats";
import { hotkeyHint } from "../focus/GoalForm";
import { useHotkey, useHotkeyLabel } from "../hotkeys/HotkeysProvider";
import { TagSelector } from "./history/TagSelector";
import { TagsAnalytics } from "./history/TagsAnalytics";
import { useDialog } from "../dialogs/DialogProvider";

type PauseDetail = { start: string; end: string | null };

const PERIODS: { period: DailyFocusPeriod; label: string }[] = [
  { period: "7days", label: "Last 7 Days" },
  { period: "30days", label: "Last 30 Days" },
  { period: "90days", label: "Last 90 Days" },
  { period: "180days", label: "Last 180 Days" },
  { period: "365days", label: "Last 365 Days" },
  { period: "custom", label: "Custom" },
];

const CYCLED_PERIODS: readonly DailyFocusPeriod[] = PERIODS.map((p) => p.period).filter((period) => period !== "custom");

const AXIS = { axisLine: { stroke: "#374151" }, tickLine: { stroke: "#374151" } };
const CURSOR = { fill: "rgba(59, 130, 246, 0.1)" };

function isoDay(date: Date): string {
  return date.toISOString().split("T")[0];
}

function storedFlag(key: string, fallback: boolean): boolean {
  const s = readStored(key);
  return s === null ? fallback : s === "true";
}

function weekLabels(weekOffset: number) {
  return {
    thisLabel: weekOffset === 0 ? "This Week" : weekOffset === 1 ? "Last Week" : weekOffset + 1 + " Weeks Ago",
    lastLabel: weekOffset === 0 ? "Last Week" : weekOffset + 2 + " Weeks Ago",
  };
}

function WeeklyTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload as { period: string; minutes: number; sessions: number };
  return (
    <div className="bg-gray-800 text-white text-xs rounded py-2 px-3 border border-gray-700">
      <div className="font-semibold mb-1">{d.period}</div>
      <div className="text-gray-300">{formatMinutes(d.minutes)}</div>
      <div className="text-gray-400">{d.sessions} sessions</div>
    </div>
  );
}

function ComparisonTooltip({ active, payload, weekOffset }: TooltipContentProps & { weekOffset: number }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload as DailyComparison;
  const { thisLabel, lastLabel } = weekLabels(weekOffset);
  return (
    <div className="bg-gray-800 text-white text-xs rounded py-2 px-3 border border-gray-700">
      <div className="font-semibold mb-2">{d.day}</div>
      <div className="space-y-1">
        <div className="text-blue-400">
          {thisLabel}: {formatMinutes(d.thisWeekMinutes)}
        </div>
        <div className="text-gray-400">
          {lastLabel}: {formatMinutes(d.lastWeekMinutes)}
        </div>
      </div>
    </div>
  );
}

function ComparisonLegend({ weekOffset }: { weekOffset: number }) {
  const { thisLabel, lastLabel } = weekLabels(weekOffset);
  return (
    <div className="flex items-center justify-center gap-4 text-xs">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded bg-blue-800"></div>
        <span className="text-gray-400">{lastLabel}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded bg-blue-500"></div>
        <span className="text-gray-400">{thisLabel}</span>
      </div>
    </div>
  );
}

interface SectionProps {
  title: ReactNode;
  open: boolean;
  onToggle(): void;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

function Section({ title, open, onToggle, actions, className = "mb-8 ", children }: SectionProps) {
  const toggle = (
    <button onClick={onToggle} className="p-1 hover:bg-gray-800 rounded transition-colors">
      {open ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
    </button>
  );
  return (
    <div className={className + "bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"}>
      <div className="flex items-center justify-between p-4">
        {title}
        {actions ? (
          <div className="flex items-center gap-2">
            {actions}
            {toggle}
          </div>
        ) : (
          toggle
        )}
      </div>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function useStoredFlag(key: string, fallback: boolean): [boolean, () => void, (value: boolean) => void] {
  const [value, setValue] = useState(() => storedFlag(key, fallback));
  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      store(key, String(next));
    },
    [key],
  );
  return [value, () => set(!value), set];
}

function MetricCard({ icon, label, scope, value, sub }: { icon: ReactNode; label: string; scope: string; value: ReactNode; sub: ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="mb-2 h-10">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className="text-xs text-gray-400">{label}</span>
        </div>
        <div className="text-xs text-gray-500">{scope}</div>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-gray-500">{sub}</div>
    </div>
  );
}

export function HistoryPage({ userId }: { userId: string }) {
  const dialog = useDialog();
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [dayOffset, setDayOffset] = useState(0);
  const [hasMoreSessions, setHasMoreSessions] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingRef = useRef(false);
  const [editingSession, setEditingSession] = useState<string | null>(null);
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editGoal, setEditGoal] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sessionPauses, setSessionPauses] = useState<Map<string, number>>(new Map());
  const [sessionPauseDetails, setSessionPauseDetails] = useState<Map<string, PauseDetail[]>>(new Map());
  const [sessionTags, setSessionTags] = useState<Map<string, Tag[]>>(new Map());

  const [showDailyFocus, toggleDailyFocus] = useStoredFlag("focusHistory_showDailyFocus", true);
  const [showMetrics, toggleMetrics] = useStoredFlag("focusHistory_showMetrics", true);
  const [showYouVsYou, toggleYouVsYou] = useStoredFlag("focusHistory_showYouVsYou", true);
  const [showSessionHistory, toggleSessionHistory] = useStoredFlag("focusHistory_showSessionHistory", true);
  const [showTagsAnalytics, toggleTagsAnalytics] = useStoredFlag("focusHistory_showTagsAnalytics", true);

  const [weekOffset, setWeekOffset] = useState(0);

  const [dailyFocusPeriod, setDailyFocusPeriod] = useState<DailyFocusPeriod>(
    () => (readStored("focusHistory_dailyFocusPeriod") as DailyFocusPeriod | null) || "7days",
  );
  const [customStartDate, setCustomStartDate] = useState(() => {
    const saved = readStored("focusHistory_customStartDate");
    if (saved) return saved;
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return isoDay(d);
  });
  const [customEndDate, setCustomEndDate] = useState(() => readStored("focusHistory_customEndDate") || isoDay(new Date()));
  const [chartSessions, setChartSessions] = useState<FocusSession[]>([]);
  const [chartPauseMap, setChartPauseMap] = useState<Map<string, number>>(new Map());
  const [chartLoading, setChartLoading] = useState(false);

  const sessionsRef = useRef(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const loadSessions = useCallback(
    (append: boolean) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      if (append) setLoadingMore(true);
      else setLoading(true);
      const offset = append ? sessionsRef.current.length : 0;

      const run = async () => {
        const data = await fetchSessionsPaginated(PAGE_SIZE, offset);
        const pauseMap = new Map<string, number>();
        const pauseDetailsMap = new Map<string, PauseDetail[]>();
        await Promise.all(
          data.map(async (session) => {
            if (!session.start_time || !session.end_time) return;
            try {
              const pauses = await fetchSessionPauses(session.id);
              let totalPauseDuration = 0;
              const details: PauseDetail[] = [];
              pauses.forEach((pause) => {
                details.push({ start: pause.pause_start_time, end: pause.pause_end_time });
                if (pause.pause_end_time) {
                  totalPauseDuration += new Date(pause.pause_end_time).getTime() - new Date(pause.pause_start_time).getTime();
                }
              });
              pauseMap.set(session.id, totalPauseDuration);
              pauseDetailsMap.set(session.id, details);
            } catch {
              pauseMap.set(session.id, 0);
              pauseDetailsMap.set(session.id, []);
            }
          }),
        );
        const tagsMap = await fetchSessionsWithTags(
          userId,
          data.map((s) => s.id),
        );
        const merge = <V,>(prev: Map<string, V>, next: Map<string, V>) => {
          const merged = new Map(append ? prev : new Map<string, V>());
          next.forEach((v, k) => merged.set(k, v));
          return merged;
        };
        setSessionPauses((prev) => merge(prev, pauseMap));
        setSessionPauseDetails((prev) => merge(prev, pauseDetailsMap));
        setSessionTags((prev) => merge(prev, tagsMap));
        setSessions((prev) => (append ? prev.concat(data) : data));
        setHasMoreSessions(data.length === PAGE_SIZE);
      };

      run()
        .catch((e: unknown) => console.error("Failed to load sessions:", e))
        .finally(() => {
          setLoading(false);
          setLoadingMore(false);
          loadingRef.current = false;
        });
    },
    [userId],
  );

  useEffect(() => {
    queueMicrotask(() => loadSessions(false));
  }, [loadSessions]);

  useEffect(() => {
    let cancelled = false;
    const { startDate, endDate } = chartRange({ period: dailyFocusPeriod, dayOffset, customStartDate, customEndDate });
    queueMicrotask(() => !cancelled && setChartLoading(true));
    fetchSessionsForDateRange(startDate, endDate)
      .then((result) => {
        if (cancelled) return;
        setChartSessions(result.sessions);
        setChartPauseMap(result.pauseMap);
      })
      .catch((e: unknown) => console.error("Failed to load chart data:", e))
      .finally(() => !cancelled && setChartLoading(false));
    return () => {
      cancelled = true;
    };
  }, [dailyFocusPeriod, dayOffset, customStartDate, customEndDate]);

  useEffect(() => {
    function handleScroll() {
      if (loadingRef.current || !hasMoreSessions) return;
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200) loadSessions(true);
    }
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [loadSessions, hasMoreSessions]);

  function startEdit(session: FocusSession) {
    setEditingSession(session.id);
    setEditGoal(session.goal || "");
    setEditStartTime(toLocalInput(session.start_time));
    setEditEndTime(toLocalInput(session.end_time));
  }

  function cancelEdit() {
    setEditingSession(null);
    setEditStartTime("");
    setEditEndTime("");
  }

  function saveEdit(sessionId: string) {
    setSaving(true);
    const updateData: Partial<FocusSession> = {};
    if (editStartTime) updateData.start_time = new Date(editStartTime).toISOString();
    if (editEndTime) updateData.end_time = new Date(editEndTime).toISOString();
    if (editGoal.trim()) updateData.goal = editGoal.trim();
    updateSession(sessionId, updateData)
      .then(() => {
        setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, ...updateData } : s)));
        cancelEdit();
      })
      .catch((e: unknown) => {
        console.error("Failed to update session:", e);
        void dialog.alert("Failed to update session times");
      })
      .finally(() => setSaving(false));
  }

  async function doDeleteSession(sessionId: string) {
    if (!(await dialog.confirm("Are you sure you want to delete this session? This action cannot be undone.", { confirmLabel: "Delete", destructive: true }))) return;
    setDeleting(sessionId);
    deleteSessionById(sessionId)
      .then(() => {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (editingSession === sessionId) {
          cancelEdit();
          setEditGoal("");
        }
      })
      .catch((e: unknown) => {
        console.error("Failed to delete session:", e);
        void dialog.alert("Failed to delete session");
      })
      .finally(() => setDeleting(null));
  }

  function selectPeriod(period: DailyFocusPeriod) {
    setDailyFocusPeriod(period);
    store("focusHistory_dailyFocusPeriod", period);
    if (period === "custom") setDayOffset(0);
  }

  const groupedSessions = groupSessionsByDate(sessions);
  const isDailyFocusShown = !loading && sessions.length > 0 && showDailyFocus;
  const hasPeriodArrows = isDailyFocusShown && dailyFocusPeriod !== "custom" && !chartLoading;
  const previousPeriod = () => setDayOffset(dayOffset + 1);
  const nextPeriod = () => setDayOffset(Math.max(0, dayOffset - 1));
  const cyclePeriod = () => {
    const index = CYCLED_PERIODS.indexOf(dailyFocusPeriod);
    selectPeriod(CYCLED_PERIODS[(index + 1) % CYCLED_PERIODS.length]);
  };
  useHotkey("list.prev", previousPeriod, hasPeriodArrows);
  useHotkey("list.next", nextPeriod, hasPeriodArrows && dayOffset > 0);
  useHotkey("history.period", cyclePeriod, isDailyFocusShown && !chartLoading);
  const prevCombo = useHotkeyLabel("list.prev");
  const nextCombo = useHotkeyLabel("list.next");
  const periodCombo = useHotkeyLabel("history.period");
  const stats = calculateStats(sessions);
  const comparison = calculateComparisonStats(sessions, weekOffset);
  const dailyComparisonData = getDailyComparisonData(sessions, weekOffset);
  const dayData = useMemo(
    () => buildDayData({ period: dailyFocusPeriod, dayOffset, customStartDate, customEndDate }, chartSessions, chartPauseMap),
    [chartSessions, chartPauseMap, dayOffset, dailyFocusPeriod, customStartDate, customEndDate],
  );
  const layout = chartLayout(dailyFocusPeriod, dayData.length);
  const { thisLabel, lastLabel } = weekLabels(weekOffset);
  const todayTime = formatTimeValue(stats.todayMinutes);
  const weekTime = formatTimeValue(stats.weekMinutes);

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Focus Summary</h1>
        <p className="text-gray-400 text-sm">Track your focus sessions and progress</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="text-gray-400">Loading sessions...</div>
        </div>
      ) : Object.keys(groupedSessions).length === 0 ? (
        <div className="text-center py-12 text-gray-400">No focus sessions yet. Start your first session to see it here!</div>
      ) : (
        <>
          <Section title={<h2 className="text-lg font-semibold text-white">Daily Focus Time</h2>} open={showDailyFocus} onToggle={toggleDailyFocus}>
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex flex-wrap gap-2" title={hotkeyHint("Next chart range", periodCombo)}>
                {PERIODS.map((p) => (
                  <PeriodButton key={p.period} period={p.period} label={p.label} current={dailyFocusPeriod} loading={chartLoading} onSelect={selectPeriod} />
                ))}
              </div>
              {dailyFocusPeriod !== "custom" && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={previousPeriod}
                    disabled={chartLoading}
                    title={hotkeyHint("Previous period", prevCombo)}
                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={nextPeriod}
                    disabled={dayOffset === 0 || chartLoading}
                    title={hotkeyHint("Next period", nextCombo)}
                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
            {dailyFocusPeriod === "custom" && (
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="date"
                  value={customStartDate}
                  max={customEndDate}
                  onChange={(e) => {
                    setCustomStartDate(e.target.value);
                    store("focusHistory_customStartDate", e.target.value);
                  }}
                  className="bg-gray-800 text-gray-200 text-xs rounded-lg px-3 py-1.5 border border-gray-700 focus:border-blue-500 focus:outline-none"
                />
                <span className="text-gray-400 text-xs">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  min={customStartDate}
                  max={isoDay(new Date())}
                  onChange={(e) => {
                    setCustomEndDate(e.target.value);
                    store("focusHistory_customEndDate", e.target.value);
                  }}
                  className="bg-gray-800 text-gray-200 text-xs rounded-lg px-3 py-1.5 border border-gray-700 focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}
            <ResponsiveContainer width="100%" height={layout.height}>
              <BarChart data={dayData} margin={{ top: 10, right: 10, left: -20, bottom: layout.bottom }}>
                <XAxis
                  dataKey="dateStr"
                  tick={(props) => <DayTick {...props} dayData={dayData} period={dailyFocusPeriod} />}
                  {...AXIS}
                  interval={layout.interval}
                  height={layout.xAxisHeight}
                />
                <YAxis tick={{ fill: "#9CA3AF", fontSize: 12 }} {...AXIS} tickFormatter={yAxisFormatter} ticks={getYTicks(dayData)} />
                <Tooltip content={DayTooltip} cursor={CURSOR} />
                <Bar dataKey="minutes" fill="#3B82F6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Section>

          <Section title={<h2 className="text-lg font-semibold text-white">Focus Metrics</h2>} open={showMetrics} onToggle={toggleMetrics}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard icon={<Clock className="w-4 h-4 text-blue-400" />} label="Time" scope="Today" value={todayTime.value} sub={todayTime.label} />
              <MetricCard icon={<Hash className="w-4 h-4 text-green-400" />} label="Sessions" scope="Today" value={stats.todayCompleted} sub={stats.todaySessions + " started"} />
              <MetricCard icon={<Clock className="w-4 h-4 text-orange-400" />} label="Time" scope="7 Days" value={weekTime.value} sub={weekTime.label} />
              <MetricCard icon={<Hash className="w-4 h-4 text-pink-400" />} label="Sessions" scope="7 Days" value={stats.weekCompleted} sub={stats.weekSessions + " started"} />
            </div>
          </Section>

          <Section
            title={<h2 className="text-lg font-semibold text-white">You vs. You</h2>}
            open={showYouVsYou}
            onToggle={toggleYouVsYou}
            actions={
              <>
                <button onClick={() => setWeekOffset(weekOffset + 1)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))}
                  disabled={weekOffset === 0}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            }
          >
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-3 mb-3">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Weekly Totals</h3>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart
                  data={[
                    { period: lastLabel, minutes: comparison.lastWeek.minutes, sessions: comparison.lastWeek.sessions },
                    { period: thisLabel, minutes: comparison.thisWeek.minutes, sessions: comparison.thisWeek.sessions },
                  ]}
                  margin={{ top: 10, right: 30, left: -20, bottom: 30 }}
                >
                  <XAxis dataKey="period" tick={{ fill: "#9CA3AF", fontSize: 12 }} {...AXIS} height={40} />
                  <YAxis tick={{ fill: "#9CA3AF", fontSize: 12 }} {...AXIS} tickFormatter={(v: number) => (v >= 60 ? Math.floor(v / 60) + "h" : v + "m")} />
                  <Tooltip content={WeeklyTooltip} cursor={CURSOR} />
                  <Bar dataKey="minutes" radius={[8, 8, 0, 0]}>
                    <Cell fill="#1E3A8A" />
                    <Cell fill="#3B82F6" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-3 mb-3">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Daily Comparison</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dailyComparisonData} margin={{ top: 10, right: 30, left: -20, bottom: 25 }}>
                  <XAxis dataKey="day" tick={{ fill: "#9CA3AF", fontSize: 11 }} {...AXIS} interval={0} height={40} />
                  <YAxis tick={{ fill: "#9CA3AF", fontSize: 12 }} {...AXIS} tickFormatter={yAxisFormatter} />
                  <Tooltip content={(props) => <ComparisonTooltip {...props} weekOffset={weekOffset} />} cursor={CURSOR} />
                  <Legend wrapperStyle={{ paddingTop: "20px" }} content={() => <ComparisonLegend weekOffset={weekOffset} />} />
                  <Bar dataKey="lastWeekMinutes" fill="#1E3A8A" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="thisWeekMinutes" fill="#3B82F6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>

          <Section title={<h2 className="text-lg font-semibold text-white">Focus Time by Tag</h2>} open={showTagsAnalytics} onToggle={toggleTagsAnalytics}>
            <TagsAnalytics userId={userId} />
          </Section>

          <Section title={<h2 className="text-lg font-semibold text-white">Session History</h2>} open={showSessionHistory} onToggle={toggleSessionHistory} className="">
            <div className="space-y-6">
              {Object.entries(groupedSessions).map(([date, dateSessions]) => {
                const totalMinutes = dateSessions.reduce((sum, session) => {
                  if (!session.start_time || !session.end_time) return sum;
                  const pauseDuration = sessionPauses.get(session.id) || 0;
                  return sum + Math.max(0, (new Date(session.end_time).getTime() - new Date(session.start_time).getTime() - pauseDuration) / 60000);
                }, 0);
                return (
                  <div key={date} className="border border-gray-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <h2 className="text-lg font-semibold text-white">{date}</h2>
                      </div>
                      <div className="text-sm text-gray-400">
                        Total: {totalMinutes >= 60 ? Math.floor(totalMinutes / 60) + "h " + Math.round(totalMinutes % 60) + "m" : Math.round(totalMinutes) + " min"}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {dateSessions.map((session) => {
                        const isBreak = session.session_type === "break";
                        const Icon = isBreak ? Circle : Target;
                        const iconColor = isBreak ? "text-gray-400" : "text-blue-400";
                        const bgColor = isBreak ? "bg-gray-800/50" : "bg-gray-900";
                        const borderColor = isBreak ? "border-gray-700/50" : "border-gray-800";
                        const hoverBorderColor = isBreak ? "hover:border-gray-600" : "hover:border-gray-700";
                        const tags = sessionTags.get(session.id);
                        const segments = activeSegments(session, sessionPauseDetails.get(session.id) || []);
                        const busy = saving || deleting === session.id;
                        return (
                          <div key={session.id} className={bgColor + " border " + borderColor + " rounded-lg p-3 " + hoverBorderColor + " transition-colors"}>
                            {editingSession === session.id ? (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <Icon className={"w-3.5 h-3.5 " + iconColor + " shrink-0"} />
                                  <input
                                    type="text"
                                    value={editGoal}
                                    onChange={(e) => setEditGoal(e.target.value)}
                                    autoFocus
                                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                                    placeholder="Session title"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <div>
                                    <label className="text-xs text-gray-400 block mb-1">Start Time</label>
                                    <input
                                      type="datetime-local"
                                      value={editStartTime}
                                      onChange={(e) => setEditStartTime(e.target.value)}
                                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-400 block mb-1">End Time</label>
                                    <input
                                      type="datetime-local"
                                      value={editEndTime}
                                      onChange={(e) => setEditEndTime(e.target.value)}
                                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-400 block mb-1">Tags</label>
                                    <TagSelector
                                      userId={userId}
                                      sessionId={session.id}
                                      selectedTags={tags || []}
                                      onTagsChange={(next) =>
                                        setSessionTags((prev) => {
                                          const newMap = new Map(prev);
                                          newMap.set(session.id, next);
                                          return newMap;
                                        })
                                      }
                                      compact
                                    />
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button onClick={() => saveEdit(session.id)} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors disabled:opacity-50">
                                    <Check className="w-3.5 h-3.5" />
                                    {saving ? "Saving..." : "Save"}
                                  </button>
                                  <button onClick={cancelEdit} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors disabled:opacity-50">
                                    <X className="w-3.5 h-3.5" />
                                    Cancel
                                  </button>
                                  <button onClick={() => doDeleteSession(session.id)} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors disabled:opacity-50 ml-auto">
                                    <Trash2 className="w-3.5 h-3.5" />
                                    {deleting === session.id ? "Deleting..." : "Delete"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Icon className={"w-3.5 h-3.5 " + iconColor + " shrink-0"} />
                                    <p className="text-white text-sm font-medium truncate" title={session.goal ?? undefined}>
                                      {session.goal}
                                    </p>
                                  </div>
                                  {tags && tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mb-2">
                                      {tags.map((tag) => (
                                        <div key={tag.id} className="px-2 py-0.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: tag.color }}>
                                          {tag.name}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <div className="text-xs text-gray-500 space-y-0.5">
                                    <div>{formatSessionTime(session.start_time, session.end_time)}</div>
                                    {segments && segments.length > 1 && (
                                      <div className="space-y-0.5">
                                        <div>Active:</div>
                                        {segments.map((segment, idx) => (
                                          <div key={idx} className="pl-2">
                                            {formatTimeOnly(segment.start)} - {formatTimeOnly(segment.end)}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <div className="flex items-center gap-1 text-gray-400 text-sm">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>{formatDuration(session, sessionPauses.get(session.id) || 0)}</span>
                                  </div>
                                  <button onClick={() => startEdit(session)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors" title="Edit session">
                                    <Pen className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {loadingMore && <div className="text-center py-4 text-gray-400 text-sm">Loading more sessions...</div>}
              {!hasMoreSessions && sessions.length > PAGE_SIZE && <div className="text-center py-4 text-gray-500 text-sm">All sessions loaded</div>}
            </div>
          </Section>
        </>
      )}
    </>
  );
}
