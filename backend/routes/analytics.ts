import { Router, Request } from "express";
import { Prisma, Platform } from "@prisma/client";
import { prisma } from "../prisma";
import { getOrganizationAccess } from "../services/requireProAccess";
import { getActiveOrganizationAccess } from "../services/getActiveOrganizationAccess";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middleware/requireAuth";

const router = Router();

type DateRange = {
  start: Date;
  end: Date;
};

type PeriodKey = "7" | "30" | "90" | "custom";

type SelectedAccount = {
  id: string;
  accountHandle: string;
  displayName: string | null;
  platform: Platform;
  profileUrl: string | null;
};

type LatestSnapshot = {
  scrapedAt: Date;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
};

type HeatmapSnapshot = {
  scrapedAt: Date;
  views: number | null;
};

type SummaryPost = {
  id: string;
  externalPostId: string;
  socialAccountId: string;
  platform: Platform;
  caption: string | null;
  tags: string[];
  publishedAt: Date;
  url: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  socialAccount: {
    id: string;
    accountHandle: string;
    displayName: string | null;
    platform: Platform;
    profileUrl: string | null;
  };
  snapshots: LatestSnapshot[];
};

type HeatmapPost = {
  id: string;
  socialAccountId: string;
  publishedAt: Date;
  snapshots: HeatmapSnapshot[];
};

function getAuthenticatedClerkUserId(req: AuthenticatedRequest): string | null {
  return req.auth?.clerkUserId ?? req.auth?.userId ?? null;
}

function getSingleQueryValue(value: unknown): string {
  if (Array.isArray(value)) {
    return String(value[0] ?? "").trim();
  }

  return String(value ?? "").trim();
}

function parseAccountIds(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? value.split(",")
      : [];

  return values
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function parseISODateInput(value?: string): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function differenceInDaysInclusive(start: Date, end: Date) {
  const startMs = startOfDay(start).getTime();
  const endMs = startOfDay(end).getTime();
  const diff = Math.max(0, endMs - startMs);

  return Math.floor(diff / 86400000) + 1;
}

function getPeriodFromRequest(req: Request): PeriodKey {
  const periodRaw = getSingleQueryValue(req.query.period);

  if (
    periodRaw === "7" ||
    periodRaw === "30" ||
    periodRaw === "90" ||
    periodRaw === "custom"
  ) {
    return periodRaw;
  }

  return "30";
}

function getDateRangeFromRequest(req: Request): DateRange {
  const period = getPeriodFromRequest(req);

  if (period === "custom") {
    const from = parseISODateInput(getSingleQueryValue(req.query.from));
    const to = parseISODateInput(getSingleQueryValue(req.query.to));

    if (from && to) {
      return {
        start: startOfDay(from),
        end: endOfDay(to),
      };
    }

    if (from && !to) {
      return {
        start: startOfDay(from),
        end: endOfDay(new Date()),
      };
    }

    if (!from && to) {
      const fallbackStart = new Date(to);
      fallbackStart.setDate(fallbackStart.getDate() - 29);

      return {
        start: startOfDay(fallbackStart),
        end: endOfDay(to),
      };
    }
  }

  const days = Number(period);
  const end = endOfDay(new Date());
  const start = startOfDay(new Date());
  start.setDate(start.getDate() - (days - 1));

  return { start, end };
}

function getPreviousDateRange(currentRange: DateRange): DateRange {
  const days = differenceInDaysInclusive(currentRange.start, currentRange.end);

  const previousEnd = endOfDay(new Date(currentRange.start));
  previousEnd.setDate(previousEnd.getDate() - 1);

  const previousStart = startOfDay(new Date(previousEnd));
  previousStart.setDate(previousStart.getDate() - (days - 1));

  return {
    start: previousStart,
    end: previousEnd,
  };
}

async function getScopedAccounts(
  organizationId: string,
  requestedAccountIds: string[]
) {
  const accounts = await prisma.socialAccount.findMany({
    where: {
      organizationId,
      isActive: true,
    },
    select: {
      id: true,
      accountHandle: true,
      displayName: true,
      platform: true,
      profileUrl: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const validRequestedIds = new Set(requestedAccountIds);
  const selectedAccounts =
    requestedAccountIds.length > 0
      ? accounts.filter((account) => validRequestedIds.has(account.id))
      : accounts;

  return {
    allAccounts: accounts,
    selectedAccounts,
    selectedAccountIds: selectedAccounts.map((account) => account.id),
  };
}

function buildPostWhere(
  organizationId: string,
  accountIds: string[],
  range?: DateRange
): Prisma.ContentPostWhereInput {
  const where: Prisma.ContentPostWhereInput = {
    organizationId,
  };

  if (accountIds.length > 0) {
    where.socialAccountId = {
      in: accountIds,
    };
  }

  if (range) {
    where.publishedAt = {
      gte: range.start,
      lte: range.end,
    };
  }

  return where;
}

function sumPostEngagements(snapshot?: {
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
}) {
  return (
    Number(snapshot?.likes ?? 0) +
    Number(snapshot?.comments ?? 0) +
    Number(snapshot?.shares ?? 0) +
    Number(snapshot?.saves ?? 0)
  );
}

function getPostEngagementRate(snapshot?: {
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
}) {
  const views = Number(snapshot?.views ?? 0);

  if (views <= 0) {
    return 0;
  }

  return Number(((sumPostEngagements(snapshot) / views) * 100).toFixed(2));
}

function getOsloWeekdayIndex(dateInput: Date | string) {
  const date = new Date(dateInput);

  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    weekday: "long",
  }).format(date);

  const weekdayMap: Record<string, number> = {
    monday: 0,
    tuesday: 1,
    wednesday: 2,
    thursday: 3,
    friday: 4,
    saturday: 5,
    sunday: 6,
  };

  return weekdayMap[weekday.toLowerCase()] ?? 0;
}

function getOsloHour(dateInput: Date | string) {
  const date = new Date(dateInput);

  const hourString = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    hour12: false,
  }).format(date);

  return Number(hourString);
}

