import { useSyncExternalStore } from "react";

export const MOBILE_QUERY = "(max-width: 819px)";
export const SHORT_VIEWPORT_QUERY = "(max-height: 1120px)";
/** Extra bottom offset on mobile so floating controls clear the bottom nav. */
export const MOBILE_NAV_OFFSET = "4.75rem";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
