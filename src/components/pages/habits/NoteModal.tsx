"use client";

export interface NoteTarget {
  habitId: string;
  habitName: string;
  date: string;
  dateString: string;
}

interface NoteModalProps {
  target: NoteTarget;
  content: string;
  saving: boolean;
  hasExisting: boolean;
  onChange(content: string): void;
  onCancel(): void;
  onSave(): void;
  onDelete(): void;
}

export function NoteModal({ target, content, saving, hasExisting, onChange, onCancel, onSave, onDelete }: NoteModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl p-6 max-w-md w-full border border-gray-700 shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-2">{"Note for " + target.habitName}</h2>
        <p className="text-sm text-gray-400 mb-4">{target.date}</p>
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              onSave();
            }
          }}
          placeholder="Add a note about this day..."
          className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          rows={4}
          autoFocus
        />
        <div className="flex gap-3 mt-4">
          <button onClick={onCancel} className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors">
            Cancel
          </button>
          {hasExisting && (
            <button onClick={onDelete} className="px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors">
              Delete
            </button>
          )}
          <button
            onClick={onSave}
            disabled={!content.trim() || saving}
            className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
