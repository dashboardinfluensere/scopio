import InitialAccountOnboarding from "../../components/InitialAccountOnboarding";
import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import ConnectedAccounts from "../../components/ConnectedAccounts";
import DashboardInteractive, {
  DashboardChartFrame,
  DashboardMetrics,
  DashboardModeSwitch,
  DashboardTopPosts,
} from "../../components/DashboardInteractive";
import PublishingHeatmap from "../../components/PublishingHeatmap";
import PublishedContentTable from "../../components/PublishedContentTable";
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
  topPostsMode?: string;
  topPostsRank?: string;
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

function isValidTopPostsMode(value: string): value is TopPostsMode {
  return value === "top" || value === "worst";
}

function parseTopPostsRank(value: string): 1 | 2 | 3 {
  const rank = Number(value);

  if (rank === 1 || rank === 2 || rank === 3) {
    return rank;
  }

  return 1;
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

  const topPostsModeRaw = getSingleValue(searchParams.topPostsMode);
  const topPostsRankRaw = getSingleValue(searchParams.topPostsRank);

  const topPostsMode: TopPostsMode = isValidTopPostsMode(topPostsModeRaw)
    ? topPostsModeRaw
    : "top";

  const topPostsRank = parseTopPostsRank(topPostsRankRaw);

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
      tableSearch: "",
      tableSortBy: "publishedAt",
      tableSortOrder: "desc",
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
    params.set("topPostsMode", topPostsMode);
    params.set("topPostsRank", String(topPostsRank));

    return `?${params.toString()}`;
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
  heatmapFormParams.push({ key: "topPostsMode", value: topPostsMode });
  heatmapFormParams.push({ key: "topPostsRank", value: String(topPostsRank) });

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
              <DashboardInteractive
                initialMode={mode}
                initialMetric={metric}
                initialTopPostsMode={topPostsMode}
                initialTopPostsRank={topPostsRank}
                summary={accountSummary.summary}
                growth={growth.growth}
                selectedAccountIds={selectedAccountIds}
                leaderboard={leaderboard}
              >
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
                  <DashboardModeSwitch />

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
                  <input type="hidden" name="topPostsMode" value={topPostsMode} />
                  <input type="hidden" name="topPostsRank" value={topPostsRank} />

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

                <DashboardMetrics />

                <section className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:grid-rows-[auto_auto]">
                  <DashboardChartFrame />

                  <DashboardTopPosts />

                  <div className="relative z-[20] overflow-visible">
                    <PublishingHeatmap
                      accounts={safeAccounts}
                      selectedAccountId={selectedHeatmapAccountId}
                      cells={publishingHeatmap.cells}
                      currentParams={heatmapFormParams}
                    />
                  </div>
                </section>
              </DashboardInteractive>

              <PublishedContentTable
                posts={publishedContent.posts}
                initialSearch={tableSearch}
                initialSortBy={tableSortBy}
                initialSortOrder={tableSortOrder}
                initialView={tableView}
              />
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