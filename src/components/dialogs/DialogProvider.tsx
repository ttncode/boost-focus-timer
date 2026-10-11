"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

interface DialogOptions {
  title?: string;
  confirmLabel?: string;
  /** Styles the confirm button red for irreversible actions such as deletes. */
  destructive?: boolean;
}

interface DialogApi {
  /** In-app replacement for `window.alert`; resolves when dismissed. */
  alert(message: string, options?: DialogOptions): Promise<void>;
  /** In-app replacement for `window.confirm`; resolves true on confirm, false on cancel. */
  confirm(message: string, options?: DialogOptions): Promise<boolean>;
}

interface OpenDialog extends DialogOptions {
  id: number;
  kind: "alert" | "confirm";
  message: string;
  resolve(confirmed: boolean): void;
}

const DialogContext = createContext<DialogApi | null>(null);

function Dialog({ dialog, onClose }: { dialog: OpenDialog; onClose(confirmed: boolean): void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const isConfirm = dialog.kind === "confirm";

  useEffect(() => {
    confirmRef.current?.focus();
    // Capture phase so Esc/Enter reach the dialog before page shortcuts and inputs behind it.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && event.key !== "Enter") return;
      event.preventDefault();
      event.stopPropagation();
      onClose(event.key === "Enter");
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const confirmColor = dialog.destructive ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700";

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4 motion-safe:animate-[bft-fade-in_150ms_ease-out]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose(false);
      }}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={dialog.title ? "app-dialog-title" : undefined}
        aria-describedby="app-dialog-message"
        className="bg-gray-800 rounded-2xl p-6 max-w-md w-full border border-gray-700 shadow-2xl motion-safe:animate-[bft-sheet-in_200ms_ease-out]"
      >
        {dialog.title ? (
          <h2 id="app-dialog-title" className="text-lg font-bold text-white mb-3">
            {dialog.title}
          </h2>
        ) : null}
        <p id="app-dialog-message" className="text-gray-300 mb-6 whitespace-pre-line">
          {dialog.message}
        </p>
        <div className="flex gap-3 justify-end">
          {isConfirm ? (
            <button
              onClick={() => onClose(false)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
          ) : null}
          <button
            ref={confirmRef}
            onClick={() => onClose(true)}
            className={`px-4 py-2 ${confirmColor} text-white rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400`}
          >
            {dialog.confirmLabel ?? (isConfirm ? "Confirm" : "OK")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DialogProvider({ children }: { children: ReactNode }) {
  // A queue, so a second dialog requested while one is open waits its turn instead of replacing it.
  const [queue, setQueue] = useState<OpenDialog[]>([]);
  const nextId = useRef(0);

  const open = useCallback((kind: OpenDialog["kind"], message: string, options?: DialogOptions) => {
    const id = nextId.current++;
    return new Promise<boolean>((resolve) => setQueue((current) => [...current, { ...options, id, kind, message, resolve }]));
  }, []);

  const api = useMemo<DialogApi>(
    () => ({
      alert: async (message, options) => {
        await open("alert", message, options);
      },
      confirm: (message, options) => open("confirm", message, options),
    }),
    [open],
  );

  const current = queue[0];
  const close = useCallback(
    (confirmed: boolean) => {
      current?.resolve(confirmed);
      setQueue((pending) => pending.filter((dialog) => dialog.id !== current?.id));
    },
    [current],
  );

  return (
    <DialogContext.Provider value={api}>
      {children}
      {current ? <Dialog key={current.id} dialog={current} onClose={close} /> : null}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogApi {
  const context = useContext(DialogContext);
  if (!context) throw new Error("useDialog must be used inside <DialogProvider>");
  return context;
}
