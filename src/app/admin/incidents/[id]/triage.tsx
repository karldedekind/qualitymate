"use client";

import { useState } from "react";
import {
  applyTriageAction,
  suggestIncidentAction,
} from "../../../incidents/actions";

export type CategoryOption = { id: string; code: string; label: string };

type Suggestion = {
  rootCause: string;
  priority: string;
  category: string;
};

type Props = {
  id: string;
  aiAvailable: boolean;
  current: {
    priority: string | null;
    rootCause: string | null;
    categoryId: string | null;
  };
  categories: CategoryOption[];
};

const PRIORITY_OPTIONS = ["low", "medium", "high", "critical"];

function categoryBucket(code: string): number {
  const c = code.trim().toUpperCase();
  if (c.startsWith("Q")) return 0;
  if (c.startsWith("E")) return 1;
  return 2;
}

function categoryNumber(code: string): number {
  const m = /(\d+)/.exec(code);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

function sortCategories(list: CategoryOption[]): CategoryOption[] {
  return [...list].sort((a, b) => {
    const ba = categoryBucket(a.code);
    const bb = categoryBucket(b.code);
    if (ba !== bb) return ba - bb;
    const na = categoryNumber(a.code);
    const nb = categoryNumber(b.code);
    if (na !== nb) return na - nb;
    return a.code.localeCompare(b.code);
  });
}

export function TriagePanel({ id, aiAvailable, current, categories }: Props) {
  const [priority, setPriority] = useState<string>(current.priority ?? "");
  const [rootCause, setRootCause] = useState<string>(current.rootCause ?? "");
  const [categoryId, setCategoryId] = useState<string>(current.categoryId ?? "");
  const [savePending, setSavePending] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestedCategoryId, setSuggestedCategoryId] = useState<string>("");

  function bestMatchCategoryId(semanticCategory: string): string {
    const kw = semanticCategory.toLowerCase();
    const match = categories.find(
      (c) => c.label.toLowerCase().includes(kw) || c.code.toLowerCase().includes(kw),
    );
    return match?.id ?? "";
  }

  async function onSuggest() {
    setSuggesting(true);
    setSuggestError(null);
    setSuggestion(null);
    const fd = new FormData();
    fd.append("id", id);
    const result = await suggestIncidentAction(fd);
    setSuggesting(false);
    if (result?.error) {
      setSuggestError(result.error);
    } else if (result?.ok && result.suggestion) {
      setSuggestion(result.suggestion);
      setSuggestedCategoryId(bestMatchCategoryId(result.suggestion.category));
    }
  }

  function applyAll() {
    if (!suggestion) return;
    setPriority(suggestion.priority);
    setRootCause(suggestion.rootCause);
    if (suggestedCategoryId) setCategoryId(suggestedCategoryId);
  }

  async function onSave(source: "manual" | "ai") {
    setSavePending(true);
    setSaveError(null);
    setSaveOk(false);
    const fd = new FormData();
    fd.append("id", id);
    if (priority) fd.append("priority", priority);
    fd.append("rootCause", rootCause);
    if (categoryId) fd.append("categoryId", categoryId);
    fd.append("source", source);
    if (suggestion) fd.append("suggestedCategory", suggestion.category);
    const result = await applyTriageAction(fd);
    setSavePending(false);
    if (result?.error) setSaveError(result.error);
    else setSaveOk(true);
  }

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-base font-medium">Triage</h2>
        {aiAvailable && (
          <button
            type="button"
            onClick={onSuggest}
            disabled={suggesting}
            className="rounded-md bg-purple-700 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {suggesting ? "Asking AI…" : "Suggest with AI"}
          </button>
        )}
      </header>

      {suggestError && (
        <p className="text-sm text-red-600">AI suggestion failed: {suggestError}</p>
      )}

      {suggestion && (
        <div className="rounded-md border border-purple-200 bg-purple-50 p-3 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-purple-800 font-medium">AI suggestion</span>
            <button
              type="button"
              onClick={() => setSuggestion(null)}
              className="text-xs text-purple-700 hover:underline"
            >
              Dismiss
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-600 mb-1">Priority</div>
              <span className="font-mono">{suggestion.priority}</span>
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">Category</div>
              <select
                value={suggestedCategoryId}
                onChange={(e) => setSuggestedCategoryId(e.target.value)}
                className="w-full rounded border border-purple-300 bg-white px-2 py-1 text-xs"
              >
                <option value="">— leave unchanged —</option>
                {sortCategories(categories).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.label}
                  </option>
                ))}
              </select>
              <div className="text-xs text-slate-500 mt-0.5">
                AI type: <span className="font-mono">{suggestion.category}</span>
              </div>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-600 mb-1">Root cause</div>
            <p className="whitespace-pre-wrap">{suggestion.rootCause}</p>
          </div>
          <button
            type="button"
            onClick={applyAll}
            className="rounded-md bg-purple-700 text-white px-3 py-1.5 text-xs font-medium hover:bg-purple-800"
          >
            Apply all fields
          </button>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm text-slate-700 mb-1 block">Priority</span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm text-slate-700 mb-1 block">Category</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {sortCategories(categories).map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-sm text-slate-700 mb-1 block">Root cause</span>
        <textarea
          rows={3}
          maxLength={2000}
          value={rootCause}
          onChange={(e) => setRootCause(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      {saveError && <p className="text-sm text-red-600">{saveError}</p>}
      {saveOk && <p className="text-sm text-green-700">Saved.</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onSave(suggestion ? "ai" : "manual")}
          disabled={savePending}
          className="rounded-md bg-blue-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {savePending ? "Saving…" : "Save triage"}
        </button>
      </div>
    </section>
  );
}
