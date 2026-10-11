"use client";

import { useEffect, useState } from "react";
import { disableNotifications, enableNotifications, notificationStatus, NOTIFICATIONS_ENABLED_EVENT } from "../focus/notifications";
import { Bell, Check, X } from "../icons";

type Stage = "hidden" | "ask" | "sent";

const PANEL =
  "fixed top-14 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md flex items-start gap-3 px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl motion-safe:animate-[bft-sheet-in_200ms_ease-out]";
const CLOSE_BUTTON = "shrink-0 p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors";

/**
 * Asks on first open (browsers only show their permission dialog after a click) and,
 * once notifications are turned on, confirms that a sample was sent and what to check if it never arrived.
 */
export function NotificationPrompt() {
  const [stage, setStage] = useState<Stage>(() => (notificationStatus() === "undecided" ? "ask" : "hidden"));

  useEffect(() => {
    const showConfirmation = () => setStage("sent");
    window.addEventListener(NOTIFICATIONS_ENABLED_EVENT, showConfirmation);
    return () => window.removeEventListener(NOTIFICATIONS_ENABLED_EVENT, showConfirmation);
  }, []);

  if (stage === "hidden") return null;

  if (stage === "sent") {
    return (
      <div role="status" className={PANEL}>
        <Check className="w-5 h-5 mt-0.5 shrink-0 text-green-400" />
        <p className="flex-1 text-sm text-gray-300">
          Notifications are on, and a sample was just sent. Didn&apos;t see it? Allow notifications for your browser in your
          system settings and turn off Do Not Disturb or Focus mode.
        </p>
        <button onClick={() => setStage("hidden")} aria-label="Close" title="Close" className={CLOSE_BUTTON}>
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const allow = async () => {
    const status = await enableNotifications();
    if (status !== "on" && status !== "undecided") setStage("hidden");
  };

  const notNow = () => {
    disableNotifications();
    setStage("hidden");
  };

  return (
    <div role="dialog" aria-label="Enable notifications" className={`${PANEL} items-center`}>
      <Bell className="w-5 h-5 shrink-0 text-blue-400" />
      <p className="flex-1 text-sm text-gray-300">Get a notification when a focus session or break ends?</p>
      <button
        onClick={() => void allow()}
        className="shrink-0 px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
      >
        Turn on
      </button>
      <button onClick={notNow} aria-label="Not now" title="Not now" className={CLOSE_BUTTON}>
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