function getTimeSlotIndexFromHour(hour: number) {
  if (hour >= 0 && hour < 6) return 0;
  if (hour >= 6 && hour < 12) return 1;
  if (hour >= 12 && hour < 18) return 2;
  return 3;
}

function getMedian(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  }

  return sorted[middle];
}

function getTargetDateSevenDaysAfterPublished(publishedAt: Date | string) {
  const date = new Date(publishedAt);
  date.setDate(date.getDate() + 7);
  return date;
}

function getSnapshotClosestToTarget(
  snapshots: Array<{
    scrapedAt: Date;
    views?: number | null;
  }>,
  targetDate: Date
) {
  if (!snapshots.length) {
    return null;
  }

  let closest = snapshots[0];
  let smallestDiff = Math.abs(
    new Date(snapshots[0].scrapedAt).getTime() - targetDate.getTime()
  );

  for (const snapshot of snapshots) {
    const diff = Math.abs(
      new Date(snapshot.scrapedAt).getTime() - targetDate.getTime()
    );

    if (diff < smallestDiff) {
      closest = snapshot;
      smallestDiff = diff;
    }
  }

  return closest;
}

async function getSummaryForRange(
  organizationId: string,
  selectedAccountIds: string[],
  selectedAccounts: SelectedAccount[],
  range: DateRange
) {
  const periodDays = differenceInDaysInclusive(range.start, range.end);

  const posts = (await prisma.contentPost.findMany({
    where: buildPostWhere(organizationId, selectedAccountIds, range),
    include: {
      socialAccount: {
        select: {
          id: true,
          accountHandle: true,
          displayName: true,
          platform: true,
          profileUrl: true,
        },
      },
      snapshots: {
        orderBy: {
          scrapedAt: "desc",
        },
        take: 1,
        select: {
          scrapedAt: true,
          views: true,
          likes: true,
          comments: true,
          shares: true,
          saves: true,
        },
      },
    },
    orderBy: {
      publishedAt: "desc",
    },
  })) as SummaryPost[];

  const grouped = new Map<
    string,
    {
      accountId: string;
      accountHandle: string;
      displayName: string | null;
      platform: Platform;
      profileUrl: string | null;
      totalViews: number;
      totalLikes: number;
      totalComments: number;
      totalShares: number;
      totalSaves: number;
      totalEngagements: number;
      postCount: number;
      engagementRateSum: number;
    }
  >();

  for (const account of selectedAccounts) {
    grouped.set(account.id, {
      accountId: account.id,
      accountHandle: account.accountHandle,
      displayName: account.displayName,
      platform: account.platform,
      profileUrl: account.profileUrl,
      totalViews: 0,
      totalLikes: 0,
      totalComments: 0,
      totalShares: 0,
      totalSaves: 0,
      totalEngagements: 0,
      postCount: 0,
      engagementRateSum: 0,
    });
  }

  for (const post of posts) {
    const latestSnapshot = post.snapshots[0];
    const entry = grouped.get(post.socialAccountId);

    if (!entry || !latestSnapshot) {
      continue;
    }

    const views = Number(latestSnapshot.views ?? 0);
    const likes = Number(latestSnapshot.likes ?? 0);
    const comments = Number(latestSnapshot.comments ?? 0);
    const shares = Number(latestSnapshot.shares ?? 0);
    const saves = Number(latestSnapshot.saves ?? 0);
    const engagements = likes + comments + shares + saves;
    const engagementRate = getPostEngagementRate(latestSnapshot);

    entry.totalViews += views;
    entry.totalLikes += likes;
    entry.totalComments += comments;
    entry.totalShares += shares;
    entry.totalSaves += saves;
    entry.totalEngagements += engagements;
    entry.postCount += 1;
    entry.engagementRateSum += engagementRate;
  }

  const accounts = Array.from(grouped.values())
    .map((entry) => ({
      accountId: entry.accountId,
      accountHandle: entry.accountHandle,
      displayName: entry.displayName,
      platform: entry.platform,
      profileUrl: entry.profileUrl,
      totalViews: entry.totalViews,
      averageViewsPerPost:
        entry.postCount > 0 ? Math.round(entry.totalViews / entry.postCount) : 0,
      totalLikes: entry.totalLikes,
      averageLikesPerPost:
        entry.postCount > 0 ? Math.round(entry.totalLikes / entry.postCount) : 0,
      totalPostCount: entry.postCount,
      averagePostsPerDay:
        periodDays > 0 ? Number((entry.postCount / periodDays).toFixed(2)) : 0,
      totalEngagementRate:
        entry.totalViews > 0
          ? Number(((entry.totalEngagements / entry.totalViews) * 100).toFixed(2))
          : 0,
      averageEngagementRate:
        entry.postCount > 0
          ? Number((entry.engagementRateSum / entry.postCount).toFixed(2))
          : 0,
    }))
    .sort((a, b) => b.totalViews - a.totalViews);

  const summary = {
    totalViews: accounts.reduce((sum, account) => sum + account.totalViews, 0),
    averageViewsPerPost: 0,
    totalLikes: accounts.reduce((sum, account) => sum + account.totalLikes, 0),
    averageLikesPerPost: 0,
    totalPostCount: accounts.reduce(
      (sum, account) => sum + account.totalPostCount,
      0
    ),
    averagePostsPerDay: 0,
    totalEngagementRate: 0,
    averageEngagementRate: 0,
  };

  const totalComments = accounts.reduce(
    (sum, account) => sum + (grouped.get(account.accountId)?.totalComments ?? 0),
    0
  );
  const totalShares = accounts.reduce(
    (sum, account) => sum + (grouped.get(account.accountId)?.totalShares ?? 0),
    0
  );
  const totalSaves = accounts.reduce(
    (sum, account) => sum + (grouped.get(account.accountId)?.totalSaves ?? 0),
    0
  );

  const totalEngagements =
    summary.totalLikes + totalComments + totalShares + totalSaves;

  summary.averageViewsPerPost =
    summary.totalPostCount > 0
      ? Math.round(summary.totalViews / summary.totalPostCount)
      : 0;

  summary.averageLikesPerPost =
    summary.totalPostCount > 0
      ? Math.round(summary.totalLikes / summary.totalPostCount)
      : 0;

  summary.averagePostsPerDay =
    periodDays > 0 ? Number((summary.totalPostCount / periodDays).toFixed(2)) : 0;

  summary.totalEngagementRate =
    summary.totalViews > 0
      ? Number(((totalEngagements / summary.totalViews) * 100).toFixed(2))
      : 0;

  summary.averageEngagementRate =
    summary.totalPostCount > 0 && accounts.length > 0
      ? Number(
          (
            accounts.reduce((sum, account) => {
              const groupedAccount = grouped.get(account.accountId);

              if (!groupedAccount || account.totalPostCount === 0) {
                return sum;
              }

              return sum + groupedAccount.engagementRateSum / account.totalPostCount;
            }, 0) / accounts.length
          ).toFixed(2)
        )
      : 0;

  return {
    posts,
    accounts,
    summary,
    periodDays,
  };
}

