import { Router } from "express";
import { Platform } from "@prisma/client";
import { prisma } from "../prisma";
import { getActiveOrganizationAccess } from "../services/getActiveOrganizationAccess";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middleware/requireAuth";

const router = Router();

type Period = "7" | "30" | "90" | "custom";

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
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  const single = String(value ?? "").trim();

  if (!single) {
    return [];
  }

  return single
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isValidPeriod(value: string): value is Period {
  return value === "7" || value === "30" || value === "90" || value === "custom";
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

function getDateRange(
  period: Period,
  from?: string,
  to?: string
): { start: Date; end: Date } {
  const now = new Date();

  if (period === "custom") {
    const parsedFrom = parseISODateInput(from);
    const parsedTo = parseISODateInput(to);

    if (parsedFrom && parsedTo) {
      return {
        start: startOfDay(parsedFrom),
        end: endOfDay(parsedTo),
      };
    }

    if (parsedFrom && !parsedTo) {
      return {
        start: startOfDay(parsedFrom),
        end: endOfDay(now),
      };
    }

    if (!parsedFrom && parsedTo) {
      const fallbackStart = new Date(parsedTo);
      fallbackStart.setDate(fallbackStart.getDate() - 29);

      return {
        start: startOfDay(fallbackStart),
        end: endOfDay(parsedTo),
      };
    }
  }

  const days = period === "7" ? 7 : period === "90" ? 90 : 30;

  const end = endOfDay(now);
  const start = startOfDay(new Date());
  start.setDate(start.getDate() - (days - 1));

  return { start, end };
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getLatestViews(post: {
  snapshots: Array<{ views: number | null }>;
}) {
  return Number(post.snapshots[0]?.views ?? 0);
}

function getLatestEngagementRate(post: {
  snapshots: Array<{
    engagementRate: number | null;
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    saves: number | null;
  }>;
}) {
  const snapshot = post.snapshots[0];

  if (!snapshot) {
    return 0;
  }

  if (snapshot.engagementRate != null) {
    return Number(snapshot.engagementRate);
  }

  const views = Number(snapshot.views ?? 0);

  if (views <= 0) {
    return 0;
  }

  const engagements =
    Number(snapshot.likes ?? 0) +
    Number(snapshot.comments ?? 0) +
    Number(snapshot.shares ?? 0) +
    Number(snapshot.saves ?? 0);

  return Number(((engagements / views) * 100).toFixed(2));
}

function getCaptionBucket(caption: string | null | undefined) {
  const length = (caption ?? "").trim().length;
  return length <= 80 ? "short" : "long";
}

router.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const clerkUserId = getAuthenticatedClerkUserId(req);
    const periodRaw = getSingleQueryValue(req.query.period);
    const from = getSingleQueryValue(req.query.from);
    const to = getSingleQueryValue(req.query.to);
    const requestedAccountIds = parseAccountIds(req.query.accountIds);

    if (!clerkUserId) {
      return res.status(401).json({
        ok: false,
        error: "Ikke autentisert",
      });
    }

    const period: Period = isValidPeriod(periodRaw) ? periodRaw : "30";
    const access = await getActiveOrganizationAccess(clerkUserId);
    const range = getDateRange(period, from, to);

    const accounts = await prisma.socialAccount.findMany({
      where: {
        organizationId: access.organizationId,
        isActive: true,
      },
      select: {
        id: true,
        platform: true,
      },
    });

    const selectedAccountIds =
      requestedAccountIds.length > 0
        ? accounts
            .filter((account) => requestedAccountIds.includes(account.id))
            .map((account) => account.id)
        : accounts.map((account) => account.id);

    if (selectedAccountIds.length === 0) {
      return res.json({
        ok: true,
        insights: [],
      });
    }

    const posts = await prisma.contentPost.findMany({
      where: {
        organizationId: access.organizationId,
        socialAccountId: {
          in: selectedAccountIds,
        },
        publishedAt: {
          gte: range.start,
          lte: range.end,
        },
      },
      include: {
        socialAccount: {
          select: {
            platform: true,
          },
        },
        snapshots: {
          orderBy: {
            scrapedAt: "desc",
          },
          take: 1,
          select: {
            views: true,
            engagementRate: true,
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
    });

    const validPosts = posts.filter((post) => post.snapshots.length > 0);

    if (validPosts.length === 0) {
      return res.json({
        ok: true,
        insights: [],
      });
    }

    const insights: Array<{
      id: string;
      title: string;
      value: string;
      description: string;
    }> = [];

    const totalViews = validPosts.reduce((sum, post) => {
      return sum + getLatestViews(post);
    }, 0);

    const sortedByViews = [...validPosts].sort((a, b) => {
      return getLatestViews(b) - getLatestViews(a);
    });

    const topThreeViews = sortedByViews.slice(0, 3).reduce((sum, post) => {
      return sum + getLatestViews(post);
    }, 0);

    const topThreeShare = totalViews > 0 ? (topThreeViews / totalViews) * 100 : 0;

    insights.push({
      id: "top_content_share",
      title: "Toppinnhold",
      value: `${topThreeShare.toFixed(1).replace(".", ",")} %`,
      description: "De 3 beste innleggene sto for denne andelen av totale views.",
    });

    const shortCaptionPosts = validPosts.filter(
      (post) => getCaptionBucket(post.caption) === "short"
    );
    const longCaptionPosts = validPosts.filter(
      (post) => getCaptionBucket(post.caption) === "long"
    );

    if (shortCaptionPosts.length >= 3 && longCaptionPosts.length >= 3) {
      const shortAvgEngagement = average(
        shortCaptionPosts.map((post) => getLatestEngagementRate(post))
      );
      const longAvgEngagement = average(
        longCaptionPosts.map((post) => getLatestEngagementRate(post))
      );

      const shortIsBetter = shortAvgEngagement > longAvgEngagement;
      const best = shortIsBetter ? shortAvgEngagement : longAvgEngagement;
      const other = shortIsBetter ? longAvgEngagement : shortAvgEngagement;

      const diffPercent = other > 0 ? ((best - other) / other) * 100 : 0;

      insights.push({
        id: "caption_length",
        title: "Caption-lengde",
        value: shortIsBetter ? "Korte captions" : "Lange captions",
        description: `${
          shortIsBetter ? "Korte" : "Lange"
        } captions ga ${diffPercent.toFixed(1).replace(".", ",")} % høyere engasjement.`,
      });
    }

    const topTwentyPercentCount = Math.max(1, Math.ceil(validPosts.length * 0.2));

    const topTwentyPercentViews = sortedByViews
      .slice(0, topTwentyPercentCount)
      .reduce((sum, post) => sum + getLatestViews(post), 0);

    const concentrationShare =
      totalViews > 0 ? (topTwentyPercentViews / totalViews) * 100 : 0;

    insights.push({
      id: "view_concentration",
      title: "Konsentrasjon",
      value: `${concentrationShare.toFixed(1).replace(".", ",")} %`,
      description: `De beste ${topTwentyPercentCount} innleggene sto for denne andelen av totale views.`,
    });

    const uniquePlatforms = Array.from(
      new Set(validPosts.map((post) => post.socialAccount.platform))
    ) as Platform[];

    if (uniquePlatforms.length > 1) {
      const platformTotals = uniquePlatforms.map((platform) => {
        const platformPosts = validPosts.filter(
          (post) => post.socialAccount.platform === platform
        );

        const views = platformPosts.reduce((sum, post) => {
          return sum + getLatestViews(post);
        }, 0);

        return {
          platform,
          views,
        };
      });

      platformTotals.sort((a, b) => b.views - a.views);

      const winner = platformTotals[0];
      const winnerShare =
        totalViews > 0 ? (winner.views / totalViews) * 100 : 0;

      insights.push({
        id: "platform_share",
        title: "Plattformfordeling",
        value: winner.platform === Platform.TIKTOK ? "TikTok" : "Instagram",
        description: `${
          winner.platform === Platform.TIKTOK ? "TikTok" : "Instagram"
        } sto for ${winnerShare.toFixed(1).replace(".", ",")} % av totale views i valgt periode.`,
      });
    }

    return res.json({
      ok: true,
      insights: insights.slice(0, 3),
    });
  } catch (error) {
    console.error("Insights error:", error);

    return res.status(500).json({
      ok: false,
      error: "Kunne ikke hente insights",
    });
  }
});

export default router;