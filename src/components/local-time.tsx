"use client";

import { useEffect, useState } from "react";

export function LocalTime({ iso, fmt = "time" }: { iso: string; fmt?: "time" | "datetime" }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const d = new Date(iso);
    setText(
      fmt === "datetime"
        ? d.toLocaleString([], { dateStyle: "short", timeStyle: "short", hour12: false })
        : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
    );
  }, [iso, fmt]);
  return <span>{text || "—"}</span>;
}
