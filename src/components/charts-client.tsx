"use client";

import { moneyWhole, signedMoney } from "@/lib/format";
import type { GroupPoint, MonthPoint } from "@/lib/metrics";
import { ProfitByMonthChart, RankedBars } from "./dashboard-charts";

// Functions cannot cross the server/client boundary, so formatters are chosen here.
export function DashboardCharts({ months, brands, platforms }: { months: MonthPoint[]; brands: GroupPoint[]; platforms: GroupPoint[] }) {
  const totalRevenue = platforms.reduce((sum, p) => sum + p.revenue, 0);
  return (
    <div className="grid gap-10 md:grid-cols-2">
      <section className="md:col-span-2">
        <h2 className="eyebrow mb-3 border-b pb-2">Profit per month, net of expenses · last 12 months</h2>
        <ProfitByMonthChart data={months} />
      </section>
      <section>
        <h2 className="eyebrow mb-3 border-b pb-2">Top brands by profit</h2>
        <RankedBars data={brands} dataKey="profit" format={signedMoney} />
      </section>
      <section>
        <h2 className="eyebrow mb-3 border-b pb-2">Platform split by revenue</h2>
        <RankedBars
          data={[...platforms].sort((a, b) => b.revenue - a.revenue)}
          dataKey="revenue"
          format={(v) => `${moneyWhole(v)} · ${totalRevenue > 0 ? Math.round((v / totalRevenue) * 100) : 0}%`}
        />
      </section>
    </div>
  );
}
