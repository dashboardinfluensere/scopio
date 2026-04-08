import InitialAccountOnboarding from "../../components/InitialAccountOnboarding";
import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import ConnectedAccounts from "../../components/ConnectedAccounts";
import GrowthChart from "../../components/GrowthChart";
import PublishingHeatmap from "../../components/PublishingHeatmap";
import UserMenuButton from "../../components/UserMenuButton";
import AppThemeShell from "../../components/AppThemeShell";
import { getServerApiUrl } from "../../lib/api";

type SearchParams = Promise<{
  mode?: string;
  metric?: string;
  period?: string;
  from?: string;
  to?: string;
  accountIds?: string | string[];
  heatmapAccountId?: string;
  tableSearch?: string;
  tableSortBy?: string;
  tableSortOrder?: string;
  tableView?: string;
}>;

type ViewerResponse = {
  ok: boolean;
  user: {
    id: string;
    email: string;
    name: string | null;
    authProvider: string | null;
    authProviderId: string | null;
    activeOrganizationId: string | null;
  };
  access?: {
    hasAccess?: boolean;
    requiresOnboarding?: boolean;
    requiresUpgrade?: boolean;
    upgradeReason?:
      | "trial_expired"
      | "missing_subscription"
      | "inactive_subscription"
      | null;
    requiresInitialAccountOnboarding?: boolean;
    isInitialScrapeRunning?: boolean;
  };
};

type SocialAccount = {
  id: string;
  platform: string;
  accountHandle: string;
  displayName: string | null;
  profileUrl: string | null;
  initialSyncStatus?: string;
  lastSyncedAt?: string | null;
  isActive?: boolean;
};

type SocialAccountsResponse = {
  ok: boolean;
  count: number;
  accounts: SocialAccount[];
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
  } | null;
  role: string | null;
  permissions: {
    canAddAccounts: boolean;
    canDeleteAccounts: boolean;
  };
  limits: {
    monthlyAccountAdds: number;
  };
  usage: {
    activeAccounts: number;
    accountsAddedThisPeriod: number;
    monthlyAddsRemaining: number;
    nextAvailableAddAt: string | null;
  };
  onboarding: {
    initialScrapeStartedAt: string | null;
    onboardingCompletedAt: string | null;
  };
};

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

