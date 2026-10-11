const DISPLAY_NAME_KEY = "bft:displayName";

export function getDisplayName(): string {
  return window.localStorage.getItem(DISPLAY_NAME_KEY) ?? "";
}

export function saveDisplayName(name: string): void {
  window.localStorage.setItem(DISPLAY_NAME_KEY, name);
}
