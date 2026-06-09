"use client";

import { ReactNode, createContext, useContext, useState } from "react";
import GrowthChart from "./GrowthChart";

type Mode = "total" | "average";
type Metric = "views" | "likes" | "publishing" | "engagement";

type ComparisonStat = {
  changePercent: number;
};

type DashboardSummary = {
  totalViews: number;
  averageViewsPerPost: number;
  totalLikes: number;
  averageLikesPerPost: number;
  totalPostCount: number;
  averagePostsPerDay: number;
  totalEngagementRate: number;
  averageEngagementRate: number;
  comparison?: {
    views?: ComparisonStat;
    likes?: ComparisonStat;
    posts?: ComparisonStat;
    engagement?: ComparisonStat;
  };
};

type GrowthDataPoint = {
  date: string;
  totalViews: number;
  averageViewsPerPost: number;
  totalLikes: number;
  averageLikesPerPost: number;
  totalPostCount: number;
  averagePostsPerDay: number;
  totalEngagementRate: number;
  averageEngagementRate: number;
  accounts: Array<{
    accountId: string;
    accountHandle: string;
    displayName: string | null;
    platform: string;
    totalViews: number;
    averageViewsPerPost: number;
    totalLikes: number;
    averageLikesPerPost: number;
    totalPostCount: number;
    averagePostsPerDay: number;
    totalEngagementRate: number;
    averageEngagementRate: number;
  }>;
};

type DashboardInteractiveContextValue = {
  mode: Mode;
  setMode: (mode: Mode) => void;
  metric: Metric;
  setMetric: (metric: Metric) => void;
  summary: DashboardSummary;
  growth: GrowthDataPoint[];
  selectedAccountIds: string[];
};

const DashboardInteractiveContext =
  createContext<DashboardInteractiveContextValue | null>(null);

function useDashboardInteractive() {
  const value = useContext(DashboardInteractiveContext);

  if (!value) {
    throw new Error(
      "DashboardInteractive-komponenter må brukes inni <DashboardInteractive>."
    );
  }

  return value;
}

function formatNumber(value: number) {
  return value.toLocaleString("no-NO");
}

