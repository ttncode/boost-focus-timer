"use client";

import { useEffect, useRef, useState } from "react";
import { useHotkey, useHotkeyLabel } from "../hotkeys/HotkeysProvider";
import { BarChart3, ChevronDown, Maximize2, Pencil, User } from "../icons";
import { isPopupView, openFullPage } from "../lib/extension";

const SAFE_TOP = "max(env(safe-area-inset-top), 1rem)";

interface TopBarProps {
  displayName: string;
  displayTime: string;
  onEditDisplayName(): void;
  onOpenHistory(): void;
}

export function TopBar({ displayName, displayTime, onEditDisplayName, onOpenHistory }: TopBarProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const historyCombo = useHotkeyLabel("nav.history");
  const fullPageCombo = useHotkeyLabel("app.fullPage");
  const [isPopup] = useState(isPopupView);
  useHotkey("app.fullPage", openFullPage, isPopup);

  useEffect(() => {
    if (!isDropdownOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) setIsDropdownOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [isDropdownOpen]);

  return (
    <>
      <div className="fixed z-40" style={{ top: SAFE_TOP, left: "1rem" }} ref={dropdownRef}>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          <User className="w-3.5 h-3.5" />
          <span>
            Welcome, <span className="ph-mask">{displayName}</span>
          </span>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        {isDropdownOpen && (
          <div className="absolute left-0 mt-2 w-56 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50">
            <div className="py-1">
              <button
                onClick={() => {
                  onEditDisplayName();
                  setIsDropdownOpen(false);
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
              >
                <Pencil className="w-4 h-4" />
                Edit Display Name
              </button>
            </div>
          </div>
        )}
      </div>
      {/* In the popup the menu button takes the top-right corner (see StartMenu). */}
      <div className="fixed z-40 flex items-center gap-3" style={{ top: SAFE_TOP, right: isPopup ? "2.75rem" : "1rem" }}>
        {isPopup ? (
          <button
            onClick={openFullPage}
            aria-label="Open full page"
            title={fullPageCombo ? `Open full page (${fullPageCombo})` : "Open full page"}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        ) : null}
        <button
          onClick={onOpenHistory}
          title={historyCombo ? `Focus summary (${historyCombo})` : "Focus summary"}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <span className="font-medium">{displayTime} today</span>
          <BarChart3 className="w-3.5 h-3.5" />
        </button>
      </div>
    </>
  );
}
