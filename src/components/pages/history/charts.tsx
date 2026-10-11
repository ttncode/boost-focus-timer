"use client";

import type { TooltipContentProps, XAxisTickContentProps } from "recharts";
import { Loader2 } from "../../icons";

export type DailyFocusPeriod = "7days" | "30days" | "90days" | "180days" | "365days" | "custom";

export interface DayData {
  date: Date;
  day: string;
  dateStr: string;
  minutes: number;
}

export function formatMinutes(minutes: number): string {
  return minutes >= 60 ? Math.floor(minutes / 60) + "h " + (minutes % 60) + "m" : minutes + " min";
}

export function DayTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload as DayData;
  return (
    <div className="bg-gray-800 text-white text-xs rounded py-2 px-3 border border-gray-700">
      <div className="font-medium mb-1">
        {data.day}, {data.dateStr}
      </div>
      <div className="text-gray-300">{formatMinutes(data.minutes)}</div>
    </div>
  );
}

export function DayTick({ x, y, payload, dayData, period }: XAxisTickContentProps & { dayData: DayData[]; period: DailyFocusPeriod }) {
  const data = dayData[payload.index];
  if (!data) return null;
  if (period === "30days" || period === "90days") {
    return (
      <g transform={"translate(" + x + "," + y + ")"}>
        <text x={0} y={0} dy={16} textAnchor="end" fill="#9CA3AF" fontSize={period === "90days" ? 8 : 9} transform="rotate(-45)">
          {data.dateStr}
        </text>
      </g>
    );
  }
  return (
    <g transform={"translate(" + x + "," + y + ")"}>
      <text x={0} y={0} dy={10} textAnchor="middle" fill="#9CA3AF" fontSize="11">
        {data.day}
      </text>
      <text x={0} y={0} dy={24} textAnchor="middle" fill="#6B7280" fontSize="10">
        {data.dateStr}
      </text>
    </g>
  );
}

interface PeriodButtonProps {
  period: DailyFocusPeriod;
  label: string;
  current: DailyFocusPeriod;
  loading: boolean;
  onSelect(period: DailyFocusPeriod): void;
}

export function PeriodButton({ period, label, current, loading, onSelect }: PeriodButtonProps) {
  return (
    <button
      onClick={() => onSelect(period)}
      disabled={loading}
      className={
        "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 " +
        (current === period ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700")
      }
    >
      {loading && current === period && <Loader2 className="w-3 h-3 animate-spin" />}
      {label}
    </button>
  );
}