function formatPercent(value: number) {
  return `${value.toLocaleString("no-NO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatComparisonPercent(value: number) {
  const rounded = Number(value.toFixed(1));
  const sign = rounded > 0 ? "+" : "";

  return `${sign}${rounded.toLocaleString("no-NO")} % siste periode`;
}

function getMetricLabel(metric: Metric) {
  if (metric === "views") return "Views";
  if (metric === "likes") return "Likes";
  if (metric === "publishing") return "Publiseringer";
  return "Engasjement";
}

function ModeButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 min-w-[118px] shrink-0 items-center justify-center rounded-xl px-4 text-sm font-semibold transition"
      style={
        active
          ? {
              backgroundColor: "var(--color-accent)",
              color: "#ffffff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
            }
          : {
              backgroundColor: "transparent",
              color: "var(--color-muted)",
            }
      }
    >
      {label}
    </button>
  );
}

function MetricCard({
  label,
  value,
  comparisonText,
  comparisonPositive,
  active,
  onClick,
}: {
  label: string;
  value: string;
  comparisonText?: string;
  comparisonPositive?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-xl border p-4 text-left transition md:p-6"
      style={
        active
          ? {
              borderColor: "var(--color-accent)",
              backgroundColor: "var(--color-accent-soft)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.14)",
            }
          : {
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface)",
            }
      }
    >
      <div
        className="text-sm font-medium"
        style={{ color: "var(--color-muted)" }}
      >
        {label}
      </div>

      <div
        className="mt-3 text-[1.75rem] font-bold leading-none md:text-[2rem]"
        style={{ color: "var(--color-text)" }}
      >
        {value}
      </div>

      {comparisonText ? (
        <div
          className="mt-2 text-sm font-medium"
          style={{
            color: comparisonPositive ? "#22c55e" : "#ef4444",
          }}
        >
          {comparisonText}
        </div>
      ) : null}
    </button>
  );
}

export default function DashboardInteractive({
  initialMode,
  initialMetric,
  summary,
  growth,
  selectedAccountIds,
  children,
}: {
  initialMode: Mode;
  initialMetric: Metric;
  summary: DashboardSummary;
  growth: GrowthDataPoint[];
  selectedAccountIds: string[];
  children: ReactNode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [metric, setMetric] = useState<Metric>(initialMetric);

  return (
    <DashboardInteractiveContext.Provider
      value={{
        mode,
        setMode,
        metric,
        setMetric,
        summary,
        growth,
        selectedAccountIds,
      }}
    >
      {children}
    </DashboardInteractiveContext.Provider>
  );
}

export function DashboardModeSwitch() {
  const { mode, setMode } = useDashboardInteractive();

  return (
    <div
      className="w-full rounded-xl border p-1 sm:w-auto"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface-soft)",
      }}
    >
      <div className="flex items-center gap-1 overflow-x-auto">
        <ModeButton
          label="Totalt"
          active={mode === "total"}
          onClick={() => setMode("total")}
        />
        <ModeButton
          label="Gjennomsnitt"
          active={mode === "average"}
          onClick={() => setMode("average")}
        />
      </div>
    </div>
  );
}

export function DashboardMetrics() {
  const { mode, metric, setMetric, summary } = useDashboardInteractive();

  const summaryValues = {
    views:
      mode === "total"
        ? formatNumber(summary.totalViews)
        : formatNumber(summary.averageViewsPerPost),
    likes:
      mode === "total"
        ? formatNumber(summary.totalLikes)
        : formatNumber(summary.averageLikesPerPost),
    publishing:
      mode === "total"
        ? formatNumber(summary.totalPostCount)
        : formatNumber(summary.averagePostsPerDay),
    engagement:
      mode === "total"
        ? formatPercent(summary.totalEngagementRate)
        : formatPercent(summary.averageEngagementRate),
  };

  const comparisonValues = {
    views: summary.comparison?.views,
    likes: summary.comparison?.likes,
    posts: summary.comparison?.posts,
    engagement: summary.comparison?.engagement,
  };

  return (
    <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <MetricCard
        label="Views"
        value={summaryValues.views}
        comparisonText={
          comparisonValues.views
            ? formatComparisonPercent(comparisonValues.views.changePercent)
            : undefined
        }
        comparisonPositive={
          comparisonValues.views
            ? comparisonValues.views.changePercent >= 0
            : undefined
        }
        active={metric === "views"}
        onClick={() => setMetric("views")}
      />

      <MetricCard
        label="Likes"
        value={summaryValues.likes}
        comparisonText={
          comparisonValues.likes
            ? formatComparisonPercent(comparisonValues.likes.changePercent)
            : undefined
        }
        comparisonPositive={
          comparisonValues.likes
            ? comparisonValues.likes.changePercent >= 0
            : undefined
        }
        active={metric === "likes"}
        onClick={() => setMetric("likes")}
      />

      <MetricCard
        label="Publiseringer"
        value={summaryValues.publishing}
        comparisonText={
          comparisonValues.posts
            ? formatComparisonPercent(comparisonValues.posts.changePercent)
            : undefined
        }
        comparisonPositive={
          comparisonValues.posts
            ? comparisonValues.posts.changePercent >= 0
            : undefined
        }
        active={metric === "publishing"}
        onClick={() => setMetric("publishing")}
      />

      <MetricCard
        label="Engasjement"
        value={summaryValues.engagement}
        comparisonText={
          comparisonValues.engagement
            ? formatComparisonPercent(comparisonValues.engagement.changePercent)
            : undefined
        }
        comparisonPositive={
          comparisonValues.engagement
            ? comparisonValues.engagement.changePercent >= 0
            : undefined
        }
        active={metric === "engagement"}
        onClick={() => setMetric("engagement")}
      />
    </section>
  );
}

export function DashboardChartFrame() {
  const { mode, metric, growth, selectedAccountIds } = useDashboardInteractive();

  return (
    <div
      className="rounded-xl border p-4 shadow-sm md:p-6"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <GrowthChart
        data={growth}
        metric={metric}
        mode={mode}
        metricLabel={getMetricLabel(metric)}
        selectedAccountIds={selectedAccountIds}
      />
    </div>
  );
}
