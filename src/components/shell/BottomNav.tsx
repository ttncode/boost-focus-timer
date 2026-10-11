"use client";

import type { ComponentType } from "react";
import { CheckSquare, Coffee, LineChart, List, Rocket } from "../icons";
import type { Tab } from "../types";

const ITEMS: readonly { tab: Tab; label: string; Icon: ComponentType<{ className?: string }>; activeColor: string }[] = [
  { tab: "timer", label: "Focus", Icon: Coffee, activeColor: "text-blue-400" },
  { tab: "todos", label: "To-Dos", Icon: List, activeColor: "text-blue-400" },
  { tab: "habits", label: "Habits", Icon: CheckSquare, activeColor: "text-blue-400" },
  { tab: "goals", label: "Goals", Icon: LineChart, activeColor: "text-blue-400" },
  { tab: "boost", label: "Boost", Icon: Rocket, activeColor: "text-orange-400" },
];

export function BottomNav({ activeTab, onTabChange }: { activeTab: Tab; onTabChange(tab: Tab): void }) {
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-40 flex gap-1 p-1.5 w-[calc(100%-1.5rem)] max-w-md bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-2xl shadow-2xl"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
    >
      {ITEMS.map(({ tab, label, Icon, activeColor }) => {
        const isActive = activeTab === tab;
        // Only the Focus button gets the slow 1s fade, so returning to the timer feels calmer.
        const duration = tab === "timer" ? " duration-1000" : "";
        return (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 px-2 rounded-lg transition-all ${
              isActive ? `bg-gray-800 ${activeColor} shadow-sm${duration}` : `text-gray-400 hover:text-gray-200${duration}`
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-xs font-medium">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
