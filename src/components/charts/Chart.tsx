/**
 * Chart building blocks (Recharts) following one visual system: thin marks, rounded
 * data-ends, recessive grid, tooltips on hover, fixed categorical order, text in text
 * tokens. Every chart shows an empty state instead of inventing data.
 */
import * as React from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, Cell, Legend } from "recharts";
import { BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, EmptyState } from "@/components/ui/misc";
import { fmtNumber } from "@/lib/format";

export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--chart-${i + 1})`);
const AXIS = { stroke: "rgb(var(--fg-subtle))", fontSize: 11, tickLine: false, axisLine: false } as const;

function TooltipBox({ active, payload, label, format }: { active?: boolean; payload?: { name?: string; value?: number; color?: string }[]; label?: string | number; format?: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-elev px-3 py-2 text-xs shadow-lg">
      {label !== undefined && <div className="mb-1 font-medium text-fg">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-muted">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name && <span>{p.name}</span>}
          <span className="ms-auto font-medium tabular-nums text-fg">{format ? format(Number(p.value)) : fmtNumber(Number(p.value), 1)}</span>
        </div>
      ))}
    </div>
  );
}

export function ChartCard({ title, icon, children, empty, emptyHint, height = 240, actions }: { title: string; icon?: React.ReactNode; children: React.ReactNode; empty: boolean; emptyHint?: string; height?: number | "auto"; actions?: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader title={title} icon={icon} actions={actions} />
      <div className="p-3" style={{ height: empty || height === "auto" ? undefined : height }}>
        {empty ? <EmptyState compact icon={<BarChart3 />} title={t("analytics.noData")} description={emptyHint ?? t("analytics.noDataHint")} /> : children}
      </div>
    </Card>
  );
}

/** Single-series vertical bars (e.g. per day / per month). One hue, no legend: the title names it. */
export function SimpleBars({ data, name, format, color = SERIES[0] }: { data: { key: string; value: number }[]; name: string; format?: (v: number) => string; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} stroke="rgb(var(--border))" strokeDasharray="0" />
        <XAxis dataKey="key" {...AXIS} minTickGap={16} reversed={document.dir === "rtl"} />
        <YAxis {...AXIS} allowDecimals={false} width={44} orientation={document.dir === "rtl" ? "right" : "left"} />
        <Tooltip cursor={{ fill: "rgb(var(--fg) / 0.05)" }} content={<TooltipBox format={format} />} />
        <Bar dataKey="value" name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars for categories (subjects, categories). Colored by the entity, not the rank. */
export function CategoryBars({ data, name, format }: { data: { label: string; value: number; color?: string | null }[]; name: string; format?: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }} barCategoryGap={4}>
        <CartesianGrid horizontal={false} stroke="rgb(var(--border))" />
        <XAxis type="number" {...AXIS} allowDecimals={false} reversed={document.dir === "rtl"} />
        <YAxis type="category" dataKey="label" {...AXIS} width={120} orientation={document.dir === "rtl" ? "right" : "left"} />
        <Tooltip cursor={{ fill: "rgb(var(--fg) / 0.05)" }} content={<TooltipBox format={format} />} />
        <Bar dataKey="value" name={name} radius={document.dir === "rtl" ? [4, 0, 0, 4] : [0, 4, 4, 0]} maxBarSize={18}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color ?? SERIES[0]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Two-series stacked horizontal bars (e.g. done vs open), with a legend. */
export function StackedPair({ data, a, b }: { data: { label: string; a: number; b: number }[]; a: string; b: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }} barCategoryGap={4}>
        <CartesianGrid horizontal={false} stroke="rgb(var(--border))" />
        <XAxis type="number" {...AXIS} allowDecimals={false} reversed={document.dir === "rtl"} />
        <YAxis type="category" dataKey="label" {...AXIS} width={120} orientation={document.dir === "rtl" ? "right" : "left"} />
        <Tooltip cursor={{ fill: "rgb(var(--fg) / 0.05)" }} content={<TooltipBox format={(v) => fmtNumber(v, 0)} />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "rgb(var(--fg-muted))" }} />
        <Bar dataKey="a" name={a} stackId="s" fill={SERIES[0]} stroke="rgb(var(--surface))" strokeWidth={2} maxBarSize={18} />
        <Bar dataKey="b" name={b} stackId="s" fill={SERIES[2]} stroke="rgb(var(--surface))" strokeWidth={2} maxBarSize={18} radius={document.dir === "rtl" ? [4, 0, 0, 4] : [0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Line for trends over time (e.g. GPA per semester). */
export function TrendLine({ data, series, format }: { data: Record<string, string | number | null>[]; series: { key: string; name: string }[]; format?: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
        <CartesianGrid vertical={false} stroke="rgb(var(--border))" />
        <XAxis dataKey="key" {...AXIS} reversed={document.dir === "rtl"} />
        <YAxis {...AXIS} width={44} orientation={document.dir === "rtl" ? "right" : "left"} />
        <Tooltip content={<TooltipBox format={format} />} cursor={{ stroke: "rgb(var(--fg-subtle))" }} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "rgb(var(--fg-muted))" }} />}
        {series.map((sr, i) => (
          <Line key={sr.key} type="monotone" dataKey={sr.key} name={sr.name} stroke={SERIES[i]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "rgb(var(--surface))" }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
