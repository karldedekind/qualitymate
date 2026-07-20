import type { ReactNode } from "react";
import { SummaryActions } from "./summary-actions";

const TONES = {
  default: {
    card: "border-slate-200",
    summary: "",
    title: "text-slate-500 group-hover:text-slate-700",
    badge: "bg-slate-100 text-slate-500",
    chevron: "text-slate-400",
    divider: "border-slate-100",
  },
  accent: {
    card: "border-blue-200",
    summary: "bg-blue-50/70",
    title: "text-blue-800 group-hover:text-blue-900",
    badge: "bg-blue-100 text-blue-700",
    chevron: "text-blue-400",
    divider: "border-blue-100",
  },
} as const;

/** Collapsed-by-default section card with a chevron summary heading. */
export function CollapsibleSection({
  title,
  badge,
  defaultOpen,
  tone = "default",
  actions,
  collapsible = true,
  children,
}: {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  tone?: keyof typeof TONES;
  actions?: ReactNode;
  collapsible?: boolean;
  children: ReactNode;
}) {
  const t = TONES[tone];
  if (!collapsible) {
    return (
      <section className={`rounded-lg border bg-white shadow-sm ${t.card}`}>
        <div className={`flex items-center gap-2 rounded-t-lg px-4 py-3 ${t.summary}`}>
          <span className={`text-sm font-semibold uppercase tracking-wide ${t.title}`}>
            {title}
          </span>
          {badge && (
            <span className={`rounded-full px-2 py-0.5 text-xs ${t.badge}`}>{badge}</span>
          )}
          {actions && <span className="ml-auto flex items-center gap-2">{actions}</span>}
        </div>
        <div className={`space-y-3 border-t p-4 ${t.divider}`}>{children}</div>
      </section>
    );
  }
  return (
    <details open={defaultOpen} className={`group rounded-lg border bg-white shadow-sm ${t.card}`}>
      <summary
        className={`flex cursor-pointer select-none list-none items-center gap-2 rounded-lg px-4 py-3 group-open:rounded-b-none [&::-webkit-details-marker]:hidden ${t.summary}`}
      >
        <span className={`text-sm font-semibold uppercase tracking-wide ${t.title}`}>
          {title}
        </span>
        {badge && (
          <span className={`rounded-full px-2 py-0.5 text-xs ${t.badge}`}>{badge}</span>
        )}
        <span className="ml-auto flex items-center gap-3">
          {actions && <SummaryActions>{actions}</SummaryActions>}
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className={`h-4 w-4 transition-transform duration-200 group-open:rotate-180 ${t.chevron}`}
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </summary>
      <div className={`space-y-3 border-t p-4 ${t.divider}`}>{children}</div>
    </details>
  );
}
