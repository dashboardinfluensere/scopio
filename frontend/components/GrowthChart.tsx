"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Metric = "views" | "likes" | "publishing" | "engagement";
type Mode = "total" | "average";

type GrowthAccountPoint = {
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
};

type GrowthPoint = {
  date: string;
  totalViews: number;
  averageViewsPerPost: number;
  totalLikes: number;
  averageLikesPerPost: number;
  totalPostCount: number;
  averagePostsPerDay: number;
  totalEngagementRate: number;
  averageEngagementRate: number;
  accounts: GrowthAccountPoint[];
};

type GrowthChartProps = {
  data: GrowthPoint[];
  metric: Metric;
  mode: Mode;
  metricLabel: string;
  selectedAccountIds: string[];
};

const CHART_COLORS = {
  combined: "#38BDF8",
  trend: "#E5E7EB",
  tiktok: "#7C3AED",
  instagram: "#FF6A3D",
  fallback: "#94A3B8",
  disabled: "#64748B",
};

const chartTheme = {
  accentBadgeBg: "rgba(56, 189, 248, 0.14)",
  surface: "var(--color-surface, #FFFFFF)",
  surfaceSoft: "var(--color-surface-soft, #F8FAFC)",
  border: "var(--color-border, #E5E7EB)",
  text: "var(--color-text, #0F172A)",
  muted: "var(--color-muted, #6B7280)",
  shadow: "0 10px 24px rgba(15, 23, 42, 0.18)",
};

function getPlatformColor(platform?: string | null) {
  const normalized = platform?.toLowerCase();

  if (normalized === "tiktok") return CHART_COLORS.tiktok;
  if (normalized === "instagram") return CHART_COLORS.instagram;

  return CHART_COLORS.fallback;
}

