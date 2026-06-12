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

type InsightItem = {
  id: string;
  title: string;
  value: string;
  description: string;
  href?: string;
  actionLabel?: string;
};

type DurationBucketKey =
  | "0_7"
  | "8_15"
  | "16_30"
  | "31_45"
  | "46_60"
  | "60_plus";

type PostMetric = {
  id: string;
  platform: Platform;
  captionBucket: "short" | "long";
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
  responsePer100Views: number;
  durationSeconds: number | null;
  durationBucket: DurationBucketKey | null;
  url: string | null;
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

function formatDecimal(value: number, decimals = 1) {
  return value.toFixed(decimals).replace(".", ",");
}

function getPeriodLabel(period: Period) {
  if (period === "7") return "siste 7 dagene";
  if (period === "30") return "siste 30 dagene";
  if (period === "90") return "siste 90 dagene";
  return "valgt periode";
}

function getCaptionBucket(caption: string | null | undefined): "short" | "long" {
  const length = (caption ?? "").trim().length;
  return length <= 80 ? "short" : "long";
}

function getDurationBucket(seconds: number | null | undefined): DurationBucketKey | null {
  if (seconds == null || seconds <= 0) return null;
  if (seconds <= 7) return "0_7";
  if (seconds <= 15) return "8_15";
  if (seconds <= 30) return "16_30";
  if (seconds <= 45) return "31_45";
  if (seconds <= 60) return "46_60";
  return "60_plus";
}

function getDurationBucketLabel(bucket: DurationBucketKey) {
  const labels: Record<DurationBucketKey, string> = {
    "0_7": "0–7 sek",
    "8_15": "8–15 sek",
    "16_30": "16–30 sek",
    "31_45": "31–45 sek",
    "46_60": "46–60 sek",
    "60_plus": "60+ sek",
  };

  return labels[bucket];
}

function getEngagementRate(snapshot: {
  engagementRate: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
}) {
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

function getPlatformLabel(platform: Platform) {
  if (platform === Platform.TIKTOK) return "TikTok";
  if (platform === Platform.INSTAGRAM) return "Instagram";
  return platform;
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
    const periodLabel = getPeriodLabel(period);
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
      select: {
        id: true,
        caption: true,
        url: true,
        durationSeconds: true,
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

    const postMetrics = posts.reduce<PostMetric[]>((acc, post) => {
      const latestSnapshot = post.snapshots[0];

      if (!latestSnapshot) {
        return acc;
      }

      const views = Number(latestSnapshot.views ?? 0);
      const likes = Number(latestSnapshot.likes ?? 0);
      const comments = Number(latestSnapshot.comments ?? 0);
      const shares = Number(latestSnapshot.shares ?? 0);
      const saves = Number(latestSnapshot.saves ?? 0);

      acc.push({
        id: post.id,
        platform: post.socialAccount.platform,
        captionBucket: getCaptionBucket(post.caption),
        views,
        likes,
        comments,
        shares,
        saves,
        engagementRate: getEngagementRate(latestSnapshot),
        responsePer100Views: views > 0 ? ((likes + comments) / views) * 100 : 0,
        durationSeconds: post.durationSeconds,
        durationBucket: getDurationBucket(post.durationSeconds),
        url: post.url,
      });

      return acc;
    }, []);

    if (postMetrics.length === 0) {
      return res.json({
        ok: true,
        insights: [],
      });
    }

    const insights: InsightItem[] = [];
    const totalViews = postMetrics.reduce((sum, post) => sum + post.views, 0);
    const totalLikes = postMetrics.reduce((sum, post) => sum + post.likes, 0);
    const totalComments = postMetrics.reduce((sum, post) => sum + post.comments, 0);
    const sortedByViews = [...postMetrics].sort((a, b) => b.views - a.views);

    const averageLikesPer100Views = totalViews > 0 ? (totalLikes / totalViews) * 100 : 0;
    const averageCommentsPer100Views =
      totalViews > 0 ? (totalComments / totalViews) * 100 : 0;

    const averageAudienceEngagementPer100Views =
      averageLikesPer100Views + averageCommentsPer100Views;

    insights.push({
      id: "audience_response",
      title: "Publikumsrespons",
      value: `${formatDecimal(averageAudienceEngagementPer100Views)} % engasjement`,
      description: `Gjennomsnittlig ${periodLabel} fikk du ${formatDecimal(
        averageLikesPer100Views
      )} likes og ${formatDecimal(
        averageCommentsPer100Views
      )} kommentarer per 100 views.`,
    });

    const durationStats = postMetrics.reduce(
      (acc, post) => {
        if (!post.durationBucket) {
          return acc;
        }

        const current = acc.get(post.durationBucket) ?? {
          count: 0,
          views: [] as number[],
        };

        current.count += 1;
        current.views.push(post.views);

        acc.set(post.durationBucket, current);

        return acc;
      },
      new Map<DurationBucketKey, { count: number; views: number[] }>()
    );

    const durationCandidates = [...durationStats.entries()]
      .map(([bucket, stats]) => ({
        bucket,
        count: stats.count,
        averageViews: average(stats.views),
      }))
      .filter((item) => item.count >= 2)
      .sort((a, b) => b.averageViews - a.averageViews);

    if (durationCandidates.length > 0) {
      const winner = durationCandidates[0];

      insights.push({
        id: "best_video_length",
        title: "Beste lengde",
        value: getDurationBucketLabel(winner.bucket),
        description: `Videoer på ${getDurationBucketLabel(
          winner.bucket
        )} fikk høyest snittvisninger ${periodLabel}, basert på ${winner.count} videoer.`,
      });
    }

    const topViewIds = new Set(sortedByViews.slice(0, 3).map((post) => post.id));
    const averageResponsePer100Views = average(
      postMetrics
        .filter((post) => post.views > 0)
        .map((post) => post.responsePer100Views)
    );

    const analysisCandidate = postMetrics
      .filter((post) => post.url)
      .filter((post) => !topViewIds.has(post.id))
      .filter((post) => post.views >= 100)
      .map((post) => ({
        ...post,
        responseMultiplier:
          averageResponsePer100Views > 0
            ? post.responsePer100Views / averageResponsePer100Views
            : 0,
      }))
      .filter((post) => post.responseMultiplier >= 1.5)
      .sort((a, b) => b.responseMultiplier - a.responseMultiplier)[0];

    if (analysisCandidate?.url) {
      insights.push({
        id: "analyze_this_post",
        title: "Analyser denne",
        value: `${formatDecimal(analysisCandidate.responseMultiplier)}x høyere respons`,
        description: `Denne videoen fikk ${formatDecimal(
          analysisCandidate.responseMultiplier
        )}x flere likes og kommentarer per 100 views enn snittet ${periodLabel}.`,
        href: analysisCandidate.url,
        actionLabel: "Åpne video",
      });
    }

    const captionStats = postMetrics.reduce(
      (acc, post) => {
        acc[post.captionBucket].count += 1;
        acc[post.captionBucket].engagementRates.push(post.engagementRate);
        return acc;
      },
      {
        short: { count: 0, engagementRates: [] as number[] },
        long: { count: 0, engagementRates: [] as number[] },
      }
    );

    if (captionStats.short.count >= 3 && captionStats.long.count >= 3) {
      const shortAvgEngagement = average(captionStats.short.engagementRates);
      const longAvgEngagement = average(captionStats.long.engagementRates);

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
        } captions ga ${formatDecimal(diffPercent)} % høyere engasjement.`,
      });
    }

    const topTwentyPercentCount = Math.max(1, Math.ceil(postMetrics.length * 0.2));
    const topTwentyPercentViews = sortedByViews
      .slice(0, topTwentyPercentCount)
      .reduce((sum, post) => sum + post.views, 0);
    const concentrationShare = totalViews > 0 ? (topTwentyPercentViews / totalViews) * 100 : 0;

    insights.push({
      id: "view_concentration",
      title: "Konsentrasjon",
      value: `${formatDecimal(concentrationShare)} %`,
      description: `De beste ${topTwentyPercentCount} innleggene sto for denne andelen av totale views.`,
    });

    const platformTotals = postMetrics.reduce((acc, post) => {
      acc.set(post.platform, (acc.get(post.platform) ?? 0) + post.views);
      return acc;
    }, new Map<Platform, number>());

    if (platformTotals.size > 1) {
      const [winnerPlatform, winnerViews] = [...platformTotals.entries()].sort(
        (a, b) => b[1] - a[1]
      )[0];
      const winnerShare = totalViews > 0 ? (winnerViews / totalViews) * 100 : 0;
      const platformLabel = getPlatformLabel(winnerPlatform);

      insights.push({
        id: "platform_share",
        title: "Plattformfordeling",
        value: platformLabel,
        description: `${platformLabel} sto for ${formatDecimal(
          winnerShare
        )} % av totale views i valgt periode.`,
      });
    }

    return res.json({
      ok: true,
      insights: insights.slice(0, 5),
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
