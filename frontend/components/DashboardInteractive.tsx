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

type LeaderPost = {
  id: string;
  caption: string;
  url: string;
  thumbnailUrl: string;
  platform: string | null;
  stats: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    engagementRate: number;
    bestPerformingScore?: number;
  };
};

type TopPostsMode = "top" | "worst";

type LeaderboardGroup = {
  bestPerforming: LeaderPost[];
  views: LeaderPost[];
  likes: LeaderPost[];
  comments: LeaderPost[];
};

type LeaderboardResponse = {
  ok: boolean;
  periodLabel: string;
  leaders: {
    top: LeaderboardGroup;
    worst: LeaderboardGroup;
  };
};

type DashboardInteractiveContextValue = {
  mode: Mode;
  setMode: (mode: Mode) => void;
  metric: Metric;
  setMetric: (metric: Metric) => void;
  summary: DashboardSummary;
  growth: GrowthDataPoint[];
  selectedAccountIds: string[];
  topPostsMode: TopPostsMode;
  setTopPostsMode: (mode: TopPostsMode) => void;
  topPostsRank: 1 | 2 | 3;
  setTopPostsRank: (rank: 1 | 2 | 3) => void;
  leaderboard: LeaderboardResponse;
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
function getPlatformLabel(platform: string | null) {
  if (!platform) return "Ukjent";

  const normalized = platform.toLowerCase();

  if (normalized === "tiktok") return "TikTok";
  if (normalized === "instagram") return "Instagram";

  return platform;
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

function InfoBadge({ label }: { label: string }) {
  return (
    <span
      className="inline-flex rounded-full px-3 py-1 text-[11px] font-semibold"
      style={{
        backgroundColor: "var(--color-accent-soft)",
        color: "var(--color-accent)",
      }}
    >
      {label}
    </span>
  );
}

function LeaderCard({
  title,
  post,
}: {
  title: string;
  post: LeaderPost | null;
}) {
  if (!post) {
    return (
      <div
        className="rounded-xl border p-4 md:p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <h4
          className="text-base font-semibold"
          style={{ color: "var(--color-text)" }}
        >
          {title}
        </h4>
        <p className="mt-3 text-sm" style={{ color: "var(--color-muted)" }}>
          Ingen innlegg funnet.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border p-4 shadow-sm md:p-5"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <h4
        className="text-base font-semibold"
        style={{ color: "var(--color-text)" }}
      >
        {title}
      </h4>

      <div className="mt-4 flex flex-col gap-4 sm:grid sm:grid-cols-[84px_minmax(0,1fr)] sm:gap-4">
        <div className="flex items-start gap-3 sm:contents">
          <a href={post.url} target="_blank" rel="noreferrer" className="block shrink-0">
            {post.thumbnailUrl ? (
              <img
                src={post.thumbnailUrl}
                alt=""
                className="h-[96px] w-[72px] rounded-lg object-cover sm:h-[128px] sm:w-full"
              />
            ) : (
              <div
                className="flex h-[96px] w-[72px] flex-col items-center justify-center rounded-lg border px-2 text-center sm:h-[128px] sm:w-full"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-surface-muted)",
                  color: "var(--color-muted)",
                }}
              >
                <span className="text-[10px] font-semibold">
                  {getPlatformLabel(post.platform)}
                </span>
                <span className="mt-1 text-[10px] leading-3">
                  Ingen forhåndsvisning
                </span>
              </div>
            )}
          </a>

          <div className="min-w-0 sm:block">
            <InfoBadge label={getPlatformLabel(post.platform)} />

            <p
              className="mt-3 line-clamp-4 text-sm leading-5 sm:line-clamp-5"
              style={{ color: "var(--color-text)" }}
            >
              {post.caption || "Ingen caption tilgjengelig."}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        <span style={{ color: "var(--color-muted)" }}>Views</span>
        <span className="font-semibold" style={{ color: "var(--color-text)" }}>
          {formatNumber(post.stats.views)}
        </span>

        <span style={{ color: "var(--color-muted)" }}>Likes</span>
        <span className="font-semibold" style={{ color: "var(--color-text)" }}>
          {formatNumber(post.stats.likes)}
        </span>

        <span style={{ color: "var(--color-muted)" }}>Kommentarer</span>
        <span className="font-semibold" style={{ color: "var(--color-text)" }}>
          {formatNumber(post.stats.comments)}
        </span>

        <span style={{ color: "var(--color-muted)" }}>Delinger</span>
        <span className="font-semibold" style={{ color: "var(--color-text)" }}>
          {formatNumber(post.stats.shares)}
        </span>

        <span style={{ color: "var(--color-muted)" }}>Engasjement</span>
        <span className="font-semibold" style={{ color: "var(--color-text)" }}>
          {formatPercent(post.stats.engagementRate)}
        </span>
      </div>
    </div>
  );
}

