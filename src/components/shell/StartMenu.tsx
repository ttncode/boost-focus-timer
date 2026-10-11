"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { ChevronDown, CircleUser, Menu, Settings, Tag } from "../icons";
import { useHotkey, useHotkeyLabel } from "../hotkeys/HotkeysProvider";
import type { Tab } from "../types";
import { MOBILE_NAV_OFFSET, MOBILE_QUERY, useMediaQuery } from "./use-media-query";

const SUB_ITEM =
  "w-full px-4 py-2 text-left text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors flex items-center gap-2";
const TOP_ITEM = "w-full px-4 py-3 text-left text-sm text-gray-300 hover:bg-gray-800 transition-colors flex items-center gap-3";

const SETTINGS: readonly { label: string; Icon: ComponentType<{ className?: string }>; target: Tab }[] = [
  { label: "About Me", Icon: CircleUser, target: "aboutme" },
  { label: "Tags", Icon: Tag, target: "tags" },
];

export function StartMenu({ onNavigate }: { onNavigate(tab: Tab): void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery(MOBILE_QUERY);
  useHotkey("nav.menu", () => setIsOpen((open) => !open));
  const menuCombo = useHotkeyLabel("nav.menu");

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [isOpen]);

  const go = (target: Tab) => {
    onNavigate(target);
    setIsOpen(false);
  };

  const offset = isMobile ? ` + ${MOBILE_NAV_OFFSET}` : "";

  return (
    <div className="fixed left-4 z-40" style={{ bottom: `calc(1rem${offset} + env(safe-area-inset-bottom, 0px))` }} ref={menuRef}>
      {isOpen ? (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-h-[70vh] overflow-hidden">
          <div className="py-2 max-h-[70vh] overflow-y-auto force-scrollbar">
            <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className={`${TOP_ITEM} justify-between`}>
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5" />
                <span>Settings</span>
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${isSettingsOpen ? "rotate-180" : ""}`} />
            </button>
            {isSettingsOpen ? (
              <div className="bg-gray-900 ml-4 border-l-2 border-gray-700">
                {SETTINGS.map(({ label, Icon, target }) => (
                  <button key={label} onClick={() => go(target)} className={SUB_ITEM}>
                    <Icon className="w-4 h-4" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Menu"
        title={menuCombo ? `Menu (${menuCombo})` : "Menu"}
        aria-expanded={isOpen}
        className="bg-gray-800 hover:bg-gray-700 text-white p-3 rounded-lg border border-gray-700 shadow-lg transition-all flex items-center gap-2"
      >
        <Menu className="w-5 h-5" />
      </button>
    </div>
  );
}
