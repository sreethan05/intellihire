import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import {
  Area,
  AreaChart,
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

type Tone = "blue" | "violet" | "green" | "amber" | "rose" | "cyan";

const toneClasses: Record<Tone, { box: string; text: string; badge: string }> = {
  blue: { box: "bg-blue-50 text-blue-600", text: "text-blue-600", badge: "bg-blue-50 text-blue-700" },
  violet: { box: "bg-violet-50 text-violet-600", text: "text-violet-600", badge: "bg-violet-50 text-violet-700" },
  green: { box: "bg-emerald-50 text-emerald-600", text: "text-emerald-600", badge: "bg-emerald-50 text-emerald-700" },
  amber: { box: "bg-amber-50 text-amber-600", text: "text-amber-600", badge: "bg-amber-50 text-amber-700" },
  rose: { box: "bg-rose-50 text-rose-600", text: "text-rose-600", badge: "bg-rose-50 text-rose-700" },
  cyan: { box: "bg-cyan-50 text-cyan-600", text: "text-cyan-600", badge: "bg-cyan-50 text-cyan-700" },
};

export function MetricCard({
  title,
  value,
  icon: Icon,
  tone = "blue",
  trend,
}: {
  title: string;
  value: string | number;
  icon: LucideIcon;
  tone?: Tone;
  trend?: string;
}) {
  const classes = toneClasses[tone];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-lg ${classes.box}`}>
          <Icon className="h-7 w-7" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <div className="mt-1 text-2xl font-bold leading-none text-slate-950">{value}</div>
          {trend && <p className="mt-2 text-xs font-semibold text-emerald-600">{trend}</p>}
        </div>
      </div>
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-950">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function DashboardSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold text-slate-950">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function ViewAllLink({ to }: { to: string }) {
  return (
    <Link to={to} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
      View All
    </Link>
  );
}

export function FeatureGrid({
  items,
}: {
  items: Array<{ label: string; caption: string; icon: LucideIcon; to: string; tone?: Tone }>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        const classes = toneClasses[item.tone || "blue"];
        return (
          <Link
            key={item.to}
            to={item.to}
            className="group flex min-h-24 items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
          >
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${classes.box}`}>
              <Icon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-extrabold text-slate-900">{item.label}</div>
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.caption}</div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
          </Link>
        );
      })}
    </div>
  );
}

export function CompactList({
  items,
}: {
  items: Array<{
    title: string;
    subtitle: string;
    icon: LucideIcon;
    tone?: Tone;
    meta?: string;
  }>;
}) {
  return (
    <div className="divide-y divide-slate-100">
      {items.map((item) => {
        const Icon = item.icon;
        const classes = toneClasses[item.tone || "blue"];
        return (
          <div key={`${item.title}-${item.subtitle}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${classes.box}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-slate-800">{item.title}</div>
              <div className="mt-0.5 truncate text-xs text-slate-500">{item.subtitle}</div>
            </div>
            {item.meta && <div className={`rounded-md px-2.5 py-1 text-xs font-bold ${classes.badge}`}>{item.meta}</div>}
          </div>
        );
      })}
    </div>
  );
}

export function QuickLinks({
  items,
}: {
  items: Array<{ label: string; caption: string; icon: LucideIcon; to: string; tone?: Tone }>;
}) {
  return (
    <div className="divide-y divide-slate-100">
      {items.map((item) => {
        const Icon = item.icon;
        const classes = toneClasses[item.tone || "blue"];
        return (
          <Link key={item.to} to={item.to} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${classes.box}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-slate-800">{item.label}</div>
              <div className="mt-0.5 text-xs text-slate-500">{item.caption}</div>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </Link>
        );
      })}
    </div>
  );
}

export function DashboardLineChart({
  data,
  lines,
  area = false,
}: {
  data: Array<Record<string, number | string | undefined>>;
  lines: Array<{ key: string; name: string; color: string }>;
  area?: boolean;
}) {
  if (area) {
    return (
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: -20, right: 10, top: 5, bottom: 0 }}>
            <defs>
              <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={lines[0].color} stopOpacity={0.28} />
                <stop offset="95%" stopColor={lines[0].color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#eef2f7" vertical={false} />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
            <Area type="monotone" dataKey={lines[0].key} stroke={lines[0].color} strokeWidth={3} fill="url(#scoreFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: -20, right: 10, top: 5, bottom: 0 }}>
          <CartesianGrid stroke="#eef2f7" vertical={false} />
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
          <Legend iconType="circle" />
          {lines.map((line) => (
            <Line key={line.key} type="monotone" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={3} dot={{ r: 4 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutSummary({
  total,
  items,
}: {
  total: string | number;
  items: Array<{ name: string; value: number; color: string }>;
}) {
  return (
    <div className="grid items-center gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
      <div className="relative h-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={items} dataKey="value" innerRadius={48} outerRadius={72} paddingAngle={1}>
              {items.map((item) => (
                <Cell key={item.name} fill={item.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-bold text-slate-950">{total}</div>
          <div className="text-xs font-medium text-slate-500">Total</div>
        </div>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2 text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
              {item.name}
            </div>
            <div className="font-bold text-slate-900">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardBarChart({
  data,
  bars,
  xKey = "label",
}: {
  data: Array<Record<string, number | string | undefined>>;
  bars: Array<{ key: string; name: string; color: string }>;
  xKey?: string;
}) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -20, right: 10, top: 5, bottom: 0 }}>
          <CartesianGrid stroke="#eef2f7" vertical={false} />
          <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
          <Legend iconType="circle" />
          {bars.map((bar) => (
            <Bar key={bar.key} dataKey={bar.key} name={bar.name} fill={bar.color} radius={[6, 6, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProgressRows({
  items,
}: {
  items: Array<{ label: string; value: number; total?: number; meta?: string; color?: string }>;
}) {
  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <div className="text-sm text-slate-500">No analytics data yet.</div>
      ) : (
        items.map((item) => {
          const total = item.total && item.total > 0 ? item.total : Math.max(1, item.value);
          const width = Math.min(100, (item.value / total) * 100);
          return (
            <div key={item.label}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-semibold text-slate-700">{item.label}</span>
                <span className="shrink-0 font-bold text-slate-950">{item.meta || item.value}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full" style={{ width: `${width}%`, background: item.color || "#2563eb" }} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm">
        <Icon className="h-6 w-6" />
      </div>
      <div className="mt-4 text-sm font-bold text-slate-900">{title}</div>
      <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function AnalyticsTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<Array<string | number>>;
}) {
  if (rows.length === 0) {
    return <div className="text-sm text-slate-500">No rows to show yet.</div>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-4 py-3 font-bold">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={`${row.join("-")}-${index}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${cell}-${cellIndex}`} className="px-4 py-3 text-slate-700">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