function getChangePercent(current: number, previous: number) {
  if (previous === 0 && current === 0) {
    return 0;
  }

  if (previous === 0) {
    return 100;
  }

  return Number((((current - previous) / previous) * 100).toFixed(1));
}

router.get(
  "/account-summary",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const clerkUserId = getAuthenticatedClerkUserId(req);

      if (!clerkUserId) {
        return res.status(401).json({
          ok: false,
          error: "Ikke autentisert",
        });
      }

      const access = await getActiveOrganizationAccess(clerkUserId);

      const requestedAccountIds = parseAccountIds(req.query.accountIds);
      const range = getDateRangeFromRequest(req);
      const previousRange = getPreviousDateRange(range);

      const { selectedAccounts, selectedAccountIds } = await getScopedAccounts(
        access.organizationId,
        requestedAccountIds
      );

      const currentData = await getSummaryForRange(
        access.organizationId,
        selectedAccountIds,
        selectedAccounts,
        range
      );

      const previousData = await getSummaryForRange(
        access.organizationId,
        selectedAccountIds,
        selectedAccounts,
        previousRange
      );

      return res.json({
        ok: true,
        range: {
          start: range.start,
          end: range.end,
        },
        previousRange: {
          start: previousRange.start,
          end: previousRange.end,
        },
        periodDays: currentData.periodDays,
        selectedAccountIds,
        summary: {
          ...currentData.summary,
          comparison: {
            views: {
              changePercent: getChangePercent(
                currentData.summary.totalViews,
                previousData.summary.totalViews
              ),
            },
            likes: {
              changePercent: getChangePercent(
                currentData.summary.totalLikes,
                previousData.summary.totalLikes
              ),
            },
            posts: {
              changePercent: getChangePercent(
                currentData.summary.totalPostCount,
                previousData.summary.totalPostCount
              ),
            },
            engagement: {
              changePercent: getChangePercent(
                currentData.summary.totalEngagementRate,
                previousData.summary.totalEngagementRate
              ),
            },
          },
        },
        accounts: currentData.accounts,
      });
    } catch (error) {
      console.error("GET /analytics/account-summary error:", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke hente account summary",
      });
    }
  }
);

