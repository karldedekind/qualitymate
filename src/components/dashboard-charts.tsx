"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PALETTE = [
  "#1e40af",
  "#7c3aed",
  "#0891b2",
  "#16a34a",
  "#ca8a04",
  "#dc2626",
  "#475569",
];

export function CategoryDonut({
  data,
}: {
  data: { label: string; count: number }[];
}) {
  if (data.length === 0) return <Empty label="No incidents in window" />;
  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="label"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value, name) => [value, name]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-2">
        {data.map((d, i) => (
          <span key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: PALETTE[i % PALETTE.length] }}
            />
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function IncidentTrendLine({
  data,
}: {
  data: { month: string; count: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Line
          type="monotone"
          dataKey="count"
          stroke="#1e40af"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function TopJobsBar({
  data,
}: {
  data: { number: string; name: string; count: number }[];
}) {
  if (data.length === 0) return <Empty label="No jobs with incidents in window" />;
  const formatted = data.map((d) => ({
    label: `${d.number} · ${d.name}`,
    count: d.count,
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        data={formatted}
        layout="vertical"
        margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
        <YAxis dataKey="label" type="category" width={140} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="count" fill="#0891b2" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ActionsByStatusStacked({
  data,
}: {
  data: { status: "open" | "resolved"; count: number }[];
}) {
  // Single stacked column "Actions" so open and resolved share an x-tick.
  const open = data.find((d) => d.status === "open")?.count ?? 0;
  const resolved = data.find((d) => d.status === "resolved")?.count ?? 0;
  const rows = [{ bucket: "Actions", open, resolved }];
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        <Bar dataKey="open" stackId="a" fill="#dc2626" />
        <Bar dataKey="resolved" stackId="a" fill="#16a34a" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="h-[240px] flex items-center justify-center text-sm text-slate-500">
      {label}
    </div>
  );
}
