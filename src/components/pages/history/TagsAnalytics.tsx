"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type PieLabelRenderProps,
  type TooltipContentProps,
} from "recharts";
import { Clock, Layers, LayoutGrid, Loader2, Tag as TagIcon, TrendingUp } from "../../icons";
import { fetchFocusTimeByTag, fetchTags, readStored, store, type Tag } from "./data";

type ViewMode = "today" | "7days" | "30days" | "90days" | "180days" | "365days" | "custom";
type ChartStyle = "grouped" | "stacked";

type DayRow = { date: Date; dateStr: string; day: string; total: number } & Record<string, number | string | Date>;
interface Aggregate {
  tag: Tag;
  minutes: number;
  sessions: number;
}
interface PieRow {
  name: string;
  minutes: number;
  sessions: number;
  color: string;
}

const DAY_COUNTS: Record<Exclude<ViewMode, "custom">, number> = {
  today: 1,
  "7days": 7,
  "30days": 30,
  "90days": 90,
  "180days": 180,
  "365days": 365,
};

const VIEW_OPTIONS: { mode: ViewMode; label: string }[] = [
  { mode: "today", label: "Today" },
  { mode: "7days", label: "Past 7 Days" },
  { mode: "30days", label: "Past 30 Days" },
  { mode: "90days", label: "Past 90 Days" },
  { mode: "180days", label: "Past 180 Days" },
  { mode: "365days", label: "Past 365 Days" },
  { mode: "custom", label: "Custom" },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BASE_KEYS = new Set(["date", "dateStr", "day", "total"]);

function isoDay(date: Date): string {
  return date.toISOString().split("T")[0];
}

function defaultStartDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return isoDay(d);
}

function readSelectedTagIds(): Set<string> {
  const saved = readStored("tagsAnalytics_selectedTagIds");
  if (!saved) return new Set();
  try {
    return new Set(JSON.parse(saved) as string[]);
  } catch {
    return new Set();
  }
}

function formatTime(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hours + "h " + mins + "m";
  }
  return Math.round(minutes) + "m";
}

// Local calendar-day key (DST-safe): bucket a timestamp by its local Y-M-D so long ranges
// spanning a daylight-saving change don't drift a day.
function dayKey(d: Date): string {
  return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
}

function rangeFor(viewMode: ViewMode, customStartDate: string, customEndDate: string) {
  if (viewMode === "custom") {
    const startDate = new Date(customStartDate + "T00:00:00");
    startDate.setHours(0, 0, 0, 0);
    const lastDay = new Date(customEndDate + "T00:00:00");
    lastDay.setHours(0, 0, 0, 0);
    const numDays = Math.max(1, Math.round((lastDay.getTime() - startDate.getTime()) / MS_PER_DAY) + 1);
    const endDate = new Date(lastDay);
    endDate.setHours(23, 59, 59, 999);
    return { startDate, endDate, numDays };
  }
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const numDays = DAY_COUNTS[viewMode];
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - numDays + 1);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 1);
  return { startDate, endDate, numDays };
}

function DailyTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || !payload.length) return null;
  const dataPoint = payload[0]?.payload as DayRow | undefined;
  const total = payload.reduce((sum, p) => sum + (Number(p.value) || 0), 0);
  return (
    <div className="bg-gray-800 text-white text-xs rounded py-2 px-3 border border-gray-700 max-w-xs">
      <div className="font-semibold mb-2">
        {dataPoint && dataPoint.day} {dataPoint && dataPoint.dateStr}
      </div>
      <div className="space-y-1">
        {payload.map((entry, index) =>
          Number(entry.value) > 0 ? (
            <div key={index} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-gray-300">{entry.name}:</span>
              <span className="text-white">{formatTime(Number(entry.value))}</span>
            </div>
          ) : null,
        )}
      </div>
      <div className="mt-2 pt-2 border-t border-gray-700 font-semibold">Total: {formatTime(total)}</div>
    </div>
  );
}

function PieTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload as PieRow;
  return (
    <div className="bg-gray-800 text-white text-xs rounded py-2 px-3 border border-gray-700">
      <div className="font-semibold mb-1">{data.name}</div>
      <div className="text-gray-300">{formatTime(data.minutes)}</div>
      <div className="text-gray-400">{data.sessions} sessions</div>
    </div>
  );
}

function wrapLabel(name: string): string[] {
  const maxCharsPerLine = 12;
  const lines: string[] = [];
  let currentLine = "";
  name.split(" ").forEach((word) => {
    if ((currentLine + " " + word).trim().length <= maxCharsPerLine) currentLine = (currentLine + " " + word).trim();
    else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  });
  if (currentLine) lines.push(currentLine);
  return lines;
}

function renderPieLabel(props: PieLabelRenderProps) {
  const RADIAN = Math.PI / 180;
  const cx = Number(props.cx);
  const radius = Number(props.outerRadius) + 25;
  const midAngle = Number(props.midAngle);
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = Number(props.cy) + radius * Math.sin(-midAngle * RADIAN);
  const percentage = (Number(props.percent) * 100).toFixed(0) + "%";
  return (
    <text x={x} y={y} fill="#9CA3AF" textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize="11">
      {wrapLabel(String(props.name)).map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : 13}>
          {line}
        </tspan>
      ))}
      <tspan x={x} dy={13} fontWeight="bold" fill="#fff">
        {percentage}
      </tspan>
    </text>
  );
}