type AccountSummaryResponse = {
  ok: boolean;
  summary: DashboardSummary;
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

type GrowthResponse = {
  ok: boolean;
  growth: GrowthDataPoint[];
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

type LeaderboardResponse = {
  ok: boolean;
  periodLabel: string;
  leaders: {
    bestPerforming: LeaderPost | null;
    views: LeaderPost | null;
    likes: LeaderPost | null;
    comments: LeaderPost | null;
  };
};

type PublishedContentPost = {
  id: string;
  url: string;
  thumbnailUrl: string;
  caption: string;
  publishedAt: string;
  platform: string | null;
  engagementRate: number;
  latestSnapshot: {
    views: number;
    likes: number;
    comments: number;
  };
};

type PublishedContentResponse = {
  ok: boolean;
  count: number;
  q: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  posts: PublishedContentPost[];
};

type HeatmapCell = {
  weekdayIndex: number;
  timeSlotIndex: number;
  averageViews: number;
  postCount: number;
  hasEnoughData: boolean;
};

type PublishingHeatmapResponse = {
  ok: boolean;
  account: {
    id: string;
    accountHandle: string;
    displayName: string | null;
    platform: string;
  };
  cells: HeatmapCell[];
};

type InsightItem = {
  id: string;
  title: string;
  value: string;
  description: string;
};

type InsightsResponse = {
  ok: boolean;
  insights: InsightItem[];
};

type Mode = "total" | "average";
type Metric = "views" | "likes" | "publishing" | "engagement";
type Period = "7" | "30" | "90" | "custom";

const API_URL = getServerApiUrl();

function getSingleValue(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function normalizeAccountIds(
  accountIds: string | string[] | undefined,
  fallbackIds: string[]
) {
  if (Array.isArray(accountIds)) {
    const filtered = accountIds.filter(Boolean);
    return filtered.length > 0 ? filtered : fallbackIds;
  }

  if (typeof accountIds === "string" && accountIds.trim() !== "") {
    return accountIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }

  return fallbackIds;
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

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("no-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("no-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getLatestSyncedAt(accounts: SocialAccount[], selectedIds: string[]) {
  const selectedSet = new Set(selectedIds);

  const validDates = accounts
    .filter((account) => selectedSet.has(account.id))
    .map((account) => account.lastSyncedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()));

  if (validDates.length === 0) {
    return null;
  }

  validDates.sort((a, b) => b.getTime() - a.getTime());

  return validDates[0].toISOString();
}

function getPlatformLabel(platform: string | null) {
  if (!platform) return "Ukjent";

  const normalized = platform.toLowerCase();

  if (normalized === "tiktok") return "TikTok";
  if (normalized === "instagram") return "Instagram";

  return platform;
}

function getFirstName(fullName: string | null | undefined) {
  if (!fullName) return "der";
  return fullName.trim().split(" ")[0] || "der";
}

function isValidMode(value: string): value is Mode {
  return value === "total" || value === "average";
}

function isValidMetric(value: string): value is Metric {
  return (
    value === "views" ||
    value === "likes" ||
    value === "publishing" ||
    value === "engagement"
  );
}

function isValidPeriod(value: string): value is Period {
  return value === "7" || value === "30" || value === "90" || value === "custom";
}

function formatDateInput(date: Date) {
  return date.toISOString().split("T")[0];
}

function getDefaultCustomRange() {
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(toDate.getDate() - 29);

  return {
    from: formatDateInput(fromDate),
    to: formatDateInput(toDate),
  };
}

async function getAuthHeaders() {
  const { getToken } = await auth();
  const token = await getToken();

  if (!token) {
    throw new Error("Mangler auth-token");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

async function getViewer() {
  const headers = await getAuthHeaders();

  const res = await fetch(`${API_URL}/me`, {
    cache: "no-store",
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("GET /me feilet:", res.status, text);
    throw new Error("Kunbe ikke hente brukerdata");
  }

  return res.json() as Promise<ViewerResponse>;
}

function resolveAccessRedirect(viewer: ViewerResponse) {
  if (viewer.access?.requiresOnboarding) {
    return "/onboarding";
  }

  if (viewer.access?.requiresUpgrade) {
    return "/plans";
  }

  if (!viewer.access?.hasAccess) {
    return "/onboarding";
  }

  return null;
}

async function getTrackedAccounts() {
  const headers = await getAuthHeaders();

  const res = await fetch(`${API_URL}/social-accounts`, {
    cache: "no-store",
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("GET /social-accounts feilet:", res.status, text);
    throw new Error("Kunne ikke hente kontoer");
  }

  return res.json() as Promise<SocialAccountsResponse>;
}

function appendAccountIds(params: URLSearchParams, accountIds: string[]) {
  accountIds.forEach((id) => {
    params.append("accountIds", id);
  });
}

async function getAccountSummary(paramsInput: {
  period: Period;
  from?: string;
  to?: string;
  accountIds: string[];
}) {
  const headers = await getAuthHeaders();

  const params = new URLSearchParams({
    period: paramsInput.period,
  });

  if (paramsInput.from) params.set("from", paramsInput.from);
  if (paramsInput.to) params.set("to", paramsInput.to);

  appendAccountIds(params, paramsInput.accountIds);

  const res = await fetch(
    `${API_URL}/analytics/account-summary?${params.toString()}`,
    {
      cache: "no-store",
      headers,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("GET /analytics/account-summary feilet:", res.status, text);
    throw new Error("Kunne ikke hente account summary");
  }

  return res.json() as Promise<AccountSummaryResponse>;
}

async function getGrowth(paramsInput: {
  period: Period;
  from?: string;
  to?: string;
  accountIds: string[];
}) {
  const headers = await getAuthHeaders();

  const params = new URLSearchParams({
    period: paramsInput.period,
  });

  if (paramsInput.from) params.set("from", paramsInput.from);
  if (paramsInput.to) params.set("to", paramsInput.to);

  appendAccountIds(params, paramsInput.accountIds);

  const res = await fetch(`${API_URL}/analytics/growth?${params.toString()}`, {
    cache: "no-store",
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("GET /analytics/growth feilet:", res.status, text);
    throw new Error("Kunne ikke hente growth");
  }

  return res.json() as Promise<GrowthResponse>;
}

async function getTopPostsLeaderboard(accountIds: string[]) {
  const headers = await getAuthHeaders();

  const params = new URLSearchParams();

  appendAccountIds(params, accountIds);

  const res = await fetch(
    `${API_URL}/analytics/top-posts-leaderboard?${params.toString()}`,
    {
      cache: "no-store",
      headers,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error(
      "GET /analytics/top-posts-leaderboard feilet:",
      res.status,
      text
    );
    throw new Error("Kunne ikke hente top posts leaderboard");
  }

  return res.json() as Promise<LeaderboardResponse>;
}

async function getPublishedContent(paramsInput: {
  accountIds: string[];
  tableSearch: string;
  tableSortBy: string;
  tableSortOrder: "asc" | "desc";
}) {
  const headers = await getAuthHeaders();

  const params = new URLSearchParams({
    sortBy: paramsInput.tableSortBy,
    sortOrder: paramsInput.tableSortOrder,
  });

  if (paramsInput.tableSearch.trim() !== "") {
    params.set("q", paramsInput.tableSearch.trim());
  }

  appendAccountIds(params, paramsInput.accountIds);

  const res = await fetch(
    `${API_URL}/analytics/published-content?${params.toString()}`,
    {
      cache: "no-store",
      headers,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("GET /analytics/published-content feilet:", res.status, text);
    throw new Error("Kunne ikke hente publisert innhold");
  }

  return res.json() as Promise<PublishedContentResponse>;
}

async function getPublishingHeatmap(accountId: string) {
  const headers = await getAuthHeaders();

  const params = new URLSearchParams({
    accountId,
  });

  const res = await fetch(
    `${API_URL}/analytics/publishing-heatmap?${params.toString()}`,
    {
      cache: "no-store",
      headers,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error(
      "GET /analytics/publishing-heatmap feilet:",
      res.status,
      text
    );
    throw new Error("Kunne ikke hente publishing heatmap");
  }

  return res.json() as Promise<PublishingHeatmapResponse>;
}

async function getInsights(paramsInput: {
  period: Period;
  from?: string;
  to?: string;
  accountIds: string[];
}) {
  const headers = await getAuthHeaders();

  const params = new URLSearchParams({
    period: paramsInput.period,
  });

  if (paramsInput.from) params.set("from", paramsInput.from);
  if (paramsInput.to) params.set("to", paramsInput.to);

  appendAccountIds(params, paramsInput.accountIds);

  const res = await fetch(`${API_URL}/analytics/insights?${params.toString()}`, {
    cache: "no-store",
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("GET /analytics/insights feilet:", res.status, text);
    throw new Error("Kunne ikke hente insights");
  }

  return res.json() as Promise<InsightsResponse>;
}

function SegmentButton({
  label,
  active,
  href,
  wide = false,
}: {
  label: string;
  active: boolean;
  href: string;
  wide?: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={[
        "inline-flex h-10 shrink-0 items-center justify-center rounded-xl px-4 text-sm font-semibold transition",
        wide ? "min-w-[118px]" : "min-w-[56px]",
      ].join(" ")}
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
    </Link>
  );
}

function MetricCard({
  label,
  value,
  comparisonText,
  comparisonPositive,
  active,
  href,
}: {
  label: string;
  value: string;
  comparisonText?: string;
  comparisonPositive?: boolean;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className="block rounded-xl border p-4 transition md:p-6"
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
    </Link>
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
                alt={post.caption || title}
                className="h-[96px] w-[72px] rounded-lg object-cover sm:h-[128px] sm:w-full"
              />
            ) : (
              <div
                className="h-[96px] w-[72px] rounded-lg sm:h-[128px] sm:w-full"
                style={{ backgroundColor: "var(--color-surface-muted)" }}
              />
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

function InsightCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div
      className="rounded-xl border px-4 py-4 md:px-5 md:py-5"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface-soft)",
      }}
    >
      <p className="text-sm font-medium" style={{ color: "var(--color-muted)" }}>
        {title}
      </p>
      <p
        className="mt-2 text-xl font-semibold tracking-tight md:mt-3 md:text-2xl"
        style={{ color: "var(--color-text)" }}
      >
        {value}
      </p>
      <p
        className="mt-2 text-sm leading-6"
        style={{ color: "var(--color-muted)" }}
      >
        {description}
      </p>
    </div>
  );
}

function TopPostsInfo() {
  return (
    <details className="group relative">
      <summary
        className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-full border text-sm font-semibold transition"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
          color: "var(--color-muted)",
        }}
        aria-label="Vis info om Top Posts"
      >
        i
      </summary>

      <div
        className="absolute right-0 top-[calc(100%+12px)] z-[200] w-[260px] rounded-xl border p-4 text-sm shadow-[0_12px_28px_rgba(0,0,0,0.35)] sm:w-[340px]"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text)",
        }}
      >
        <p className="font-semibold" style={{ color: "var(--color-text)" }}>
          Slik leser du Top Posts
        </p>

        <div
          className="mt-3 space-y-2 leading-6"
          style={{ color: "var(--color-text-soft)" }}
        >
          <p>
            <span className="font-semibold" style={{ color: "var(--color-text)" }}>
              Best Performing:
            </span>{" "}
            Innlegget som samlet sett har prestert best de siste 30 dagene.
          </p>
          <p>
            <span className="font-semibold" style={{ color: "var(--color-text)" }}>
              #1 Views:
            </span>{" "}
            Dette er videoen med flest views de siste 30 dagene.
          </p>
          <p>
            <span className="font-semibold" style={{ color: "var(--color-text)" }}>
              #1 Likes:
            </span>{" "}
            Dette er videoen med flest likes de siste 30 dagene.
          </p>
          <p>
            <span className="font-semibold" style={{ color: "var(--color-text)" }}>
              #1 Comments:
            </span>{" "}
            Dette er videoen med flest kommentarer de siste 30 dagene.
          </p>
        </div>
      </div>
    </details>
  );
}

export default async function HomePage(props: { searchParams: SearchParams }) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const clerkUser = await currentUser();
  const searchParams = await props.searchParams;

  const modeRaw = getSingleValue(searchParams.mode);
  const metricRaw = getSingleValue(searchParams.metric);
  const periodRaw = getSingleValue(searchParams.period);

  const mode: Mode = isValidMode(modeRaw) ? modeRaw : "total";
  const metric: Metric = isValidMetric(metricRaw) ? metricRaw : "views";
  const period: Period = isValidPeriod(periodRaw) ? periodRaw : "30";

  const initialCustomRange = getDefaultCustomRange();
  const fromRaw = getSingleValue(searchParams.from);
  const toRaw = getSingleValue(searchParams.to);

  const from = period === "custom" ? fromRaw || initialCustomRange.from : fromRaw;
  const to = period === "custom" ? toRaw || initialCustomRange.to : toRaw;

  const tableSearch = getSingleValue(searchParams.tableSearch);
  const tableSortBy = getSingleValue(searchParams.tableSortBy) || "publishedAt";
  const tableSortOrder =
    getSingleValue(searchParams.tableSortOrder) === "asc" ? "asc" : "desc";
  const tableView =
    getSingleValue(searchParams.tableView) === "all" ? "all" : "min";
  const heatmapAccountIdRaw = getSingleValue(searchParams.heatmapAccountId);

  const viewer = await getViewer();
  const accessRedirect = resolveAccessRedirect(viewer);

  if (accessRedirect) {
    redirect(accessRedirect);
  }

  const trackedAccountsResponse = await getTrackedAccounts();

  const trackedAccounts = {
    ...trackedAccountsResponse,
    accounts: trackedAccountsResponse?.accounts ?? [],
    permissions: trackedAccountsResponse?.permissions ?? {
      canAddAccounts: false,
      canDeleteAccounts: false,
    },
    limits: trackedAccountsResponse?.limits ?? {
      monthlyAccountAdds: 0,
    },
    usage: trackedAccountsResponse?.usage ?? {
      activeAccounts: 0,
      accountsAddedThisPeriod: 0,
      monthlyAddsRemaining: 0,
      nextAvailableAddAt: null,
    },
    onboarding: trackedAccountsResponse?.onboarding ?? {
      initialScrapeStartedAt: null,
      onboardingCompletedAt: null,
    },
  };

  const safeAccounts = trackedAccounts.accounts;

  const allAccountIds = safeAccounts.map((account) => account.id);
  const selectedAccountIds = normalizeAccountIds(
    searchParams.accountIds,
    allAccountIds
  );

  const selectedHeatmapAccountId =
    safeAccounts.find((account) => account.id === heatmapAccountIdRaw)?.id ??
    safeAccounts[0]?.id ??
    "";

  const latestSyncedAt = getLatestSyncedAt(safeAccounts, selectedAccountIds);

  const [
    accountSummary,
    growth,
    leaderboard,
    publishedContent,
    publishingHeatmap,
    insightsResponse,
  ] = await Promise.all([
    getAccountSummary({
      period,
      from,
      to,
      accountIds: selectedAccountIds,
    }),
    getGrowth({
      period,
      from,
      to,
      accountIds: selectedAccountIds,
    }),
    getTopPostsLeaderboard(selectedAccountIds),
    getPublishedContent({
      accountIds: selectedAccountIds,
      tableSearch,
      tableSortBy,
      tableSortOrder,
    }),
    selectedHeatmapAccountId
      ? getPublishingHeatmap(selectedHeatmapAccountId)
      : Promise.resolve({
          ok: true,
          account: {
            id: "",
            accountHandle: "",
            displayName: null,
            platform: "TIKTOK",
          },
          cells: [],
        } as PublishingHeatmapResponse),
    getInsights({
      period,
      from,
      to,
      accountIds: selectedAccountIds,
    }),
  ]);

  const heroName =
    getFirstName(viewer.user.name) ||
    getFirstName(clerkUser?.fullName) ||
    getFirstName(clerkUser?.firstName);

  const summaryValues = {
    views:
      mode === "total"
        ? formatNumber(accountSummary.summary.totalViews)
        : formatNumber(accountSummary.summary.averageViewsPerPost),
    likes:
      mode === "total"
        ? formatNumber(accountSummary.summary.totalLikes)
        : formatNumber(accountSummary.summary.averageLikesPerPost),
    publishing:
      mode === "total"
        ? formatNumber(accountSummary.summary.totalPostCount)
        : formatNumber(accountSummary.summary.averagePostsPerDay),
    engagement:
      mode === "total"
        ? formatPercent(accountSummary.summary.totalEngagementRate)
        : formatPercent(accountSummary.summary.averageEngagementRate),
  };

  const comparisonValues = {
    views: accountSummary.summary.comparison?.views,
    likes: accountSummary.summary.comparison?.likes,
    posts: accountSummary.summary.comparison?.posts,
    engagement: accountSummary.summary.comparison?.engagement,
  };

  const visiblePosts =
    tableView === "all"
      ? publishedContent.posts
      : publishedContent.posts.slice(0, 10);

  function buildHref(overrides?: Record<string, string | string[] | undefined>) {
    const params = new URLSearchParams();

    const nextMode = overrides?.mode?.toString() ?? mode;
    const nextMetric = overrides?.metric?.toString() ?? metric;
    const nextPeriod = overrides?.period?.toString() ?? period;

    params.set("mode", nextMode);
    params.set("metric", nextMetric);
    params.set("period", nextPeriod);

    let nextFrom =
      typeof overrides?.from === "string" ? overrides.from : from || undefined;
    let nextTo =
      typeof overrides?.to === "string" ? overrides.to : to || undefined;

    if (nextPeriod === "custom") {
      if (!nextFrom || !nextTo) {
        const fallback = getDefaultCustomRange();
        nextFrom = nextFrom || fallback.from;
        nextTo = nextTo || fallback.to;
      }

      params.set("from", nextFrom);
      params.set("to", nextTo);
    }

    const nextAccountIds = Array.isArray(overrides?.accountIds)
      ? overrides.accountIds
      : selectedAccountIds;

    nextAccountIds.forEach((id) => {
      params.append("accountIds", id);
    });

    if (tableSearch.trim() !== "") {
      params.set("tableSearch", tableSearch);
    }

    if (selectedHeatmapAccountId) {
      params.set("heatmapAccountId", selectedHeatmapAccountId);
    }

    params.set("tableSortBy", tableSortBy);
    params.set("tableSortOrder", tableSortOrder);
    params.set("tableView", tableView);

    return `?${params.toString()}`;
  }

  function createTableHref(
    nextSortBy: string,
    nextSortOrder?: "asc" | "desc",
    nextView?: "all" | "min"
  ) {
    const params = new URLSearchParams();

    params.set("mode", mode);
    params.set("metric", metric);
    params.set("period", period);

    if (period === "custom") {
      params.set("from", from);
      params.set("to", to);
    }

    selectedAccountIds.forEach((id) => params.append("accountIds", id));

    if (selectedHeatmapAccountId) {
      params.set("heatmapAccountId", selectedHeatmapAccountId);
    }

    if (tableSearch.trim() !== "") {
      params.set("tableSearch", tableSearch);
    }

    params.set("tableSortBy", nextSortBy);
    params.set(
      "tableSortOrder",
      nextSortOrder ??
        (tableSortBy === nextSortBy && tableSortOrder === "desc" ? "asc" : "desc")
    );
    params.set("tableView", nextView ?? tableView);

    return `?${params.toString()}`;
  }

  function createViewHref(nextView: "all" | "min") {
    const params = new URLSearchParams();

    params.set("mode", mode);
    params.set("metric", metric);
    params.set("period", period);

    if (period === "custom") {
      params.set("from", from);
      params.set("to", to);
    }

    selectedAccountIds.forEach((id) => params.append("accountIds", id));

    if (selectedHeatmapAccountId) {
      params.set("heatmapAccountId", selectedHeatmapAccountId);
    }

    if (tableSearch.trim() !== "") {
      params.set("tableSearch", tableSearch);
    }

    params.set("tableSortBy", tableSortBy);
    params.set("tableSortOrder", tableSortOrder);
    params.set("tableView", nextView);

    return `?${params.toString()}`;
  }

  function getSortArrow(column: string) {
    if (tableSortBy !== column) {
      return "↕";
    }

    return tableSortOrder === "asc" ? "↑" : "↓";
  }

  const heatmapFormParams: Array<{ key: string; value: string }> = [];

  heatmapFormParams.push({ key: "mode", value: mode });
  heatmapFormParams.push({ key: "metric", value: metric });
  heatmapFormParams.push({ key: "period", value: period });

  if (period === "custom") {
    heatmapFormParams.push({ key: "from", value: from });
    heatmapFormParams.push({ key: "to", value: to });
  }

  selectedAccountIds.forEach((id) => {
    heatmapFormParams.push({ key: "accountIds", value: id });
  });

  if (tableSearch.trim() !== "") {
    heatmapFormParams.push({ key: "tableSearch", value: tableSearch });
  }

  heatmapFormParams.push({ key: "tableSortBy", value: tableSortBy });
  heatmapFormParams.push({ key: "tableSortOrder", value: tableSortOrder });
  heatmapFormParams.push({ key: "tableView", value: tableView });

  return (
    <AppThemeShell>
      <main
        className="min-h-screen max-w-full overflow-x-hidden px-4 py-4 sm:px-4 sm:py-5 md:px-6 md:py-6"
        style={{
          backgroundColor: "var(--color-bg)",
          color: "var(--color-text)",
        }}
      >
        <div className="hidden sm:fixed sm:right-6 sm:top-6 sm:z-[1001] sm:block">
          <UserMenuButton />
        </div>

        <div className="mx-auto max-w-[1380px]">
          <header className="mb-6 sm:mb-8">
            <div className="flex items-start justify-between gap-4 sm:block">
              <div className="min-w-0">
                <svg
                  width="150"
                  height="44"
                  viewBox="0 0 260 90"
                  xmlns="http://www.w3.org/2000/svg"
                  role="img"
                  aria-label="Scopio logo"
                  className="block h-[32px] w-[106px] sm:h-[38px] sm:w-[128px] md:h-[44px] md:w-[150px]"
                >
                  <text
                    x="8"
                    y="68"
                    fill="var(--color-text)"
                    fontSize="64"
                    fontFamily="Georgia, 'Times New Roman', serif"
                    fontWeight="700"
                    letterSpacing="-2"
                  >
                    Scopio
                  </text>
                </svg>

                <div className="mt-5">
                  <h1
                    className="max-w-full break-words text-[26px] font-semibold tracking-tight sm:text-[30px] md:text-[32px]"
                    style={{ color: "var(--color-text)" }}
                  >
                    Velkommen tilbake, {heroName}
                  </h1>

                  <p
                    className="mt-2 text-sm"
                    style={{ color: "var(--color-muted)" }}
                  >
                    {latestSyncedAt
                      ? `Sist oppdatert: ${formatDateTime(latestSyncedAt)}`
                      : "Sist oppdatert: Ikke tilgjengelig ennå"}
                  </p>
                </div>
              </div>

              <div className="sm:hidden">
                <UserMenuButton />
              </div>
            </div>
          </header>

          <div
            className="rounded-2xl border p-4 shadow-[0_8px_24px_rgba(15,23,42,0.18)] sm:p-5 md:p-6"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface)",
            }}
          >
            <div className="flex flex-col gap-5 md:gap-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
                  <ConnectedAccounts
                    accounts={safeAccounts}
                    selectedAccountIds={selectedAccountIds}
                    mode={mode}
                    metric={metric}
                    period={period}
                    from={from}
                    to={to}
                    tableSearch={tableSearch}
                    tableSortBy={tableSortBy}
                    tableSortOrder={tableSortOrder}
                    tableView={tableView}
                    accountLimit={trackedAccounts.limits.monthlyAccountAdds}
                    accountsUsed={trackedAccounts.usage.accountsAddedThisPeriod}
                    accountsRemaining={trackedAccounts.usage.monthlyAddsRemaining}
                    canAddAccounts={trackedAccounts.permissions.canAddAccounts}
                  />
                </div>

                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:gap-6">
                  <div
                    className="w-full rounded-xl border p-1 xl:w-auto"
                    style={{
                      borderColor: "var(--color-border)",
                      backgroundColor: "var(--color-surface-soft)",
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <SegmentButton
                        label="Totalt"
                        active={mode === "total"}
                        href={buildHref({ mode: "total" })}
                        wide
                      />
                      <SegmentButton
                        label="Gjennomsnitt"
                        active={mode === "average"}
                        href={buildHref({ mode: "average" })}
                        wide
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: "var(--color-muted)" }}
                    >
                      Periode
                    </span>

                    <div
                      className="w-full rounded-xl border p-1 sm:w-auto"
                      style={{
                        borderColor: "var(--color-border)",
                        backgroundColor: "var(--color-surface-soft)",
                      }}
                    >
                      <div className="flex items-center gap-1 overflow-x-auto">
                        <SegmentButton
                          label="7"
                          active={period === "7"}
                          href={buildHref({ period: "7", from: undefined, to: undefined })}
                        />
                        <SegmentButton
                          label="30"
                          active={period === "30"}
                          href={buildHref({ period: "30", from: undefined, to: undefined })}
                        />
                        <SegmentButton
                          label="90"
                          active={period === "90"}
                          href={buildHref({ period: "90", from: undefined, to: undefined })}
                        />
                        <SegmentButton
                          label="Custom"
                          active={period === "custom"}
                          href={buildHref({ period: "custom" })}
                          wide
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {insightsResponse.insights.length > 0 ? (
                <section
                  className="rounded-2xl border p-4 md:p-5"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-surface)",
                  }}
                >
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                      <div>
                        <p
                          className="text-sm font-semibold"
                          style={{ color: "var(--color-text)" }}
                        >
                          Innsikt og mønstre
                        </p>
                        <p
                          className="mt-1 text-sm"
                          style={{ color: "var(--color-muted)" }}
                        >
                          Kort oppsummert for perioden du ser på nå.
                        </p>
                      </div>

                      <span
                        className="inline-flex shrink-0 items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition"
                        style={{
                          borderColor: "var(--color-border)",
                          backgroundColor: "var(--color-surface-soft)",
                          color: "var(--color-text)",
                        }}
                      >
                        <span className="group-open:hidden">Vis mer</span>
                        <span className="hidden group-open:inline">Skjul</span>
                      </span>
                    </summary>

                    <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
                      {insightsResponse.insights.map((insight) => (
                        <InsightCard
                          key={insight.id}
                          title={insight.title}
                          value={insight.value}
                          description={insight.description}
                        />
                      ))}
                    </div>
                  </details>
                </section>
              ) : null}

              {period === "custom" ? (
                <form
                  method="GET"
                  className="grid gap-3 rounded-xl border p-4 md:grid-cols-[1fr_1fr_auto]"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-surface-soft)",
                  }}
                >
                  <input type="hidden" name="mode" value={mode} />
                  <input type="hidden" name="metric" value={metric} />
                  <input type="hidden" name="period" value="custom" />
                  <input type="hidden" name="tableSortBy" value={tableSortBy} />
                  <input type="hidden" name="tableSortOrder" value={tableSortOrder} />
                  <input type="hidden" name="tableView" value={tableView} />

                  {selectedHeatmapAccountId ? (
                    <input
                      type="hidden"
                      name="heatmapAccountId"
                      value={selectedHeatmapAccountId}
                    />
                  ) : null}

                  {tableSearch ? (
                    <input type="hidden" name="tableSearch" value={tableSearch} />
                  ) : null}

                  {selectedAccountIds.map((id) => (
                    <input key={id} type="hidden" name="accountIds" value={id} />
                  ))}

                  <label
                    className="flex flex-col gap-2 text-sm"
                    style={{ color: "var(--color-text)" }}
                  >
                    <span className="font-medium">Fra</span>
                    <input
                      type="date"
                      name="from"
                      defaultValue={from}
                      className="rounded-xl border px-4 py-3 outline-none"
                      style={{
                        borderColor: "var(--color-border)",
                        backgroundColor: "var(--color-surface)",
                        color: "var(--color-text)",
                      }}
                    />
                  </label>

                  <label
                    className="flex flex-col gap-2 text-sm"
                    style={{ color: "var(--color-text)" }}
                  >
                    <span className="font-medium">Til</span>
                    <input
                      type="date"
                      name="to"
                      defaultValue={to}
                      className="rounded-xl border px-4 py-3 outline-none"
                      style={{
                        borderColor: "var(--color-border)",
                        backgroundColor: "var(--color-surface)",
                        color: "var(--color-text)",
                      }}
                    />
                  </label>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full rounded-xl px-5 py-3 text-sm font-semibold text-white transition"
                      style={{
                        backgroundColor: "var(--color-accent)",
                      }}
                    >
                      Oppdater
                    </button>
                  </div>
                </form>
              ) : null}

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
                  href={buildHref({ metric: "views" })}
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
                  href={buildHref({ metric: "likes" })}
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
                  href={buildHref({ metric: "publishing" })}
                />
                <MetricCard
                  label="Engasjement"
                  value={summaryValues.engagement}
                  comparisonText={
                    comparisonValues.engagement
                      ? formatComparisonPercent(
                          comparisonValues.engagement.changePercent
                        )
                      : undefined
                  }
                  comparisonPositive={
                    comparisonValues.engagement
                      ? comparisonValues.engagement.changePercent >= 0
                      : undefined
                  }
                  active={metric === "engagement"}
                  href={buildHref({ metric: "engagement" })}
                />
              </section>

              <section className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:grid-rows-[auto_auto]">
                <div
                  className="rounded-xl border p-4 shadow-sm md:p-6"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-surface)",
                  }}
                >
                  <GrowthChart
                    data={growth.growth}
                    metric={metric}
                    mode={mode}
                    metricLabel={
                      metric === "views"
                        ? "Views"
                        : metric === "likes"
                          ? "Likes"
                          : metric === "publishing"
                            ? "Publiseringer"
                            : "Engasjement"
                    }
                    selectedAccountIds={selectedAccountIds}
                  />
                </div>

                <aside
                  className="relative z-[1] rounded-xl border p-4 shadow-sm xl:row-span-2"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-surface-soft)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3
                          className="text-lg font-semibold"
                          style={{ color: "var(--color-text)" }}
                        >
                          Top Posts
                        </h3>
                        <TopPostsInfo />
                      </div>
                      <p
                        className="mt-1 text-sm"
                        style={{ color: "var(--color-muted)" }}
                      >
                        Her ser du innleggene som har prestert best i perioden.
                      </p>
                    </div>

                    <span
                      className="shrink-0 text-xs font-medium"
                      style={{ color: "var(--color-muted)" }}
                    >
                      Siste 30 dager
                    </span>
                  </div>

                  <div className="mt-5 space-y-4">
                    <LeaderCard
                      title="Best Performing"
                      post={leaderboard.leaders.bestPerforming}
                    />
                    <LeaderCard title="#1 Views" post={leaderboard.leaders.views} />
                    <LeaderCard title="#1 Likes" post={leaderboard.leaders.likes} />
                    <LeaderCard
                      title="#1 Comments"
                      post={leaderboard.leaders.comments}
                    />
                  </div>
                </aside>

                <div className="relative z-[20] overflow-visible">
                  <PublishingHeatmap
                    accounts={safeAccounts}
                    selectedAccountId={selectedHeatmapAccountId}
                    cells={publishingHeatmap.cells}
                    currentParams={heatmapFormParams}
                  />
                </div>
              </section>

              <section
                className="rounded-xl border p-4 shadow-sm md:p-6"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                }}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3
                      className="text-xl font-semibold md:text-2xl"
                      style={{ color: "var(--color-text)" }}
                    >
                      Publisert innhold
                    </h3>
                    <p
                      className="mt-1 text-sm"
                      style={{ color: "var(--color-muted)" }}
                    >
                      Søk i caption og sorter innholdet slik du vil.
                    </p>
                  </div>

                  <Link
                    href={createViewHref(tableView === "all" ? "min" : "all")}
                    scroll={false}
                    className="inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium transition"
                    style={{
                      borderColor: "var(--color-border)",
                      backgroundColor: "var(--color-surface)",
                      color: "var(--color-text)",
                    }}
                  >
                    {tableView === "all" ? "Vis færre" : "Vis alle"}
                  </Link>
                </div>

                <form method="GET" className="mt-4">
                  <input type="hidden" name="mode" value={mode} />
                  <input type="hidden" name="metric" value={metric} />
                  <input type="hidden" name="period" value={period} />
                  <input type="hidden" name="tableSortBy" value={tableSortBy} />
                  <input type="hidden" name="tableSortOrder" value={tableSortOrder} />
                  <input type="hidden" name="tableView" value={tableView} />

                  {selectedHeatmapAccountId ? (
                    <input
                      type="hidden"
                      name="heatmapAccountId"
                      value={selectedHeatmapAccountId}
                    />
                  ) : null}

                  {period === "custom" ? (
                    <>
                      <input type="hidden" name="from" value={from} />
                      <input type="hidden" name="to" value={to} />
                    </>
                  ) : null}

                  {selectedAccountIds.map((id) => (
                    <input key={id} type="hidden" name="accountIds" value={id} />
                  ))}

                  <div className="flex flex-col gap-3 md:flex-row">
                    <input
                      type="text"
                      name="tableSearch"
                      defaultValue={tableSearch}
                      placeholder="Søk i caption..."
                      className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
                      style={{
                        borderColor: "var(--color-border)",
                        backgroundColor: "var(--color-surface)",
                        color: "var(--color-text)",
                      }}
                    />

                    <button
                      type="submit"
                      className="rounded-xl px-5 py-3 text-sm font-semibold text-white transition"
                      style={{ backgroundColor: "var(--color-accent)" }}
                    >
                      Søk
                    </button>
                  </div>
                </form>

                <div className="mt-5 overflow-x-auto">
                  <div className={tableView === "all" ? "max-h-[620px] overflow-y-auto" : ""}>
                    <table className="min-w-full border-separate border-spacing-0 text-sm">
                      <thead
                        className="sticky top-0 z-10"
                        style={{ backgroundColor: "var(--color-surface)" }}
                      >
                        <tr>
                          <th
                            className="border-b px-4 py-3 text-left font-medium"
                            style={{
                              borderColor: "var(--color-border)",
                              color: "var(--color-muted)",
                            }}
                          >
                            Lenke
                          </th>

                          <th
                            className="border-b px-4 py-3 text-left font-medium"
                            style={{
                              borderColor: "var(--color-border)",
                              color: "var(--color-muted)",
                            }}
                          >
                            <Link
                              href={createTableHref("publishedAt")}
                              scroll={false}
                              className="inline-flex items-center gap-2"
                            >
                              Dato
                              <span className="text-xs">{getSortArrow("publishedAt")}</span>
                            </Link>
                          </th>

                          <th
                            className="border-b px-4 py-3 text-right font-medium"
                            style={{
                              borderColor: "var(--color-border)",
                              color: "var(--color-muted)",
                            }}
                          >
                            <Link
                              href={createTableHref("views")}
                              scroll={false}
                              className="inline-flex items-center gap-2"
                            >
                              Views
                              <span className="text-xs">{getSortArrow("views")}</span>
                            </Link>
                          </th>

                          <th
                            className="border-b px-4 py-3 text-right font-medium"
                            style={{
                              borderColor: "var(--color-border)",
                              color: "var(--color-muted)",
                            }}
                          >
                            <Link
                              href={createTableHref("likes")}
                              scroll={false}
                              className="inline-flex items-center gap-2"
                            >
                              Likes
                              <span className="text-xs">{getSortArrow("likes")}</span>
                            </Link>
                          </th>

                          <th
                            className="border-b px-4 py-3 text-right font-medium"
                            style={{
                              borderColor: "var(--color-border)",
                              color: "var(--color-muted)",
                            }}
                          >
                            <Link
                              href={createTableHref("comments")}
                              scroll={false}
                              className="inline-flex items-center gap-2"
                            >
                              Kommentarer
                              <span className="text-xs">{getSortArrow("comments")}</span>
                            </Link>
                          </th>

                          <th
                            className="border-b px-4 py-3 text-right font-medium"
                            style={{
                              borderColor: "var(--color-border)",
                              color: "var(--color-muted)",
                            }}
                          >
                            <Link
                              href={createTableHref("engagementRate")}
                              scroll={false}
                              className="inline-flex items-center gap-2"
                            >
                              Engasjement i %
                              <span className="text-xs">{getSortArrow("engagementRate")}</span>
                            </Link>
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {visiblePosts.length === 0 ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-4 py-8 text-center"
                              style={{ color: "var(--color-muted)" }}
                            >
                              Ingen innlegg funnet.
                            </td>
                          </tr>
                        ) : (
                          visiblePosts.map((post) => (
                            <tr
                              key={post.id}
                              style={{ backgroundColor: "transparent" }}
                            >
                              <td
                                className="border-b px-4 py-4 text-left"
                                style={{ borderColor: "var(--color-border)" }}
                              >
                                <div className="flex items-center gap-3">
                                  <a
                                    href={post.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="shrink-0"
                                  >
                                    {post.thumbnailUrl ? (
                                      <img
                                        src={post.thumbnailUrl}
                                        alt={post.caption || "Thumbnail"}
                                        className="h-14 w-10 rounded-md object-cover"
                                      />
                                    ) : (
                                      <div
                                        className="h-14 w-10 rounded-md"
                                        style={{
                                          backgroundColor: "var(--color-surface-muted)",
                                        }}
                                      />
                                    )}
                                  </a>

                                  <a
                                    href={post.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={post.caption || "Åpne innlegg"}
                                    className="font-medium underline underline-offset-4"
                                    style={{ color: "var(--color-text)" }}
                                  >
                                    {getPlatformLabel(post.platform)}
                                  </a>
                                </div>
                              </td>

                              <td
                                className="border-b px-4 py-4 text-left"
                                style={{
                                  borderColor: "var(--color-border)",
                                  color: "var(--color-text)",
                                }}
                              >
                                {formatDate(post.publishedAt)}
                              </td>

                              <td
                                className="border-b px-4 py-4 text-right tabular-nums"
                                style={{
                                  borderColor: "var(--color-border)",
                                  color: "var(--color-text)",
                                }}
                              >
                                {formatNumber(post.latestSnapshot.views)}
                              </td>

                              <td
                                className="border-b px-4 py-4 text-right tabular-nums"
                                style={{
                                  borderColor: "var(--color-border)",
                                  color: "var(--color-text)",
                                }}
                              >
                                {formatNumber(post.latestSnapshot.likes)}
                              </td>

                              <td
                                className="border-b px-4 py-4 text-right tabular-nums"
                                style={{
                                  borderColor: "var(--color-border)",
                                  color: "var(--color-text)",
                                }}
                              >
                                {formatNumber(post.latestSnapshot.comments)}
                              </td>

                              <td
                                className="border-b px-4 py-4 text-right tabular-nums font-semibold"
                                style={{
                                  borderColor: "var(--color-border)",
                                  color: "var(--color-text)",
                                }}
                              >
                                {formatPercent(post.engagementRate)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div
                  className="mt-4 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                  style={{ color: "var(--color-muted)" }}
                >
                  <p>
                    Viser {visiblePosts.length} av {publishedContent.count} innlegg
                  </p>

                  {publishedContent.count > 10 ? (
                    <Link
                      href={createViewHref(tableView === "all" ? "min" : "all")}
                      scroll={false}
                      className="font-medium underline underline-offset-4"
                      style={{ color: "var(--color-text)" }}
                    >
                      {tableView === "all" ? "Vis færre" : "Vis alle"}
                    </Link>
                  ) : null}
                </div>
              </section>
            </div>
          </div>
        </div>

        <InitialAccountOnboarding
          isRequired={Boolean(viewer.access?.requiresInitialAccountOnboarding)}
          isInitialScrapeRunning={Boolean(viewer.access?.isInitialScrapeRunning)}
          accountLimit={trackedAccounts.limits.monthlyAccountAdds}
          canAddAccounts={trackedAccounts.permissions.canAddAccounts}
          existingAccounts={safeAccounts}
        />
      </main>
    </AppThemeShell>
  );
}