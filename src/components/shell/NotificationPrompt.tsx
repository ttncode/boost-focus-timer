"use client";

import { useState } from "react";
import { dismissNotificationOffer, requestNotificationPermission, shouldOfferNotifications } from "../focus/notifications";
import { Bell, X } from "../icons";

/** First-visit banner: the browser only shows its permission dialog after a click, so this provides the click. */
export function NotificationPrompt() {
  const [isVisible, setIsVisible] = useState(shouldOfferNotifications);

  if (!isVisible) return null;

  const allow = async () => {
    const permission = await requestNotificationPermission();
    // Closing the browser dialog leaves the permission at "default"; keep offering in that case.
    if (permission !== "default") setIsVisible(false);
  };

  const notNow = () => {
    dismissNotificationOffer();
    setIsVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Enable notifications"
      className="fixed top-14 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md flex items-center gap-3 px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl motion-safe:animate-[bft-sheet-in_200ms_ease-out]"
    >
      <Bell className="w-5 h-5 shrink-0 text-blue-400" />
      <p className="flex-1 text-sm text-gray-300">Get a notification when a focus session or break ends.</p>
      <button
        onClick={() => void allow()}
        className="shrink-0 px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
      >
        Allow
      </button>
      <button
        onClick={notNow}
        aria-label="Not now"
        title="Not now"
        className="shrink-0 p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