router.get("/growth", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const clerkUserId = getAuthenticatedClerkUserId(req);

    if (!clerkUserId) {
      return res.status(401).json({
        ok: false,
        error: "Ikke autentisert",
      });
    }

    const access = await getActiveOrganizationAccess(clerkUserId);

    const requestedAccountIds = parseAccountIds(req.query.accountIds);
    const range = getDateRangeFromRequest(req);

    const { selectedAccounts, selectedAccountIds } = await getScopedAccounts(
      access.organizationId,
      requestedAccountIds
    );

    const posts = (await prisma.contentPost.findMany({
      where: buildPostWhere(access.organizationId, selectedAccountIds, range),
      include: {
        socialAccount: {
          select: {
            id: true,
            accountHandle: true,
            displayName: true,
            platform: true,
            profileUrl: true,
          },
        },
        snapshots: {
          orderBy: {
            scrapedAt: "desc",
          },
          take: 1,
          select: {
            scrapedAt: true,
            views: true,
            likes: true,
            comments: true,
            shares: true,
            saves: true,
          },
        },
      },
      orderBy: {
        publishedAt: "asc",
      },
    })) as SummaryPost[];

    const dailyMap = new Map<
      string,
      {
        date: string;
        totalViews: number;
        totalLikes: number;
        totalComments: number;
        totalShares: number;
        totalSaves: number;
        totalEngagements: number;
        postCount: number;
        engagementRateSum: number;
        accounts: Map<
          string,
          {
            accountId: string;
            accountHandle: string;
            displayName: string | null;
            platform: Platform;
            totalViews: number;
            totalLikes: number;
            totalComments: number;
            totalShares: number;
            totalSaves: number;
            totalEngagements: number;
            postCount: number;
            engagementRateSum: number;
          }
        >;
      }
    >();

    for (const post of posts) {
      const latestSnapshot = post.snapshots[0];

      if (!latestSnapshot) {
        continue;
      }

      const dateKey = new Date(post.publishedAt).toISOString().split("T")[0];

      if (!dailyMap.has(dateKey)) {
        const accountMap = new Map<
          string,
          {
            accountId: string;
            accountHandle: string;
            displayName: string | null;
            platform: Platform;
            totalViews: number;
            totalLikes: number;
            totalComments: number;
            totalShares: number;
            totalSaves: number;
            totalEngagements: number;
            postCount: number;
            engagementRateSum: number;
          }
        >();

        for (const account of selectedAccounts) {
          accountMap.set(account.id, {
            accountId: account.id,
            accountHandle: account.accountHandle,
            displayName: account.displayName,
            platform: account.platform,
            totalViews: 0,
            totalLikes: 0,
            totalComments: 0,
            totalShares: 0,
            totalSaves: 0,
            totalEngagements: 0,
            postCount: 0,
            engagementRateSum: 0,
          });
        }

        dailyMap.set(dateKey, {
          date: dateKey,
          totalViews: 0,
          totalLikes: 0,
          totalComments: 0,
          totalShares: 0,
          totalSaves: 0,
          totalEngagements: 0,
          postCount: 0,
          engagementRateSum: 0,
          accounts: accountMap,
        });
      }

      const day = dailyMap.get(dateKey);

      if (!day) {
        continue;
      }

      const accountEntry = day.accounts.get(post.socialAccountId);

      if (!accountEntry) {
        continue;
      }

      const views = Number(latestSnapshot.views ?? 0);
      const likes = Number(latestSnapshot.likes ?? 0);
      const comments = Number(latestSnapshot.comments ?? 0);
      const shares = Number(latestSnapshot.shares ?? 0);
      const saves = Number(latestSnapshot.saves ?? 0);
      const engagements = likes + comments + shares + saves;
      const engagementRate = getPostEngagementRate(latestSnapshot);

      day.totalViews += views;
      day.totalLikes += likes;
      day.totalComments += comments;
      day.totalShares += shares;
      day.totalSaves += saves;
      day.totalEngagements += engagements;
      day.postCount += 1;
      day.engagementRateSum += engagementRate;

      accountEntry.totalViews += views;
      accountEntry.totalLikes += likes;
      accountEntry.totalComments += comments;
      accountEntry.totalShares += shares;
      accountEntry.totalSaves += saves;
      accountEntry.totalEngagements += engagements;
      accountEntry.postCount += 1;
      accountEntry.engagementRateSum += engagementRate;
    }

    const growth = Array.from(dailyMap.values())
      .map((day) => ({
        date: day.date,
        totalViews: day.totalViews,
        averageViewsPerPost:
          day.postCount > 0 ? Math.round(day.totalViews / day.postCount) : 0,
        totalLikes: day.totalLikes,
        averageLikesPerPost:
          day.postCount > 0 ? Math.round(day.totalLikes / day.postCount) : 0,
        totalPostCount: day.postCount,
        averagePostsPerDay: day.postCount,
        totalEngagementRate:
          day.totalViews > 0
            ? Number(((day.totalEngagements / day.totalViews) * 100).toFixed(2))
            : 0,
        averageEngagementRate:
          day.postCount > 0
            ? Number((day.engagementRateSum / day.postCount).toFixed(2))
            : 0,
        accounts: Array.from(day.accounts.values())
          .map((account) => ({
            accountId: account.accountId,
            accountHandle: account.accountHandle,
            displayName: account.displayName,
            platform: account.platform,
            totalViews: account.totalViews,
            averageViewsPerPost:
              account.postCount > 0
                ? Math.round(account.totalViews / account.postCount)
                : 0,
            totalLikes: account.totalLikes,
            averageLikesPerPost:
              account.postCount > 0
                ? Math.round(account.totalLikes / account.postCount)
                : 0,
            totalPostCount: account.postCount,
            averagePostsPerDay: account.postCount,
            totalEngagementRate:
              account.totalViews > 0
                ? Number(
                    ((account.totalEngagements / account.totalViews) * 100).toFixed(2)
                  )
                : 0,
            averageEngagementRate:
              account.postCount > 0
                ? Number((account.engagementRateSum / account.postCount).toFixed(2))
                : 0,
          }))
          .sort((a, b) => b.totalViews - a.totalViews),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return res.json({
      ok: true,
      range: {
        start: range.start,
        end: range.end,
      },
      selectedAccountIds,
      growth,
    });
  } catch (error) {
    console.error("GET /analytics/growth error:", error);

    return res.status(500).json({
      ok: false,
      error: "Kunne ikke hente growth data",
    });
  }
});

router.get(
  "/publishing-heatmap",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const clerkUserId = getAuthenticatedClerkUserId(req);
      const accountId = getSingleQueryValue(req.query.accountId);

      if (!clerkUserId) {
        return res.status(401).json({
          ok: false,
          error: "Ikke autentisert",
        });
      }

      if (!accountId) {
        return res.status(400).json({
          ok: false,
          error: "accountId er påkrevd",
        });
      }

      const access = await getActiveOrganizationAccess(clerkUserId);

      const proAccess = await getOrganizationAccess(access.organizationId);

      if (!proAccess.ok) {
        return res.status(404).json({
          ok: false,
          error: "Fant ikke workspace",
        });
      }

      if (!proAccess.hasProAccess) {
        return res.status(403).json({
          ok: false,
          error: "Denne funksjonen krever Pro-abonnement",
          code: "PRO_REQUIRED",
          subscription: proAccess.subscription
            ? {
                plan: proAccess.subscription.plan,
                status: proAccess.subscription.status,
                currentPeriodEnd: proAccess.subscription.currentPeriodEnd,
              }
            : null,
        });
      }

      const account = await prisma.socialAccount.findFirst({
        where: {
          id: accountId,
          organizationId: access.organizationId,
          isActive: true,
        },
        select: {
          id: true,
          accountHandle: true,
          displayName: true,
          platform: true,
        },
      });

      if (!account) {
        return res.status(404).json({
          ok: false,
          error: "Fant ikke konto",
        });
      }

      const posts = (await prisma.contentPost.findMany({
        where: {
          organizationId: access.organizationId,
          socialAccountId: accountId,
        },
        include: {
          snapshots: {
            orderBy: {
              scrapedAt: "asc",
            },
            select: {
              scrapedAt: true,
              views: true,
            },
          },
        },
        orderBy: {
          publishedAt: "asc",
        },
      })) as HeatmapPost[];

      const grid = Array.from({ length: 4 }, (_, timeSlotIndex) =>
        Array.from({ length: 7 }, (_, weekdayIndex) => ({
          weekdayIndex,
          timeSlotIndex,
          snapshotViews: [] as number[],
        }))
      );

      for (const post of posts) {
        const snapshots = Array.isArray(post.snapshots) ? post.snapshots : [];

        if (snapshots.length === 0) {
          continue;
        }

        const targetDate = getTargetDateSevenDaysAfterPublished(post.publishedAt);
        const selectedSnapshot = getSnapshotClosestToTarget(snapshots, targetDate);

        if (!selectedSnapshot) {
          continue;
        }

        const views = Number(selectedSnapshot.views ?? 0);
        const weekdayIndex = getOsloWeekdayIndex(post.publishedAt);
        const hour = getOsloHour(post.publishedAt);
        const timeSlotIndex = getTimeSlotIndexFromHour(hour);

        grid[timeSlotIndex][weekdayIndex].snapshotViews.push(views);
      }

      const cells = grid.flat().map((cell) => {
        const postCount = cell.snapshotViews.length;
        const hasEnoughData = postCount >= 5;
        const medianViews = postCount > 0 ? getMedian(cell.snapshotViews) : 0;

        return {
          weekdayIndex: cell.weekdayIndex,
          timeSlotIndex: cell.timeSlotIndex,
          averageViews: medianViews,
          postCount,
          hasEnoughData,
        };
      });

      return res.json({
        ok: true,
        account,
        cells,
      });
    } catch (error) {
      console.error("GET /analytics/publishing-heatmap error:", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke hente publishing heatmap",
      });
    }
  }
);

