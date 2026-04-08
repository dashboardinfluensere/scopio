import { Router } from "express";
import { randomUUID } from "crypto";
import { ScrapeJobStatus, ScrapeJobType } from "@prisma/client";
import { prisma } from "../prisma";
import { runApifyTaskForProfile } from "../services/apify";
import { logAdminEvent } from "../services/adminLogs";

const router = Router();

function getPublishedAt(
  post: {
    createTimeISO?: string;
    createTime?: number;
  },
  fallbackDate: Date
): Date {
  if (post.createTimeISO) {
    return new Date(post.createTimeISO);
  }

  if (post.createTime) {
    return new Date(post.createTime * 1000);
  }

  return fallbackDate;
}

router.use(async (req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    await logAdminEvent({
      actorUserId: null,
      actorEmail: "system:dev-route-block",
      action: "DEV_ROUTE_BLOCKED_IN_PRODUCTION",
      targetType: "dev_route",
      targetId: req.path,
      metadata: {
        method: req.method,
        originalUrl: req.originalUrl,
        ip:
          req.ip ||
          (typeof req.headers["x-forwarded-for"] === "string"
            ? req.headers["x-forwarded-for"]
            : null),
      },
    });

    return res.status(404).json({
      ok: false,
      error: "Fant ikke route",
    });
  }

  return next();
});

router.post("/run-next-scrape-job", async (_req, res) => {
  try {
    const pendingJob = await prisma.scrapeJob.findFirst({
      where: {
        status: ScrapeJobStatus.PENDING,
      },
      orderBy: {
        createdAt: "asc",
      },
      include: {
        socialAccount: true,
      },
    });

    if (!pendingJob) {
      return res.status(404).json({
        ok: false,
        error: "Fant ingen pending scrape job",
      });
    }

    const startedAt = new Date();

    await prisma.scrapeJob.update({
      where: {
        id: pendingJob.id,
      },
      data: {
        status: ScrapeJobStatus.RUNNING,
        startedAt,
      },
    });

    const socialAccount = pendingJob.socialAccount;
    const organizationId = pendingJob.organizationId;
    const now = new Date();

    const isInitialJob = pendingJob.type === ScrapeJobType.INITIAL;
    const lookbackDays = isInitialJob ? 90 : 7;
    const resultsPerPage = isInitialJob ? 120 : 30;

    const since = new Date();
    since.setDate(since.getDate() - lookbackDays);

    const apifyPosts = await runApifyTaskForProfile(
      socialAccount.accountHandle,
      resultsPerPage
    );

    console.log("FIRST APIFY POST SAMPLE:");
    console.log(JSON.stringify(apifyPosts[0], null, 2));

    const filteredApifyPosts = apifyPosts.filter((post) => {
      const publishedAt = getPublishedAt(post, now);
      return publishedAt >= since;
    });

    console.log(
      `Apify posts found: ${apifyPosts.length}, after ${lookbackDays}-day filter: ${filteredApifyPosts.length}`
    );

    const scrapedPosts = filteredApifyPosts.map((post: any) => {
      const publishedAt = getPublishedAt(post, now);

      const externalPostId =
        post.webVideoUrl?.split("/video/")[1]?.split("?")[0] ?? randomUUID();

      const thumbnailUrl =
        post.imageUrl ??
        post.thumbnailUrl ??
        post.videoMeta?.coverUrl ??
        null;

      return {
        externalPostId,
        caption: post.text ?? "",
        url: post.webVideoUrl ?? "",
        thumbnailUrl,
        publishedAt,
        durationSeconds: post.videoMeta?.duration ?? null,
        tags: [],
        views: post.playCount ?? 0,
        likes: post.diggCount ?? 0,
        comments: post.commentCount ?? 0,
        shares: post.shareCount ?? 0,
        saves: post.collectCount ?? 0,
      };
    });

    const createdPosts: Array<{
      id: string;
      externalPostId: string;
    }> = [];

    for (const item of scrapedPosts) {
      const post = await prisma.contentPost.upsert({
        where: {
          socialAccountId_externalPostId: {
            socialAccountId: socialAccount.id,
            externalPostId: item.externalPostId,
          },
        },
        update: {
          caption: item.caption,
          url: item.url,
          thumbnailUrl: item.thumbnailUrl,
          publishedAt: item.publishedAt,
          durationSeconds: item.durationSeconds,
          tags: item.tags,
        },
        create: {
          organizationId,
          socialAccountId: socialAccount.id,
          platform: socialAccount.platform,
          externalPostId: item.externalPostId,
          caption: item.caption,
          url: item.url,
          thumbnailUrl: item.thumbnailUrl,
          publishedAt: item.publishedAt,
          durationSeconds: item.durationSeconds,
          tags: item.tags,
        },
      });

      await prisma.postSnapshot.create({
        data: {
          organizationId,
          contentPostId: post.id,
          scrapedAt: now,
          views: item.views,
          likes: item.likes,
          comments: item.comments,
          shares: item.shares,
          saves: item.saves,
          engagementRate:
            item.views > 0
              ? Number(
                  (
                    ((item.likes +
                      item.comments +
                      item.shares +
                      item.saves) /
                      item.views) *
                    100
                  ).toFixed(2)
                )
              : 0,
        },
      });

      createdPosts.push({
        id: post.id,
        externalPostId: post.externalPostId,
      });
    }

    await prisma.socialAccount.update({
      where: {
        id: socialAccount.id,
      },
      data: {
        needsInitialSync: false,
        lastSyncedAt: now,
      },
    });

    const finishedJob = await prisma.scrapeJob.update({
      where: {
        id: pendingJob.id,
      },
      data: {
        status: ScrapeJobStatus.COMPLETED,
        finishedAt: new Date(),
      },
    });

    await logAdminEvent({
      actorUserId: null,
      actorEmail: "system:dev-route",
      action: "DEV_RUN_NEXT_SCRAPE_JOB",
      targetType: "scrape_job",
      targetId: finishedJob.id,
      organizationId,
      metadata: {
        socialAccountId: socialAccount.id,
        accountHandle: socialAccount.accountHandle,
        platform: socialAccount.platform,
        lookbackDays,
        apifyPostsFound: apifyPosts.length,
        filteredPostsCount: scrapedPosts.length,
      },
    });

    return res.status(200).json({
      ok: true,
      message: `Scrape job kjørt ferdig (${pendingJob.type})`,
      scrapeJob: finishedJob,
      socialAccount: {
        id: socialAccount.id,
        accountHandle: socialAccount.accountHandle,
        platform: socialAccount.platform,
      },
      lookbackDays,
      apifyPostsFound: apifyPosts.length,
      filteredPostsCount: scrapedPosts.length,
      createdPosts,
    });
  } catch (error) {
    console.error("Run scrape job error:", error);

    await logAdminEvent({
      actorUserId: null,
      actorEmail: "system:dev-route",
      action: "DEV_RUN_NEXT_SCRAPE_JOB_FAILED",
      targetType: "dev_route",
      targetId: "/run-next-scrape-job",
      metadata: {
        error: error instanceof Error ? error.message : "Ukjent feil",
      },
    });

    return res.status(500).json({
      ok: false,
      error: "Kunne ikke kjøre scrape job",
    });
  }
});

