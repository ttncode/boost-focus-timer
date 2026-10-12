export interface HotkeyAction {
  readonly id: string;
  readonly group: string;
  readonly label: string;
  readonly defaultCombo: string | null;
}

/*
 * Defaults avoid combos browsers reserve and do not let pages cancel reliably,
 * e.g. Alt+D (address bar) and Alt+E/Alt+F (Chrome menu on Windows).
 */
export const HOTKEY_ACTIONS: readonly HotkeyAction[] = [
  { id: "nav.timer", group: "Navigate", label: "Focus", defaultCombo: "Alt+1" },
  { id: "nav.todos", group: "Navigate", label: "To-Dos", defaultCombo: "Alt+2" },
  { id: "nav.habits", group: "Navigate", label: "Habits", defaultCombo: "Alt+3" },
  { id: "nav.goals", group: "Navigate", label: "Goals", defaultCombo: "Alt+4" },
  { id: "nav.boost", group: "Navigate", label: "Boost", defaultCombo: "Alt+5" },
  { id: "nav.history", group: "Navigate", label: "Focus summary", defaultCombo: "Alt+H" },
  { id: "nav.aboutme", group: "Navigate", label: "About Me", defaultCombo: "Alt+P" },
  { id: "nav.tags", group: "Navigate", label: "Tags", defaultCombo: "Alt+T" },
  { id: "nav.menu", group: "Navigate", label: "Open / close menu", defaultCombo: "Alt+M" },

  { id: "timer.toggle", group: "Focus timer", label: "Start / pause / resume", defaultCombo: "Alt+S" },
  { id: "timer.switch", group: "Focus timer", label: "Switch focus / break", defaultCombo: "Alt+B" },
  { id: "timer.end", group: "Focus timer", label: "End or complete session", defaultCombo: "Alt+X" },
  { id: "timer.goal", group: "Focus timer", label: "Edit focus goal", defaultCombo: "Alt+G" },
  { id: "timer.animation", group: "Focus timer", label: "Choose animation", defaultCombo: "Alt+A" },
  { id: "timer.addTag", group: "Focus timer", label: "Add tag", defaultCombo: "Alt+Shift+T" },

  { id: "list.new", group: "Lists", label: "New item on current page", defaultCombo: "Alt+N" },
  { id: "boost.post", group: "Lists", label: "Post to Boost", defaultCombo: "Ctrl+Enter" },
  { id: "boost.attach", group: "Lists", label: "Attach media to post", defaultCombo: "Alt+U" },

  { id: "app.displayName", group: "App", label: "Edit display name", defaultCombo: "Alt+Shift+N" },
  { id: "app.fullPage", group: "App", label: "Open full page (extension popup)", defaultCombo: "Alt+Enter" },
  { id: "app.shortcuts", group: "App", label: "Show or hide this list", defaultCombo: "Ctrl+/" },
];

export type Bindings = Readonly<Record<string, string | null>>;

const STORAGE_KEY = "bft:hotkeys";

export function defaultBindings(): Bindings {
  return Object.fromEntries(HOTKEY_ACTIONS.map((action) => [action.id, action.defaultCombo]));
}

/** Saved overrides on top of the defaults, so actions added later still get their default. */
export function loadBindings(): Bindings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, string | null>;
    const known = Object.entries(saved).filter(([id]) => HOTKEY_ACTIONS.some((action) => action.id === id));
    return { ...defaultBindings(), ...Object.fromEntries(known) };
  } catch (error) {
    console.error("Unreadable hotkey settings, using defaults:", error);
    return defaultBindings();
  }
}

export function saveBindings(bindings: Bindings): void {
  const defaults = defaultBindings();
  const overrides = Object.fromEntries(Object.entries(bindings).filter(([id, combo]) => defaults[id] !== combo));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

const NAMED_CODES: Readonly<Record<string, string>> = {
  Slash: "/",
  Backslash: "\\",
  Comma: ",",
  Period: ".",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
  Enter: "Enter",
  NumpadEnter: "Enter",
  Space: "Space",
  Tab: "Tab",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
};

const MODIFIER_CODES = /^(Control|Shift|Alt|Meta|OS)(Left|Right)?$/;

/**
 * Canonical "Ctrl+Alt+Shift+Meta+Key" string, built from the physical key (`code`)
 * so Option/AltGr-modified characters on macOS and other layouts still match.
 * Returns null for a bare modifier press.
 */
export function comboFromEvent(event: KeyboardEvent): string | null {
  if (MODIFIER_CODES.test(event.code)) return null;
  const key =
    /^Key([A-Z])$/.exec(event.code)?.[1] ??
    /^(?:Digit|Numpad)(\d)$/.exec(event.code)?.[1] ??
    /^F\d{1,2}$/.exec(event.code)?.[0] ??
    NAMED_CODES[event.code] ??
    (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  const modifiers = [
    event.ctrlKey && "Ctrl",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
    event.metaKey && "Meta",
  ].filter(Boolean);
  return [...modifiers, key].join("+");
}

export function hasCommandModifier(combo: string): boolean {
  return /(^|\+)(Ctrl|Alt|Meta)\+/.test(combo);
}