router.get(
  "/top-posts-leaderboard",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const clerkUserId = getAuthenticatedClerkUserId(req);

      if (!clerkUserId) {
        return res.status(401).json({
          ok: false,
          error: "Ikke autentisert",
        });
      }

      const access = await getActiveOrganizationAccess(clerkUserId);

      const requestedAccountIds = parseAccountIds(req.query.accountIds);
      const end = endOfDay(new Date());
      const start = startOfDay(new Date());
      start.setDate(start.getDate() - 29);

      const { selectedAccountIds } = await getScopedAccounts(
        access.organizationId,
        requestedAccountIds
      );

      const posts = (await prisma.contentPost.findMany({
        where: buildPostWhere(access.organizationId, selectedAccountIds, {
          start,
          end,
        }),
        include: {
          socialAccount: {
            select: {
              id: true,
              accountHandle: true,
              displayName: true,
              platform: true,
              profileUrl: true,
            },
          },
          snapshots: {
            orderBy: {
              scrapedAt: "desc",
            },
            take: 1,
            select: {
              scrapedAt: true,
              views: true,
              likes: true,
              comments: true,
              shares: true,
              saves: true,
            },
          },
        },
      })) as SummaryPost[];

      const mappedPosts = posts.reduce<
        Array<{
          id: string;
          caption: string;
          url: string;
          thumbnailUrl: string;
          platform: Platform;
          stats: {
            views: number;
            likes: number;
            comments: number;
            shares: number;
            saves: number;
            engagementRate: number;
            bestPerformingScore: number;
          };
        }>
      >((acc, post) => {
        const latestSnapshot = post.snapshots[0];

        if (!latestSnapshot) {
          return acc;
        }

        const views = Number(latestSnapshot.views ?? 0);
        const likes = Number(latestSnapshot.likes ?? 0);
        const comments = Number(latestSnapshot.comments ?? 0);
        const shares = Number(latestSnapshot.shares ?? 0);
        const saves = Number(latestSnapshot.saves ?? 0);
        const engagementRate = getPostEngagementRate(latestSnapshot);

        const bestPerformingScore = Number(
          (
            views * 0.4 +
            likes * 0.25 +
            comments * 0.2 +
            shares * 0.15
          ).toFixed(2)
        );

        acc.push({
          id: post.id,
          caption: post.caption ?? "",
          url: post.url ?? "",
          thumbnailUrl: post.thumbnailUrl ?? "",
          platform: post.socialAccount.platform,
          stats: {
            views,
            likes,
            comments,
            shares,
            saves,
            engagementRate,
            bestPerformingScore,
          },
        });

        return acc;
      }, []);

      const topBestPerforming =
        mappedPosts.length > 0
          ? [...mappedPosts].sort(
              (a, b) => b.stats.bestPerformingScore - a.stats.bestPerformingScore
            )[0]
          : null;

      const topViews =
        mappedPosts.length > 0
          ? [...mappedPosts].sort((a, b) => b.stats.views - a.stats.views)[0]
          : null;

      const topLikes =
        mappedPosts.length > 0
          ? [...mappedPosts].sort((a, b) => b.stats.likes - a.stats.likes)[0]
          : null;

      const topComments =
        mappedPosts.length > 0
          ? [...mappedPosts].sort((a, b) => b.stats.comments - a.stats.comments)[0]
          : null;

      return res.json({
        ok: true,
        periodLabel: "Siste 30 dager",
        leaders: {
          bestPerforming: topBestPerforming,
          views: topViews,
          likes: topLikes,
          comments: topComments,
        },
      });
    } catch (error) {
      console.error("GET /analytics/top-posts-leaderboard error:", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke hente leaderboard",
      });
    }
  }
);