function formatXAxisDate(value: string) {
  const date = new Date(value);

  return date.toLocaleDateString("no-NO", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatTooltipDate(value: string) {
  const date = new Date(value);

  return date.toLocaleDateString("no-NO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatNumber(value: number) {
  return value.toLocaleString("no-NO", {
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number) {
  return `${value.toLocaleString("no-NO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatYAxis(value: number, metric: Metric) {
  if (metric === "engagement") {
    return `${Number(value).toFixed(0)}%`;
  }

  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1).replace(".", ",")} mill.`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(0).replace(".", ",")}k`;
  }

  return value.toLocaleString("no-NO", {
    maximumFractionDigits: 1,
  });
}

function getMetricKey(metric: Metric, mode: Mode) {
  if (metric === "views") {
    return mode === "total" ? "totalViews" : "averageViewsPerPost";
  }

  if (metric === "likes") {
    return mode === "total" ? "totalLikes" : "averageLikesPerPost";
  }

  if (metric === "publishing") {
    return mode === "total" ? "totalPostCount" : "averagePostsPerDay";
  }

  return mode === "total" ? "totalEngagementRate" : "averageEngagementRate";
}

function calculateTrendValues(values: number[]) {
  const n = values.length;

  if (n === 0) return [];
  if (n === 1) return values;

  const xMean = (n - 1) / 2;
  const yMean = values.reduce((sum, value) => sum + value, 0) / n;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i += 1) {
    const xDiff = i - xMean;
    const yDiff = values[i] - yMean;

    numerator += xDiff * yDiff;
    denominator += xDiff * xDiff;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;

  return values.map((_, index) => intercept + slope * index);
}

function buildChartData(
  data: GrowthPoint[],
  metric: Metric,
  mode: Mode,
  includeCombinedLine: boolean
) {
  const metricKey = getMetricKey(metric, mode);
  const totalValues = data.map((point) => Number(point[metricKey] ?? 0));
  const trendValues = calculateTrendValues(totalValues);

  return data.map((point, index) => {
    const mappedPoint: Record<string, string | number> = {
      date: point.date,
      trend: Number(trendValues[index] ?? 0),
    };

    if (includeCombinedLine) {
      mappedPoint.total = totalValues[index];
    }

    point.accounts.forEach((account) => {
      mappedPoint[`account_${account.accountId}`] = Number(
        account[metricKey] ?? 0
      );
      mappedPoint[`label_${account.accountId}`] =
        account.displayName?.trim() || account.accountHandle;
    });

    return mappedPoint;
  });
}

function getVisibleAccounts(data: GrowthPoint[], selectedAccountIds: string[]) {
  const seen = new Map<
    string,
    {
      accountId: string;
      label: string;
      platform: string;
    }
  >();

  for (const point of data) {
    for (const account of point.accounts) {
      if (!selectedAccountIds.includes(account.accountId)) continue;

      if (!seen.has(account.accountId)) {
        seen.set(account.accountId, {
          accountId: account.accountId,
          label: account.displayName?.trim() || account.accountHandle,
          platform: account.platform,
        });
      }
    }
  }

  return Array.from(seen.values());
}

function LegendButton({
  label,
  color,
  disabled,
  onClick,
  strong = false,
}: {
  label: string;
  color: string;
  disabled: boolean;
  onClick: () => void;
  strong?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs transition",
        strong ? "font-semibold" : "font-medium",
      ].join(" ")}
      style={{
        backgroundColor: disabled ? "rgba(100, 116, 139, 0.14)" : chartTheme.surfaceSoft,
        color: disabled ? CHART_COLORS.disabled : chartTheme.muted,
        opacity: disabled ? 0.65 : 1,
      }}
      title={disabled ? `Vis ${label}` : `Skjul ${label}`}
      aria-pressed={!disabled}
    >
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{
          backgroundColor: disabled ? CHART_COLORS.disabled : color,
        }}
      />
      {label}
    </button>
  );
}

export default function GrowthChart({
  data,
  metric,
  mode,
  metricLabel,
  selectedAccountIds,
}: GrowthChartProps) {
  const [hiddenLines, setHiddenLines] = useState<Record<string, boolean>>({});

  const visibleAccounts = getVisibleAccounts(data, selectedAccountIds);
  const hasMultipleAccounts = visibleAccounts.length >= 2;
  const chartData = buildChartData(data, metric, mode, hasMultipleAccounts);
  const isPercentMetric = metric === "engagement";

  function toggleLine(lineKey: string) {
    setHiddenLines((current) => ({
      ...current,
      [lineKey]: !current[lineKey],
    }));
  }

  function isHidden(lineKey: string) {
    return Boolean(hiddenLines[lineKey]);
  }

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center gap-2 md:mb-5">
        {hasMultipleAccounts ? (
          <LegendButton
            label="Samlet"
            color={CHART_COLORS.combined}
            disabled={isHidden("total")}
            onClick={() => toggleLine("total")}
            strong
          />
        ) : null}

        <LegendButton
          label="Trend"
          color={CHART_COLORS.trend}
          disabled={isHidden("trend")}
          onClick={() => toggleLine("trend")}
        />

        {visibleAccounts.map((account) => {
          const lineKey = `account_${account.accountId}`;

          return (
            <LegendButton
              key={account.accountId}
              label={account.label}
              color={getPlatformColor(account.platform)}
              disabled={isHidden(lineKey)}
              onClick={() => toggleLine(lineKey)}
            />
          );
        })}
      </div>

      <div className="h-[300px] w-full sm:h-[340px] md:h-[380px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke={chartTheme.border} vertical={false} />

            <XAxis
              dataKey="date"
              tickFormatter={formatXAxisDate}
              stroke={chartTheme.border}
              tick={{ fill: chartTheme.muted, fontSize: 12 }}
              axisLine={{ stroke: chartTheme.border }}
              tickLine={{ stroke: chartTheme.border }}
              minTickGap={20}
            />

            <YAxis
              stroke={chartTheme.border}
              tick={{ fill: chartTheme.muted, fontSize: 12 }}
              tickFormatter={(value) => formatYAxis(Number(value), metric)}
              width={60}
              axisLine={{ stroke: chartTheme.border }}
              tickLine={{ stroke: chartTheme.border }}
            />

            <Tooltip
              contentStyle={{
                backgroundColor: chartTheme.surface,
                border: `1px solid ${chartTheme.border}`,
                borderRadius: "12px",
                color: chartTheme.text,
                boxShadow: chartTheme.shadow,
              }}
              labelStyle={{ color: chartTheme.text, fontWeight: 600 }}
              labelFormatter={(label) => formatTooltipDate(String(label))}
              formatter={(value, name, item) => {
                const payload = item?.payload ?? {};
                const numericValue = Number(value);
                const formattedValue = isPercentMetric
                  ? formatPercent(numericValue)
                  : formatNumber(numericValue);

                if (typeof name === "string" && name === "total") {
                  return [formattedValue, `Samlet ${metricLabel.toLowerCase()}`];
                }

                if (typeof name === "string" && name === "trend") {
                  return [formattedValue, `Trend ${metricLabel.toLowerCase()}`];
                }

                if (typeof name === "string" && name.startsWith("account_")) {
                  const accountId = name.replace("account_", "");
                  const label = payload[`label_${accountId}`] || "Konto";
                  return [formattedValue, label];
                }

                return [formattedValue, metricLabel];
              }}
            />

            {hasMultipleAccounts && !isHidden("total") ? (
              <Line
                type="monotone"
                dataKey="total"
                name="total"
                stroke={CHART_COLORS.combined}
                strokeWidth={3}
                dot={{
                  r: 2.5,
                  strokeWidth: 0,
                  fill: CHART_COLORS.combined,
                }}
                activeDot={{ r: 5 }}
              />
            ) : null}

            {!isHidden("trend") ? (
              <Line
                type="monotone"
                dataKey="trend"
                name="trend"
                stroke={CHART_COLORS.trend}
                strokeWidth={2}
                strokeDasharray="6 6"
                dot={false}
                activeDot={{ r: 4 }}
              />
            ) : null}

            {visibleAccounts.map((account) => {
              const lineKey = `account_${account.accountId}`;

              if (isHidden(lineKey)) {
                return null;
              }

              return (
                <Line
                  key={account.accountId}
                  type="monotone"
                  dataKey={lineKey}
                  name={lineKey}
                  stroke={getPlatformColor(account.platform)}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}