export default function DashboardInteractive({
  initialMode,
  initialMetric,
  initialTopPostsMode,
  initialTopPostsRank,
  summary,
  growth,
  selectedAccountIds,
  leaderboard,
  children,
}: {
  initialMode: Mode;
  initialMetric: Metric;
  initialTopPostsMode: TopPostsMode;
  initialTopPostsRank: 1 | 2 | 3;
  summary: DashboardSummary;
  growth: GrowthDataPoint[];
  selectedAccountIds: string[];
  leaderboard: LeaderboardResponse;
  children: ReactNode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [metric, setMetric] = useState<Metric>(initialMetric);
  const [topPostsMode, setTopPostsMode] =
    useState<TopPostsMode>(initialTopPostsMode);
  const [topPostsRank, setTopPostsRank] =
    useState<1 | 2 | 3>(initialTopPostsRank);

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
        topPostsMode,
        setTopPostsMode,
        topPostsRank,
        setTopPostsRank,
        leaderboard,
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


export function DashboardTopPosts() {
  const {
    topPostsMode,
    setTopPostsMode,
    topPostsRank,
    setTopPostsRank,
    leaderboard,
  } = useDashboardInteractive();

  const selectedLeaderboard = leaderboard.leaders[topPostsMode];
  const selectedTopPostsIndex = topPostsRank - 1;
  const nextTopPostsRank = topPostsRank === 3 ? 1 : ((topPostsRank + 1) as 1 | 2 | 3);

  function toggleTopPostsMode() {
    setTopPostsMode(topPostsMode === "top" ? "worst" : "top");
    setTopPostsRank(1);
  }

  return (
    <aside
      className="relative z-[1] rounded-xl border p-4 shadow-sm xl:row-span-2"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface-soft)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={toggleTopPostsMode}
            className="group inline-flex appearance-none items-center gap-2 border-none bg-transparent p-0 text-lg font-semibold tracking-tight shadow-none outline-none transition hover:opacity-80 focus:outline-none"
            style={{
              color: "var(--color-text)",
              background: "transparent",
              border: 0,
              boxShadow: "none",
            }}
            aria-label={
              topPostsMode === "top"
                ? "Bytt til Worst Posts"
                : "Bytt til Top Posts"
            }
          >
            {topPostsMode === "top" ? "Top Posts" : "Worst Posts"}
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-transparent text-[11px] transition group-hover:translate-x-0.5"
              style={{
                color: "var(--color-muted)",
              }}
              aria-hidden="true"
            >
              ↔
            </span>
          </button>

          <p
            className="mt-2 text-sm leading-6"
            style={{ color: "var(--color-muted)" }}
          >
            {topPostsMode === "top"
              ? "Her ser du innleggene som har prestert best de siste 30 dagene."
              : "Her ser du innleggene som har prestert svakest de siste 30 dagene."}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => setTopPostsRank(nextTopPostsRank)}
            className="group inline-flex appearance-none items-center gap-1.5 border-none bg-transparent p-0 text-sm font-semibold shadow-none outline-none transition hover:opacity-80 focus:outline-none"
            style={{
              color: "var(--color-text)",
              background: "transparent",
              border: 0,
              boxShadow: "none",
            }}
            aria-label={`Bytt til #${nextTopPostsRank}`}
          >
            #{topPostsRank}
            <span
              className="text-xs transition group-hover:translate-x-0.5"
              style={{ color: "var(--color-muted)" }}
              aria-hidden="true"
            >
              →
            </span>
          </button>

          <span
            className="text-xs font-medium"
            style={{ color: "var(--color-muted)" }}
          >
            Siste 30 dager
          </span>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <LeaderCard
          title={topPostsMode === "top" ? "Best totalt" : "Svakest totalt"}
          post={selectedLeaderboard.bestPerforming[selectedTopPostsIndex] ?? null}
        />

        <LeaderCard
          title={topPostsMode === "top" ? "Flest views" : "Færrest views"}
          post={selectedLeaderboard.views[selectedTopPostsIndex] ?? null}
        />

        <LeaderCard
          title={topPostsMode === "top" ? "Flest likes" : "Færrest likes"}
          post={selectedLeaderboard.likes[selectedTopPostsIndex] ?? null}
        />

        <LeaderCard
          title={
            topPostsMode === "top" ? "Flest kommentarer" : "Færrest kommentarer"
          }
          post={selectedLeaderboard.comments[selectedTopPostsIndex] ?? null}
        />
      </div>
    </aside>
  );
}