export function TagsAnalytics({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>(() => (readStored("tagsAnalytics_viewMode") as ViewMode | null) || "7days");
  const [displayedViewMode, setDisplayedViewMode] = useState<ViewMode>(viewMode);
  const [customStartDate, setCustomStartDate] = useState(() => readStored("tagsAnalytics_customStartDate") || defaultStartDate());
  const [customEndDate, setCustomEndDate] = useState(() => readStored("tagsAnalytics_customEndDate") || isoDay(new Date()));
  const [chartStyle, setChartStyle] = useState<ChartStyle>(() => (readStored("tagsAnalytics_chartStyle") as ChartStyle | null) || "grouped");
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(readSelectedTagIds);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [dailyData, setDailyData] = useState<DayRow[]>([]);
  const [aggregatedData, setAggregatedData] = useState<Aggregate[]>([]);

  useEffect(() => {
    fetchTags(userId, true)
      .then((tags) => {
        setAllTags(tags);
        setSelectedTagIds((current) => {
          if (current.size > 0) return current;
          const all = new Set(tags.map((t) => t.id));
          store("tagsAnalytics_selectedTagIds", JSON.stringify(Array.from(all)));
          return all;
        });
      })
      .catch((e: unknown) => console.error("Failed to load tags:", e));
  }, [userId]);

  useEffect(() => {
    if (allTags.length === 0) return;
    let cancelled = false;
    const { startDate, endDate, numDays } = rangeFor(viewMode, customStartDate, customEndDate);
    queueMicrotask(() => !cancelled && setLoading(true));

    fetchFocusTimeByTag(userId, startDate, endDate)
      .then((allTagStats) => {
        if (cancelled) return;
        const data: DayRow[] = [];
        const dayIndexByKey = new Map<string, number>();
        const aggregatedMap = new Map<string, Aggregate>();
        for (let i = 0; i < numDays; i++) {
          const dayStart = new Date(startDate);
          dayStart.setDate(dayStart.getDate() + i);
          dayStart.setHours(0, 0, 0, 0);
          dayIndexByKey.set(dayKey(dayStart), i);
          data.push({
            date: dayStart,
            dateStr: dayStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            day: dayStart.toLocaleDateString("en-US", { weekday: "short" }),
            total: 0,
          });
        }

        allTagStats.sessions.forEach((session) => {
          if (!session.start_time || !session.end_time) return;
          const dayIndex = dayIndexByKey.get(dayKey(new Date(session.created_at)));
          if (dayIndex === undefined) return;
          const duration = (new Date(session.end_time).getTime() - new Date(session.start_time).getTime()) / 60000;
          const sessionTags = allTagStats.sessionTagsMap.get(session.id) || [];
          sessionTags.forEach((tag) => {
            const currentMinutes = Number(data[dayIndex][tag.name]) || 0;
            data[dayIndex][tag.name] = Math.round(currentMinutes + duration);
            data[dayIndex].total += duration;
            const existing = aggregatedMap.get(tag.id);
            if (existing) {
              existing.minutes += duration;
              existing.sessions += 1;
            } else aggregatedMap.set(tag.id, { tag, minutes: duration, sessions: 1 });
          });
        });

        data.forEach((day) => {
          day.total = Math.round(day.total);
        });
        setDailyData(data);
        setAggregatedData(Array.from(aggregatedMap.values()).sort((a, b) => b.minutes - a.minutes));
        setDisplayedViewMode(viewMode);
      })
      .catch((e: unknown) => console.error("Failed to load tag analytics:", e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [userId, viewMode, allTags, customStartDate, customEndDate]);

  function saveSelection(next: Set<string>) {
    setSelectedTagIds(next);
    store("tagsAnalytics_selectedTagIds", JSON.stringify(Array.from(next)));
  }

  function toggleTag(tagId: string) {
    const next = new Set(selectedTagIds);
    if (next.has(tagId)) next.delete(tagId);
    else next.add(tagId);
    saveSelection(next);
  }

  function updateViewMode(mode: ViewMode) {
    setViewMode(mode);
    store("tagsAnalytics_viewMode", mode);
  }

  function updateChartStyle(style: ChartStyle) {
    setChartStyle(style);
    store("tagsAnalytics_chartStyle", style);
  }

  const visibleTags = useMemo(() => allTags.filter((t) => selectedTagIds.has(t.id)), [allTags, selectedTagIds]);

  const tagsWithData = useMemo(() => {
    const tagNames = new Set<string>();
    dailyData.forEach((day) => Object.keys(day).forEach((key) => !BASE_KEYS.has(key) && tagNames.add(key)));
    return visibleTags.filter((t) => tagNames.has(t.name));
  }, [dailyData, visibleTags]);

  const filteredAggregatedData = useMemo(
    () => aggregatedData.filter((item) => selectedTagIds.has(item.tag.id)),
    [aggregatedData, selectedTagIds],
  );

  const pieChartData = useMemo<PieRow[]>(
    () =>
      filteredAggregatedData.map((item) => ({
        name: item.tag.name,
        minutes: Math.round(item.minutes),
        sessions: item.sessions,
        color: item.tag.color,
      })),
    [filteredAggregatedData],
  );

  const displayedNumDays = displayedViewMode === "custom" ? dailyData.length : DAY_COUNTS[displayedViewMode];
  const isLongView = displayedNumDays > 14;
  const chartHeight = isLongView ? 350 : 250;
  const xAxisInterval =
    displayedViewMode === "365days" ? 29
      : displayedViewMode === "180days" ? 13
        : displayedViewMode === "90days" ? 6
          : displayedViewMode === "30days" ? 2
            : displayedViewMode === "custom" ? (displayedNumDays > 60 ? 6 : displayedNumDays > 14 ? 2 : 0)
              : 0;
  const isInitialLoad = loading && dailyData.length === 0 && allTags.length === 0;

  if (isInitialLoad) {
    return (
      <div className="flex justify-center py-8">
        <div className="text-gray-400">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {allTags.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TagIcon className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs font-medium text-gray-400">
                Filter ({selectedTagIds.size}/{allTags.length})
              </span>
            </div>
            <div className="flex gap-2 text-xs">
              <button onClick={() => saveSelection(new Set(allTags.map((t) => t.id)))} className="text-blue-400 hover:text-blue-300 transition-colors">
                All
              </button>
              <button onClick={() => saveSelection(new Set())} className="text-gray-500 hover:text-gray-400 transition-colors">
                None
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className={"px-2 py-0.5 rounded-full text-xs font-medium transition-all " + (selectedTagIds.has(tag.id) ? "ring-1 ring-white/40" : "opacity-30 hover:opacity-50")}
                style={{ backgroundColor: tag.color }}
              >
                <span className="text-white">{tag.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-center">
        <div className="flex flex-wrap justify-center gap-2">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.mode}
              onClick={() => updateViewMode(opt.mode)}
              disabled={loading}
              className={
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 " +
                (viewMode === opt.mode ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700") +
                (loading ? " cursor-not-allowed" : "")
              }
            >
              {loading && viewMode === opt.mode && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {viewMode === "custom" && (
        <div className="flex items-center justify-center gap-2">
          <input
            type="date"
            value={customStartDate}
            max={customEndDate}
            onChange={(e) => {
              setCustomStartDate(e.target.value);
              store("tagsAnalytics_customStartDate", e.target.value);
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
              store("tagsAnalytics_customEndDate", e.target.value);
            }}
            className="bg-gray-800 text-gray-200 text-xs rounded-lg px-3 py-1.5 border border-gray-700 focus:border-blue-500 focus:outline-none"
          />
        </div>
      )}

      {tagsWithData.length > 0 ? (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-300">Daily Breakdown</h3>
            <div className="flex items-center gap-1 bg-gray-700/50 rounded-lg p-0.5">
              <button
                onClick={() => updateChartStyle("grouped")}
                className={"p-1.5 rounded transition-colors " + (chartStyle === "grouped" ? "bg-gray-600 text-white" : "text-gray-400 hover:text-gray-300")}
                title="Side by side"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => updateChartStyle("stacked")}
                className={"p-1.5 rounded transition-colors " + (chartStyle === "stacked" ? "bg-gray-600 text-white" : "text-gray-400 hover:text-gray-300")}
                title="Stacked"
              >
                <Layers className="w-4 h-4" />
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={dailyData} margin={{ top: 10, right: 30, left: -10, bottom: isLongView ? 60 : 30 }}>
              <XAxis
                dataKey={displayedViewMode === "7days" ? "day" : "dateStr"}
                tick={{ fill: "#9CA3AF", fontSize: isLongView ? 10 : 11 }}
                axisLine={{ stroke: "#374151" }}
                tickLine={{ stroke: "#374151" }}
                angle={isLongView ? -45 : 0}
                textAnchor={isLongView ? "end" : "middle"}
                height={isLongView ? 60 : 30}
                interval={xAxisInterval}
              />
              <YAxis
                tick={{ fill: "#9CA3AF", fontSize: 12 }}
                axisLine={{ stroke: "#374151" }}
                tickLine={{ stroke: "#374151" }}
                tickFormatter={(value: number) => (value >= 60 ? Math.floor(value / 60) + "h" : value + "m")}
              />
              <Tooltip content={DailyTooltip} cursor={{ fill: "rgba(59, 130, 246, 0.1)" }} />
              <Legend wrapperStyle={{ paddingTop: "10px" }} formatter={(value) => <span className="text-gray-400 text-xs">{value}</span>} />
              {tagsWithData.map((tag) => (
                <Bar
                  key={tag.id}
                  dataKey={tag.name}
                  fill={tag.color}
                  stackId={chartStyle === "stacked" ? "a" : undefined}
                  radius={chartStyle === "stacked" ? 0 : [4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400">
          <TagIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No tagged sessions in this period.</p>
          <p className="text-sm mt-1">Tag your focus sessions to see the breakdown!</p>
        </div>
      )}

      {pieChartData.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Time Breakdown</h3>
          <ResponsiveContainer width="100%" height={400}>
            <PieChart margin={{ top: 20, right: 80, bottom: 20, left: 80 }}>
              <Pie
                data={pieChartData}
                dataKey="minutes"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={120}
                label={renderPieLabel}
                labelLine={{ stroke: "#4B5563", strokeWidth: 1 }}
                isAnimationActive={false}
              >
                {pieChartData.map((entry, index) => (
                  <Cell key={"cell-" + index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={PieTooltip} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {filteredAggregatedData.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-green-400" />
              <span className="text-xs text-gray-400">Total Time</span>
            </div>
            <div className="text-2xl font-bold text-white">
              {formatTime(filteredAggregatedData.reduce((sum, item) => sum + item.minutes, 0))}
            </div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-gray-400">Sessions</span>
            </div>
            <div className="text-2xl font-bold text-white">{filteredAggregatedData.reduce((sum, item) => sum + item.sessions, 0)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