router.get(
  "/published-content",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const clerkUserId = getAuthenticatedClerkUserId(req);

      if (!clerkUserId) {
        return res.status(401).json({
          ok: false,
          error: "Ikke autentisert",
        });
      }

      const access = await getActiveOrganizationAccess(clerkUserId);

      const requestedAccountIds = parseAccountIds(req.query.accountIds);
      const { selectedAccountIds } = await getScopedAccounts(
        access.organizationId,
        requestedAccountIds
      );

      const query = getSingleQueryValue(req.query.q).toLowerCase();
      const sortBy = getSingleQueryValue(req.query.sortBy) || "publishedAt";
      const sortOrder =
        getSingleQueryValue(req.query.sortOrder).toLowerCase() === "asc"
          ? "asc"
          : "desc";

      const posts = (await prisma.contentPost.findMany({
        where: buildPostWhere(access.organizationId, selectedAccountIds),
        include: {
          socialAccount: {
            select: {
              id: true,
              accountHandle: true,
              displayName: true,
              platform: true,
              profileUrl: true,
            },
          },
          snapshots: {
            orderBy: {
              scrapedAt: "desc",
            },
            take: 1,
            select: {
              scrapedAt: true,
              views: true,
              likes: true,
              comments: true,
              shares: true,
              saves: true,
            },
          },
        },
        orderBy: {
          publishedAt: "desc",
        },
      })) as SummaryPost[];

      const mappedPosts = posts
        .map((post) => {
          const latestSnapshot = post.snapshots[0];
          const views = Number(latestSnapshot?.views ?? 0);
          const likes = Number(latestSnapshot?.likes ?? 0);
          const comments = Number(latestSnapshot?.comments ?? 0);
          const shares = Number(latestSnapshot?.shares ?? 0);
          const saves = Number(latestSnapshot?.saves ?? 0);

          const engagements = likes + comments + shares + saves;
          const engagementRate =
            views > 0 ? Number(((engagements / views) * 100).toFixed(2)) : 0;

          return {
            id: post.id,
            url: post.url ?? "",
            thumbnailUrl: post.thumbnailUrl ?? "",
            caption: post.caption ?? "",
            publishedAt: post.publishedAt,
            platform: post.socialAccount.platform,
            latestSnapshot: {
              views,
              likes,
              comments,
            },
            engagementRate,
          };
        })
        .filter((post) => {
          if (!query) {
            return true;
          }

          return post.caption.toLowerCase().includes(query);
        })
        .sort((a, b) => {
          const direction = sortOrder === "asc" ? 1 : -1;

          if (sortBy === "views") {
            return (a.latestSnapshot.views - b.latestSnapshot.views) * direction;
          }

          if (sortBy === "likes") {
            return (a.latestSnapshot.likes - b.latestSnapshot.likes) * direction;
          }

          if (sortBy === "comments") {
            return (a.latestSnapshot.comments - b.latestSnapshot.comments) * direction;
          }

          if (sortBy === "engagementRate") {
            return (a.engagementRate - b.engagementRate) * direction;
          }

          return (
            (new Date(a.publishedAt).getTime() -
              new Date(b.publishedAt).getTime()) *
            direction
          );
        });

      return res.json({
        ok: true,
        count: mappedPosts.length,
        q: query,
        sortBy,
        sortOrder,
        posts: mappedPosts,
      });
    } catch (error) {
      console.error("GET /analytics/published-content error:", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke hente publisert innhold",
      });
    }
  }
);

