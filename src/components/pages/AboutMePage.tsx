"use client";

import { useEffect, useState } from "react";
import { Save } from "../icons";
import { localDb, type Row } from "../lib/local-db";

type AboutMeRow = Row & {
  user_id: string;
  name: string | null;
  bio: string | null;
  location: string | null;
};

interface Profile {
  name: string;
  bio: string;
  location: string;
}

const EMPTY: Profile = { name: "", bio: "", location: "" };

const fieldClass =
  "w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500";

export function AboutMePage({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rowId, setRowId] = useState<string | null>(null);
  const [form, setForm] = useState<Profile>(EMPTY);
  const [saved, setSaved] = useState<Profile>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    localDb
      .from<AboutMeRow>("about_me")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("Error loading about me:", error);
        if (data) {
          const profile = { name: data.name ?? "", bio: data.bio ?? "", location: data.location ?? "" };
          setRowId(data.id);
          setForm(profile);
          setSaved(profile);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const dirty = form.name !== saved.name || form.bio !== saved.bio || form.location !== saved.location;

  const save = async () => {
    setSaving(true);
    const values = {
      name: form.name.trim() || null,
      bio: form.bio.trim() || null,
      location: form.location.trim() || null,
    };
    const { data, error } = rowId
      ? await localDb
          .from<AboutMeRow>("about_me")
          .update({ ...values, updated_at: new Date().toISOString() })
          .eq("id", rowId)
          .select()
      : await localDb.from<AboutMeRow>("about_me").insert({ user_id: userId, ...values }).select();
    if (error) {
      console.error("Error saving about me:", error);
    } else {
      if (!rowId && data?.[0]) setRowId(data[0].id);
      setSaved(form);
    }
    setSaving(false);
  };

  // Cmd/Ctrl+Enter saves from anywhere on the page.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && dirty && !saving) {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  const set = (key: keyof Profile) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-3xl font-bold text-white">About Me</h2>
      </div>

      <div className="flex-1 overflow-y-auto mb-6">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-gray-300 text-sm font-medium block">Name</label>
            <input type="text" value={form.name} onChange={set("name")} className={fieldClass} placeholder="Your name" />
          </div>

          <div className="space-y-2">
            <label className="text-gray-300 text-sm font-medium block">Bio</label>
            <textarea
              value={form.bio}
              onChange={set("bio")}
              className={`${fieldClass} resize-none`}
              placeholder="Tell us about yourself..."
              rows={6}
            />
          </div>

          <div className="space-y-2">
            <label className="text-gray-300 text-sm font-medium block">Location</label>
            <input
              type="text"
              value={form.location}
              onChange={set("location")}
              className={fieldClass}
              placeholder="City, Country"
            />
          </div>
        </div>
      </div>

      {dirty && (
        <div className="pt-4 border-t border-gray-800">
          <button
            onClick={() => void save()}
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl transition-colors flex items-center justify-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-5 h-5" />
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
