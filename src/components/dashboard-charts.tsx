"use client";

import { Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money, moneyWhole, signedMoney } from "@/lib/format";
import type { GroupPoint, MonthPoint } from "@/lib/metrics";

const INK = "var(--foreground)";
const LOSS = "#6b665c"; // Losses also sit below the zero line, so this is never color alone.
const AXIS = "#9a9488";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1];

function TooltipBox({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="num border border-foreground bg-background px-2 py-1 text-xs">
      <p className="text-muted-foreground">{title}</p>
      {lines.map((line) => <p key={line}>{line}</p>)}
    </div>
  );
}

export function ProfitByMonthChart({ data }: { data: MonthPoint[] }) {
  return (
    <div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 10, fill: AXIS, fontFamily: "var(--font-geist-mono)" }} />
            <YAxis width={44} tickFormatter={moneyWhole} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: AXIS, fontFamily: "var(--font-geist-mono)" }} />
            <ReferenceLine y={0} stroke={INK} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.06)" }}
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as MonthPoint | undefined;
                return active && point ? <TooltipBox title={point.month} lines={[signedMoney(point.profit)]} /> : null;
              }}
            />
            <Bar dataKey="profit" isAnimationActive={false} maxBarSize={28}>
              {data.map((d) => <Cell key={d.month} fill={d.profit < 0 ? LOSS : INK} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground">Show as table</summary>
        <table className="num mt-2 w-full text-xs">
          <tbody>
            {data.map((d) => (
              <tr key={d.month} className="border-b">
                <td className="py-1">{d.month}</td>
                <td className="py-1 text-right">{signedMoney(d.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** Ranked horizontal bars. Every bar is directly labeled, so values read without hovering. */
export function RankedBars({ data, dataKey, format }: { data: GroupPoint[]; dataKey: "profit" | "revenue"; format: (v: number) => string }) {
  if (data.length === 0) return <p className="py-6 text-sm text-muted-foreground">No sales in this period.</p>;
  const height = data.length * 36 + 8;
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 96, left: 0, bottom: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide domain={[(min: number) => Math.min(0, min), "auto"]} />
          <YAxis type="category" dataKey="name" width={104} tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 12, fill: INK }} tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} />
          <ReferenceLine x={0} stroke={INK} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.06)" }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as GroupPoint | undefined;
              return active && p ? (
                <TooltipBox title={p.name} lines={[`${p.count} sold`, `Revenue ${money(p.revenue)}`, `Profit ${signedMoney(p.profit)}`]} />
              ) : null;
            }}
          />
          <Bar dataKey={dataKey} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.name} fill={d[dataKey] < 0 ? LOSS : INK} />)}
            <LabelList
              dataKey={dataKey}
              content={(props) => {
                // Always to the right of zero, so a loss bar's label can't collide with the brand name.
                const x = Number(props.x);
                const width = Number(props.width);
                return (
                  <text x={Math.max(x, x + width) + 6} y={Number(props.y) + Number(props.height) / 2} dominantBaseline="central" fontSize={11} fill={INK} fontFamily="var(--font-geist-mono)">
                    {format(Number(props.value))}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
