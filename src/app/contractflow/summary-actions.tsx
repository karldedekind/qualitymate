"use client";

import type { ReactNode } from "react";

/** Stops clicks on header-bar actions from toggling the parent <details>. */
export function SummaryActions({ children }: { children: ReactNode }) {
  return (
    <span
      className="flex items-center gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </span>
  );
}
