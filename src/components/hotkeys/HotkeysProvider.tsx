"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  comboFromEvent,
  defaultBindings,
  hasCommandModifier,
  HOTKEY_ACTIONS,
  loadBindings,
  saveBindings,
  type Bindings,
} from "./bindings";
import { ShortcutsPanel } from "./ShortcutsPanel";

type Handler = () => void;

interface HotkeysContextValue {
  readonly bindings: Bindings;
  register(actionId: string, handler: { current: Handler }): () => void;
  rebind(actionId: string, combo: string | null): void;
  resetAll(): void;
  setCapturing(isCapturing: boolean): void;
  openPanel(): void;
}

const HotkeysContext = createContext<HotkeysContextValue | null>(null);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function HotkeysProvider({ children }: { children: ReactNode }) {
  const [bindings, setBindings] = useState<Bindings>(loadBindings);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  // Several mounted components may claim one action; the most recently mounted wins.
  const handlers = useRef(new Map<string, { current: Handler }[]>());
  const isCapturing = useRef(false);

  const register = useCallback((actionId: string, handler: { current: Handler }) => {
    const stack = handlers.current.get(actionId) ?? [];
    handlers.current.set(actionId, [...stack, handler]);
    return () => {
      const remaining = (handlers.current.get(actionId) ?? []).filter((entry) => entry !== handler);
      handlers.current.set(actionId, remaining);
    };
  }, []);

  const rebind = useCallback((actionId: string, combo: string | null) => {
    setBindings((current) => {
      // A combo can drive only one action, so the previous owner is unbound.
      const freed = Object.fromEntries(
        Object.entries(current).map(([id, existing]) => [id, combo && existing === combo ? null : existing]),
      );
      const next = { ...freed, [actionId]: combo };
      saveBindings(next);
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    const defaults = defaultBindings();
    saveBindings(defaults);
    setBindings(defaults);
  }, []);

  const setCapturing = useCallback((value: boolean) => {
    isCapturing.current = value;
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isCapturing.current || event.isComposing) return;
      const combo = comboFromEvent(event);
      if (!combo) return;
      if (!hasCommandModifier(combo) && isEditableTarget(event.target)) return;
      const actionId = Object.keys(bindings).find((id) => bindings[id] === combo);
      if (!actionId) return;
      if (actionId === "app.shortcuts") {
        event.preventDefault();
        setIsPanelOpen((open) => !open);
        return;
      }
      const stack = handlers.current.get(actionId);
      const handler = stack?.[stack.length - 1];
      if (!handler) return;
      event.preventDefault();
      handler.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bindings]);

  const openPanel = useCallback(() => setIsPanelOpen(true), []);

  const value = useMemo(
    () => ({ bindings, register, rebind, resetAll, setCapturing, openPanel }),
    [bindings, register, rebind, resetAll, setCapturing, openPanel],
  );

  return (
    <HotkeysContext.Provider value={value}>
      {children}
      {isPanelOpen ? <ShortcutsPanel actions={HOTKEY_ACTIONS} onClose={() => setIsPanelOpen(false)} /> : null}
    </HotkeysContext.Provider>
  );
}

export function useHotkeys(): HotkeysContextValue {
  const context = useContext(HotkeysContext);
  if (!context) throw new Error("useHotkeys must be used inside <HotkeysProvider>");
  return context;
}

/** Runs `handler` when the action's bound combo is pressed, while `enabled` and mounted. */
export function useHotkey(actionId: string, handler: Handler, enabled = true): void {
  const { register } = useHotkeys();
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  useEffect(() => (enabled ? register(actionId, handlerRef) : undefined), [actionId, enabled, register]);
}

/** `useHotkey` for a fixed set of actions; the set of ids must not change between renders. */
export function useHotkeyMap(handlersById: Readonly<Record<string, Handler>>): void {
  const { register } = useHotkeys();
  const latest = useRef(handlersById);
  useEffect(() => {
    latest.current = handlersById;
  });
  const ids = Object.keys(handlersById).join(",");
  useEffect(() => {
    const unregister = ids
      .split(",")
      .map((id) => register(id, { current: () => latest.current[id]?.() }));
    return () => unregister.forEach((dispose) => dispose());
  }, [ids, register]);
}

/** Bound combo for an action, for hints such as `title` tooltips. */
export function useHotkeyLabel(actionId: string): string | null {
  return useHotkeys().bindings[actionId] ?? null;
}
