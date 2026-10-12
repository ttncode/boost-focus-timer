"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { notificationStatus, requestNotificationPermission, type NotificationStatus } from "../focus/notifications";
import { Bell, ChevronDown, CircleUser, Expand, Menu, Settings, Tag, Volume2 } from "../icons";
import { useHotkey, useHotkeyLabel } from "../hotkeys/HotkeysProvider";
import type { Tab } from "../types";
import { isPopupView, openFullPage } from "../lib/extension";
import { SoundsPanel } from "./SoundsPanel";
import { MOBILE_NAV_OFFSET, MOBILE_QUERY, useMediaQuery } from "./use-media-query";
import { useDialog } from "../dialogs/DialogProvider";

const SUB_ITEM =
  "w-full px-4 py-2 text-left text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors flex items-center gap-2";
const TOP_ITEM = "w-full px-4 py-3 text-left text-sm text-gray-300 hover:bg-gray-800 transition-colors flex items-center gap-3";

const SETTINGS: readonly { label: string; Icon: ComponentType<{ className?: string }>; target: Tab }[] = [
  { label: "About Me", Icon: CircleUser, target: "aboutme" },
  { label: "Tags", Icon: Tag, target: "tags" },
];

const NOTIFICATION_LABELS: Readonly<Record<NotificationPermission, string>> = {
  granted: "Notifications: On",
  default: "Turn on notifications",
  denied: "Notifications: Blocked",
};

const NOTIFICATION_HELP: Readonly<Record<"granted" | "denied", string>> = {
  granted:
    "Notifications are on: you'll get one when a focus session or break ends. To turn them off, block notifications for this site in your browser's site settings (the icon left of the address bar).",
  denied:
    "Notifications are blocked for this site. Allow them in your browser's site settings (the icon left of the address bar), then reload.",
};

/** Shows the browser's notification permission; asks again when the first-open prompt was dismissed. */
function NotificationsItem() {
  const dialog = useDialog();
  const [status, setStatus] = useState<NotificationStatus>(notificationStatus);
  if (status === "unsupported") return null;

  const act = async () => {
    if (status === "default") setStatus(await requestNotificationPermission());
    else await dialog.alert(NOTIFICATION_HELP[status], { title: "Notifications" });
  };

  return (
    <button onClick={() => void act()} className={SUB_ITEM}>
      <Bell className="w-4 h-4" />
      <span>{NOTIFICATION_LABELS[status]}</span>
    </button>
  );
}

export function StartMenu({ onNavigate }: { onNavigate(tab: Tab): void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);
  const [isSoundsOpen, setIsSoundsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const isMobile = useMediaQuery(MOBILE_QUERY);
  // In the 400x600 popup a floating bottom-left button would cover the timer controls,
  // so the menu moves into the top bar and opens downward.
  const [isPopup] = useState(isPopupView);
  useHotkey("nav.menu", () => setIsOpen((open) => !open));
  const menuCombo = useHotkeyLabel("nav.menu");
  const fullPageCombo = useHotkeyLabel("app.fullPage");
  useHotkey("app.fullPage", () => void openFullPage(), isPopup);

  useEffect(() => {
    if (isOpen) panelRef.current?.querySelector("button")?.focus();
  }, [isOpen]);

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
  const position = isPopup
    ? { top: "max(env(safe-area-inset-top), 1rem)", right: "1rem" }
    : { bottom: `calc(1rem${offset} + env(safe-area-inset-bottom, 0px))`, left: "1rem" };

  return (
    <div className="fixed z-40" style={position} ref={menuRef}>
      {isOpen ? (
        <div
          className={`absolute w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-h-[70vh] overflow-hidden ${
            isPopup ? "top-full right-0 mt-2" : "bottom-full left-0 mb-2"
          }`}
        >
          <div
            ref={panelRef}
            className="py-2 max-h-[70vh] overflow-y-auto force-scrollbar"
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              setIsOpen(false);
              toggleRef.current?.focus();
            }}
          >
            {isPopup ? (
              <button onClick={() => void openFullPage()} className={TOP_ITEM}>
                <Expand className="w-5 h-5" />
                <span className="flex-1">Open full page</span>
                {fullPageCombo ? <span className="text-xs text-gray-500 font-mono">{fullPageCombo}</span> : null}
              </button>
            ) : null}
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
                <button
                  onClick={() => {
                    setIsSoundsOpen(true);
                    setIsOpen(false);
                  }}
                  className={SUB_ITEM}
                >
                  <Volume2 className="w-4 h-4" />
                  <span>Sounds</span>
                </button>
                <NotificationsItem />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <button
        ref={toggleRef}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Menu"
        title={menuCombo ? `Menu (${menuCombo})` : "Menu"}
        aria-expanded={isOpen}
        className={
          isPopup
            ? "flex items-center text-gray-400 hover:text-white transition-colors"
            : "bg-gray-800 hover:bg-gray-700 text-white p-3 rounded-lg border border-gray-700 shadow-lg transition-all flex items-center gap-2"
        }
      >
        <Menu className={isPopup ? "w-4 h-4" : "w-5 h-5"} />
      </button>
      {isSoundsOpen ? <SoundsPanel onClose={() => setIsSoundsOpen(false)} /> : null}
    </div>
  );
}