router.get("/top-posts", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const clerkUserId = getAuthenticatedClerkUserId(req);

    if (!clerkUserId) {
      return res.status(401).json({
        ok: false,
        error: "Ikke autentisert",
      });
    }

    const access = await getActiveOrganizationAccess(clerkUserId);

    const requestedAccountIds = parseAccountIds(req.query.accountIds);
    const range = getDateRangeFromRequest(req);
    const rawLimit = Number(getSingleQueryValue(req.query.limit) || 10);
    const limit = Math.min(Math.max(rawLimit, 1), 100);
    const sortBy = getSingleQueryValue(req.query.sortBy) || "views";
    const minViralScore = Number(getSingleQueryValue(req.query.minViralScore) || 0);
    const minEngagementRate = Number(
      getSingleQueryValue(req.query.minEngagementRate) || 0
    );

    const { selectedAccountIds } = await getScopedAccounts(
      access.organizationId,
      requestedAccountIds
    );

    const posts = (await prisma.contentPost.findMany({
      where: buildPostWhere(access.organizationId, selectedAccountIds, range),
      include: {
        socialAccount: {
          select: {
            id: true,
            accountHandle: true,
            displayName: true,
            platform: true,
            profileUrl: true,
          },
        },
        snapshots: {
          orderBy: {
            scrapedAt: "desc",
          },
          take: 1,
          select: {
            scrapedAt: true,
            views: true,
            likes: true,
            comments: true,
            shares: true,
            saves: true,
          },
        },
      },
    })) as SummaryPost[];

    const accountStats = new Map<
      string,
      {
        totalViews: number;
        postCount: number;
        averageViewsPerPost: number;
      }
    >();

    for (const post of posts) {
      const latestSnapshot = post.snapshots[0];
      const accountId = post.socialAccount.id;
      const views = Number(latestSnapshot?.views ?? 0);

      if (!accountStats.has(accountId)) {
        accountStats.set(accountId, {
          totalViews: 0,
          postCount: 0,
          averageViewsPerPost: 0,
        });
      }

      const stats = accountStats.get(accountId);

      if (!stats) {
        continue;
      }

      stats.totalViews += views;
      stats.postCount += 1;
    }

    for (const [, stats] of accountStats.entries()) {
      stats.averageViewsPerPost =
        stats.postCount > 0 ? stats.totalViews / stats.postCount : 0;
    }

    const mapped = posts
      .map((post) => {
        const latestSnapshot = post.snapshots[0];
        const accountId = post.socialAccount.id;
        const stats = accountStats.get(accountId);

        const views = Number(latestSnapshot?.views ?? 0);
        const likes = Number(latestSnapshot?.likes ?? 0);
        const comments = Number(latestSnapshot?.comments ?? 0);
        const shares = Number(latestSnapshot?.shares ?? 0);
        const saves = Number(latestSnapshot?.saves ?? 0);

        const engagements = likes + comments + shares + saves;
        const engagementRate =
          views > 0 ? Number(((engagements / views) * 100).toFixed(2)) : 0;

        const viralScore =
          stats && stats.averageViewsPerPost > 0
            ? Number((views / stats.averageViewsPerPost).toFixed(2))
            : 0;

        return {
          id: post.id,
          externalPostId: post.externalPostId,
          platform: post.platform,
          caption: post.caption,
          tags: post.tags,
          publishedAt: post.publishedAt,
          url: post.url,
          thumbnailUrl: post.thumbnailUrl,
          durationSeconds: post.durationSeconds,
          viralScore,
          engagementRate,
          account: {
            id: post.socialAccount.id,
            accountHandle: post.socialAccount.accountHandle,
            displayName: post.socialAccount.displayName,
            platform: post.socialAccount.platform,
            profileUrl: post.socialAccount.profileUrl,
            averageViewsPerPost: stats
              ? Math.round(stats.averageViewsPerPost)
              : 0,
          },
          latestSnapshot: latestSnapshot
            ? {
                views,
                likes,
                comments,
                shares,
                saves,
                scrapedAt: latestSnapshot.scrapedAt,
              }
            : null,
        };
      })
      .filter((post) => post.viralScore >= minViralScore)
      .filter((post) => post.engagementRate >= minEngagementRate)
      .sort((a, b) => {
        if (sortBy === "viralScore") {
          return b.viralScore - a.viralScore;
        }

        if (sortBy === "engagementRate") {
          return b.engagementRate - a.engagementRate;
        }

        if (sortBy === "likes") {
          return (b.latestSnapshot?.likes ?? 0) - (a.latestSnapshot?.likes ?? 0);
        }

        if (sortBy === "comments") {
          return (
            (b.latestSnapshot?.comments ?? 0) - (a.latestSnapshot?.comments ?? 0)
          );
        }

        if (sortBy === "shares") {
          return (b.latestSnapshot?.shares ?? 0) - (a.latestSnapshot?.shares ?? 0);
        }

        return (b.latestSnapshot?.views ?? 0) - (a.latestSnapshot?.views ?? 0);
      })
      .slice(0, limit);

    return res.json({
      ok: true,
      count: mapped.length,
      sortBy,
      minViralScore,
      minEngagementRate,
      range,
      selectedAccountIds,
      posts: mapped,
    });
  } catch (error) {
    console.error("GET /analytics/top-posts error:", error);

    return res.status(500).json({
      ok: false,
      error: "Kunne ikke hente top posts",
    });
  }
});

export default router;