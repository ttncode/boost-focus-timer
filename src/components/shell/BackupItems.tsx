"use client";

import { useRef, type ChangeEvent } from "react";
import { useDialog } from "../dialogs/DialogProvider";
import { Download, Upload } from "../icons";
import { backupFileName, createBackup, parseBackup, restoreBackup } from "../lib/backup";
import { clearRunningTimer, saveBackupFile } from "../lib/extension";

const IMPORT_TITLE = "Import data";
const EXPORT_TITLE = "Export data";

export function BackupItems({ className }: { readonly className: string }) {
  const dialog = useDialog();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportData = async () => {
    try {
      const now = new Date();
      const isSaved = await saveBackupFile(backupFileName(now), createBackup(localStorage, now));
      if (isSaved) await dialog.alert("Your data was exported.", { title: EXPORT_TITLE });
    } catch (error) {
      console.error("Export failed:", error);
      await dialog.alert("Couldn't save the backup file.", { title: EXPORT_TITLE });
    }
  };

  const importFile = async (file: File) => {
    try {
      const entries = parseBackup(await file.text());
      if (!entries) {
        await dialog.alert("This file is not a Boost Focus Timer backup.", { title: IMPORT_TITLE });
        return;
      }
      const message = "This replaces all data in this app, and stops any running session. It can't be undone.";
      if (!(await dialog.confirm(message, { title: IMPORT_TITLE, confirmLabel: "Replace my data", destructive: true }))) return;
      restoreBackup(localStorage, entries);
      clearRunningTimer();
      window.location.reload();
    } catch (error) {
      console.error("Import failed:", error);
      await dialog.alert("Couldn't import this file. Your data was not changed.", { title: IMPORT_TITLE });
    }
  };

  const onFileChosen = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void importFile(file);
  };

  return (
    <>
      <button onClick={() => void exportData()} className={className}>
        <Download className="w-4 h-4" />
        <span>Export data</span>
      </button>
      <button onClick={() => fileInputRef.current?.click()} className={className}>
        <Upload className="w-4 h-4" />
        <span>Import data</span>
      </button>
      <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={onFileChosen} hidden />
    </>
  );
}
