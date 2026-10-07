"use client";

import { useState } from "react";
import {
  addDocListItemAction,
  moveDocListItemAction,
  removeDocListItemAction,
  restoreDocListItemAction,
  updateDocListItemAction,
} from "./document-list-actions";

export type DocListFormItem = {
  id: string;
  code: string;
  label: string;
  active: boolean;
  usage: number;
};

type Result = { ok: true; message?: string } | { error: string };

export function DocumentListForm({
  kind,
  items,
  showCode,
  lockedMessage,
}: {
  kind: string;
  items: DocListFormItem[];
  showCode: boolean;
  lockedMessage: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function act(fn: () => Promise<Result>) {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await fn();
    setPending(false);
    if ("error" in result) setError(result.error);
    else setNotice(result.message ?? "Saved.");
  }

  function remove(item: DocListFormItem) {
    const name = showCode ? `${item.code} (${item.label})` : item.label;
    const question =
      item.usage > 0
        ? `${name} is used by ${item.usage} document${item.usage === 1 ? "" : "s"}, so it will be retired, not deleted. It will be hidden from pickers and filters but still shown on those documents. Continue?`
        : `Delete ${name}? No document uses it. This can't be undone.`;
    if (window.confirm(question)) void act(() => removeDocListItemAction(item.id));
  }

  const active = items.filter((i) => i.active);
  const retired = items.filter((i) => !i.active);

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
        {active.map((item, i) => {
          const locked = showCode && item.usage > 0;
          return (
            <li key={`${item.id}:${item.code}:${item.label}`} className="p-2">
              <form
                action={(fd) => act(() => updateDocListItemAction(fd))}
                className="flex flex-wrap items-center gap-2"
              >
                <input type="hidden" name="id" value={item.id} />
                {showCode &&
                  (locked ? (
                    <span
                      title={lockedMessage}
                      className="w-24 rounded-md bg-slate-100 px-2 py-1.5 font-mono text-sm text-slate-600"
                    >
                      🔒 {item.code}
                    </span>
                  ) : (
                    <input
                      name="code"
                      defaultValue={item.code}
                      maxLength={10}
                      aria-label="Code"
                      className="w-24 rounded-md border border-slate-300 px-2 py-1.5 font-mono text-sm uppercase"
                    />
                  ))}
                <input
                  name="label"
                  defaultValue={item.label}
                  maxLength={200}
                  aria-label="Label"
                  className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
                <span className="w-20 text-xs text-slate-500">
                  {item.usage > 0 ? `${item.usage} doc${item.usage === 1 ? "" : "s"}` : "Unused"}
                </span>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  disabled={pending || i === 0}
                  onClick={() => void act(() => moveDocListItemAction(item.id, "up"))}
                  aria-label="Move up"
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={pending || i === active.length - 1}
                  onClick={() => void act(() => moveDocListItemAction(item.id, "down"))}
                  aria-label="Move down"
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(item)}
                  className="rounded-md border border-red-200 px-2 py-1 text-sm text-red-700 disabled:opacity-50"
                >
                  {item.usage > 0 ? "Retire" : "Delete"}
                </button>
              </form>
            </li>
          );
        })}
      </ul>

      {retired.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Retired</p>
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-slate-50">
            {retired.map((item) => (
              <li key={item.id} className="flex items-center gap-2 p-2 text-sm text-slate-500">
                {showCode && <span className="w-24 font-mono">{item.code}</span>}
                <span className="flex-1">{item.label}</span>
                <span className="w-20 text-xs">
                  {item.usage} doc{item.usage === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void act(() => restoreDocListItemAction(item.id))}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form
        action={(fd) => act(() => addDocListItemAction(fd))}
        className="flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="kind" value={kind} />
        {showCode && (
          <input
            name="code"
            required
            maxLength={10}
            placeholder="CODE"
            aria-label="New code"
            className="w-24 rounded-md border border-slate-300 px-2 py-1.5 font-mono text-sm uppercase"
          />
        )}
        <input
          name="label"
          required
          maxLength={200}
          placeholder="Label"
          aria-label="New label"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-700 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}
    </div>
  );
}
