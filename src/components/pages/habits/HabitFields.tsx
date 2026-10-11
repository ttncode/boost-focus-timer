"use client";

import { COLORS } from "./habit-model";

export const FIELD_INPUT =
  "w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500";
export const PRIMARY_BUTTON =
  "flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors";
export const SECONDARY_BUTTON = "px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors";

const LABEL = "block text-sm font-medium text-gray-300 mb-2";

export function FieldLabel({ children }: { children: string }) {
  return <label className={LABEL}>{children}</label>;
}

export function ColorPicker({ value, onChange }: { value: string; onChange(color: string): void }) {
  return (
    <div>
      <FieldLabel>Color</FieldLabel>
      <div className="flex gap-2">
        {COLORS.map((color) => (
          <button
            key={color.value}
            onClick={() => onChange(color.value)}
            className={"w-10 h-10 rounded-lg " + color.bg + " " + (value === color.value ? "ring-2 ring-white ring-offset-2 ring-offset-gray-900" : "") + " transition-all"}
          />
        ))}
      </div>
    </div>
  );
}