router.post("/create-daily-scrape-jobs", async (_req, res) => {
  try {
    const accounts = await prisma.socialAccount.findMany({
      where: {
        status: "ACTIVE",
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    let createdCount = 0;
    const createdJobs: Array<{
      socialAccountId: string;
      accountHandle: string;
      scrapeJobId: string;
    }> = [];

    for (const account of accounts) {
      const existingJob = await prisma.scrapeJob.findFirst({
        where: {
          socialAccountId: account.id,
          type: "DAILY",
          status: {
            in: ["PENDING", "RUNNING"],
          },
        },
      });

      if (existingJob) {
        continue;
      }

      const scrapeJob = await prisma.scrapeJob.create({
        data: {
          organizationId: account.organizationId,
          socialAccountId: account.id,
          type: "DAILY",
          status: "PENDING",
        },
      });

      createdCount += 1;

      createdJobs.push({
        socialAccountId: account.id,
        accountHandle: account.accountHandle,
        scrapeJobId: scrapeJob.id,
      });
    }

    await logAdminEvent({
      actorUserId: null,
      actorEmail: "system:dev-route",
      action: "DEV_CREATE_DAILY_SCRAPE_JOBS",
      targetType: "dev_route",
      targetId: "/create-daily-scrape-jobs",
      metadata: {
        totalAccounts: accounts.length,
        createdCount,
      },
    });

    return res.status(200).json({
      ok: true,
      message: "DAILY scrape jobs opprettet",
      totalAccounts: accounts.length,
      createdCount,
      createdJobs,
    });
  } catch (error) {
    console.error("Create daily scrape jobs error:", error);

    await logAdminEvent({
      actorUserId: null,
      actorEmail: "system:dev-route",
      action: "DEV_CREATE_DAILY_SCRAPE_JOBS_FAILED",
      targetType: "dev_route",
      targetId: "/create-daily-scrape-jobs",
      metadata: {
        error: error instanceof Error ? error.message : "Ukjent feil",
      },
    });

    return res.status(500).json({
      ok: false,
      error: "Kunne ikke opprette DAILY scrape jobs",
    });
  }
});

export default router;