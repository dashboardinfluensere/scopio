import {
  Prisma,
  ImportSourceType,
  ImportStatus,
  InitialSyncStatus,
  Platform,
  ScrapeJobStatus,
  ScrapeJobType,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@prisma/client";
import { prisma } from "../prisma";
import {
  ApifyInstagramPost,
  ApifyTikTokPost,
  runApifyInstagramTaskForProfile,
  runApifyTaskForProfile,
} from "./apify";
import { logAdminEvent } from "./adminLogs";

const INITIAL_RESULTS_LIMIT = 200;
const DAILY_RESULTS_LIMIT = 50;
const WORKER_INTERVAL_MS = 30000;

const DAILY_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const INITIAL_COOLDOWN_MS = 30 * 60 * 1000;
const MAX_JOB_ATTEMPTS = 3;
const QUOTA_BACKOFF_MS = 12 * 60 * 60 * 1000;

const IS_DEV = process.env.NODE_ENV !== "production";

function parsePositiveIntEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const SCRAPING_ENABLED = process.env.SCRAPING_ENABLED !== "false";
const MAX_SCRAPE_RUNS_PER_DAY = parsePositiveIntEnv(
  process.env.MAX_SCRAPE_RUNS_PER_DAY,
  300
);
const MAX_INITIAL_SCRAPE_RUNS_PER_DAY = parsePositiveIntEnv(
  process.env.MAX_INITIAL_SCRAPE_RUNS_PER_DAY,
  300
);
const MAX_DAILY_SCRAPE_RUNS_PER_DAY = parsePositiveIntEnv(
  process.env.MAX_DAILY_SCRAPE_RUNS_PER_DAY,
  300
);
const MAX_PENDING_SCRAPE_JOBS = parsePositiveIntEnv(
  process.env.MAX_PENDING_SCRAPE_JOBS,
  300
);
const MAX_PENDING_INITIAL_JOBS = parsePositiveIntEnv(
  process.env.MAX_PENDING_INITIAL_JOBS,
  150
);

let workerStarted = false;
let isTickRunning = false;
let quotaBlockedUntil: Date | null = null;
let lastQuotaLogAt: number | null = null;

function debugLog(...args: unknown[]) {
  if (IS_DEV) {
    console.log(...args);
  }
}

function infoLog(...args: unknown[]) {
  console.log(...args);
}

function errorLog(...args: unknown[]) {
  console.error(...args);
}

async function logWorkerEvent(params: {
  action: string;
  organizationId?: string | null;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}) {
  await logAdminEvent({
    actorUserId: null,
    actorEmail: "system:scrape-worker",
    action: params.action,
    targetType: "scrape_worker",
    targetId: params.targetId ?? null,
    organizationId: params.organizationId ?? null,
    metadata: params.metadata ?? null,
  });
}

function toTikTokDate(post: ApifyTikTokPost) {
  if (post.createTimeISO) {
    const parsed = new Date(post.createTimeISO);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  if (typeof post.createTime === "number") {
    const milliseconds =
      post.createTime > 10_000_000_000 ? post.createTime : post.createTime * 1000;
    const parsed = new Date(milliseconds);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

function toInstagramDate(post: ApifyInstagramPost) {
  if (post.timestamp) {
    const parsed = new Date(post.timestamp);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  if (typeof post.takenAtTimestamp === "number") {
    const milliseconds =
      post.takenAtTimestamp > 10_000_000_000
        ? post.takenAtTimestamp
        : post.takenAtTimestamp * 1000;

    const parsed = new Date(milliseconds);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

function getTikTokExternalPostId(post: ApifyTikTokPost, fallbackIndex: number) {
  const url = post.webVideoUrl?.trim();

  if (post.id?.trim()) {
    return post.id.trim();
  }

  if (url) {
    const match = url.match(/\/video\/(\d+)/);
    if (match?.[1]) {
      return match[1];
    }

    return url;
  }

  return `tiktok-fallback-${fallbackIndex}`;
}

function getInstagramExternalPostId(
  post: ApifyInstagramPost,
  fallbackIndex: number
) {
  if (post.id?.trim()) {
    return post.id.trim();
  }

  if (post.shortcode?.trim()) {
    return post.shortcode.trim();
  }

  if (post.shortCode?.trim()) {
    return post.shortCode.trim();
  }

  if (post.url?.trim()) {
    return post.url.trim();
  }

  return `instagram-fallback-${fallbackIndex}`;
}

function getTikTokThumbnailUrl(post: ApifyTikTokPost) {
  return (
    post.covers?.origin ??
    post.covers?.dynamic ??
    post.covers?.default ??
    post.videoMeta?.coverUrl ??
    null
  );
}

function getInstagramThumbnailUrl(post: ApifyInstagramPost) {
  return post.displayUrl ?? post.displayUrlVideo ?? null;
}

function getInstagramPostUrl(post: ApifyInstagramPost, accountHandle: string) {
  if (post.url?.trim()) {
    return post.url.trim();
  }

  if (post.shortcode?.trim()) {
    return `https://www.instagram.com/p/${post.shortcode.trim()}/`;
  }

  if (post.shortCode?.trim()) {
    return `https://www.instagram.com/p/${post.shortCode.trim()}/`;
  }

  return `https://www.instagram.com/${accountHandle.replace(/^@/, "")}/`;
}

function getInstagramViews(post: ApifyInstagramPost) {
  const isVideoPost =
    post.type?.toLowerCase() === "video" ||
    post.productType?.toLowerCase() === "clips";

  if (!isVideoPost) {
    return 0;
  }

  return Math.max(post.videoPlayCount ?? 0, post.videoViewCount ?? 0);
}

function isWithinLastXDays(date: Date, days: number) {
  const now = new Date();
  const threshold = new Date();
  threshold.setDate(now.getDate() - days);

  return date >= threshold;
}

function getInitialSyncWindowDays(subscription: {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
}) {
  if (
    subscription.plan === SubscriptionPlan.PRO &&
    subscription.status === SubscriptionStatus.TRIALING
  ) {
    return 30;
  }

  return 90;
}

async function getOrganizationSubscriptionOrThrow(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: {
      id: organizationId,
    },
    select: {
      subscription: {
        select: {
          plan: true,
          status: true,
          currentPeriodEnd: true,
        },
      },
    },
  });

  if (!organization?.subscription) {
    throw new Error("Workspace mangler abonnement.");
  }

  return organization.subscription;
}

function normalizeWorkerError(error: unknown) {
  if (error instanceof Error) {
    const message = error.message || "Ukjent feil";

    if (message.toLowerCase().includes("platform-feature-disabled")) {
      return "TikTok-scraping er ikke tilgjengelig akkurat nå (Apify: platform-feature-disabled).";
    }

    if (message.toLowerCase().includes("monthly usage hard limit exceeded")) {
      return "Apify-kvoten er brukt opp for denne perioden.";
    }

    if (message.toLowerCase().includes("403")) {
      return "Scraping-tjenesten avviste forespørselen (403). Sjekk tilgang, credits eller feature-status.";
    }

    return message;
  }

  if (typeof error === "object" && error !== null) {
    const maybeAny = error as {
      message?: string;
      type?: string;
      statusCode?: number;
    };

    if (maybeAny.type === "platform-feature-disabled") {
      return "TikTok-scraping er ikke tilgjengelig akkurat nå (Apify: platform-feature-disabled).";
    }

    if (
      typeof maybeAny.message === "string" &&
      maybeAny.message.toLowerCase().includes("monthly usage hard limit exceeded")
    ) {
      return "Apify-kvoten er brukt opp for denne perioden.";
    }

    if (maybeAny.statusCode === 403) {
      return "Scraping-tjenesten avviste forespørselen (403). Sjekk tilgang, credits eller feature-status.";
    }

    if (typeof maybeAny.message === "string" && maybeAny.message.trim()) {
      return maybeAny.message;
    }
  }

  return "Ukjent feil i scrape worker.";
}

function isQuotaErrorMessage(message: string) {
  const lowered = message.toLowerCase();

  return (
    lowered.includes("monthly usage hard limit exceeded") ||
    lowered.includes("kvoten er brukt opp")
  );
}

function isQuotaBlocked() {
  return quotaBlockedUntil !== null && quotaBlockedUntil.getTime() > Date.now();
}

function getCooldownMsForJobType(jobType: ScrapeJobType) {
  return jobType === ScrapeJobType.DAILY ? DAILY_COOLDOWN_MS : INITIAL_COOLDOWN_MS;
}

function isExpiredTrialSubscription(subscription: {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
}) {
  if (subscription.plan !== SubscriptionPlan.PRO) {
    return false;
  }

  if (!subscription.currentPeriodEnd) {
    return false;
  }

  const now = new Date();

  if (
    subscription.status !== SubscriptionStatus.TRIALING &&
    subscription.status !== SubscriptionStatus.CANCELED
  ) {
    return false;
  }

  return subscription.currentPeriodEnd < now;
}

function getRolling24HourWindowStart() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

async function getScrapeCapacitySnapshot() {
  const windowStart = getRolling24HourWindowStart();

  const [
    totalRunsLast24Hours,
    initialRunsLast24Hours,
    dailyRunsLast24Hours,
    pendingJobs,
    pendingInitialJobs,
  ] = await Promise.all([
    prisma.scrapeJob.count({
      where: {
        type: {
          in: [ScrapeJobType.INITIAL, ScrapeJobType.DAILY],
        },
        startedAt: {
          gte: windowStart,
        },
      },
    }),
    prisma.scrapeJob.count({
      where: {
        type: ScrapeJobType.INITIAL,
        startedAt: {
          gte: windowStart,
        },
      },
    }),
    prisma.scrapeJob.count({
      where: {
        type: ScrapeJobType.DAILY,
        startedAt: {
          gte: windowStart,
        },
      },
    }),
    prisma.scrapeJob.count({
      where: {
        type: {
          in: [ScrapeJobType.INITIAL, ScrapeJobType.DAILY],
        },
        status: {
          in: [ScrapeJobStatus.PENDING, ScrapeJobStatus.RUNNING],
        },
      },
    }),
    prisma.scrapeJob.count({
      where: {
        type: ScrapeJobType.INITIAL,
        status: {
          in: [ScrapeJobStatus.PENDING, ScrapeJobStatus.RUNNING],
        },
      },
    }),
  ]);

  return {
    windowStart,
    totalRunsLast24Hours,
    initialRunsLast24Hours,
    dailyRunsLast24Hours,
    pendingJobs,
    pendingInitialJobs,
    remainingTotalRuns: Math.max(
      MAX_SCRAPE_RUNS_PER_DAY - totalRunsLast24Hours,
      0
    ),
    remainingInitialRuns: Math.max(
      MAX_INITIAL_SCRAPE_RUNS_PER_DAY - initialRunsLast24Hours,
      0
    ),
    remainingDailyRuns: Math.max(
      MAX_DAILY_SCRAPE_RUNS_PER_DAY - dailyRunsLast24Hours,
      0
    ),
    remainingPendingSlots: Math.max(MAX_PENDING_SCRAPE_JOBS - pendingJobs, 0),
    remainingPendingInitialSlots: Math.max(
      MAX_PENDING_INITIAL_JOBS - pendingInitialJobs,
      0
    ),
  };
}

async function cleanupExpiredTrialWorkspace(organization: {
  id: string;
  name: string;
}) {
  await prisma.$transaction(async (tx) => {
    await tx.scrapeJob.deleteMany({
      where: {
        organizationId: organization.id,
      },
    });

    await tx.postSnapshot.deleteMany({
      where: {
        organizationId: organization.id,
      },
    });

    await tx.accountSnapshot.deleteMany({
      where: {
        organizationId: organization.id,
      },
    });

    await tx.contentPost.deleteMany({
      where: {
        organizationId: organization.id,
      },
    });

    await tx.socialAccount.deleteMany({
      where: {
        organizationId: organization.id,
      },
    });

    await tx.importRun.deleteMany({
      where: {
        organizationId: organization.id,
      },
    });

    await tx.organization.update({
      where: {
        id: organization.id,
      },
      data: {
        initialScrapeStartedAt: null,
        onboardingCompletedAt: null,
      },
    });

    await tx.subscription.update({
      where: {
        organizationId: organization.id,
      },
      data: {
        status: SubscriptionStatus.CANCELED,
      },
    });
  });
}

async function cleanupExpiredTrialWorkspaces() {
  const expiredTrialOrganizations = await prisma.organization.findMany({
    where: {
      subscription: {
        is: {
          plan: SubscriptionPlan.PRO,
          status: SubscriptionStatus.TRIALING,
          currentPeriodEnd: {
            lt: new Date(),
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
    },
    take: 10,
  });

  for (const organization of expiredTrialOrganizations) {
    try {
      debugLog(
        `Starter cleanup for utløpt trial-workspace ${organization.id} (${organization.name})`
      );

      await cleanupExpiredTrialWorkspace(organization);

      infoLog(
        `Cleanup fullført for utløpt trial-workspace ${organization.id} (${organization.name})`
      );

      await logWorkerEvent({
        action: "SCRAPE_WORKER_TRIAL_WORKSPACE_CLEANED",
        organizationId: organization.id,
        targetId: organization.id,
        metadata: {
          organizationName: organization.name,
        },
      });
    } catch (error) {
      errorLog(
        `Cleanup feilet for utløpt trial-workspace ${organization.id} (${organization.name})`,
        error
      );

      await logWorkerEvent({
        action: "SCRAPE_WORKER_TRIAL_WORKSPACE_CLEANUP_FAILED",
        organizationId: organization.id,
        targetId: organization.id,
        metadata: {
          organizationName: organization.name,
          error: normalizeWorkerError(error),
        },
      });
    }
  }
}

async function markInitialSyncStatusIfAccountExists(
  socialAccountId: string,
  status: InitialSyncStatus
) {
  const account = await prisma.socialAccount.findUnique({
    where: { id: socialAccountId },
    select: { id: true },
  });

  if (!account) {
    return;
  }

  await prisma.socialAccount.update({
    where: { id: socialAccountId },
    data: {
      initialSyncStatus: status,
    },
  });
}

async function markJobFailed(
  jobId: string,
  socialAccountId: string,
  message: string,
  jobType: ScrapeJobType
) {
  await prisma.scrapeJob.update({
    where: { id: jobId },
    data: {
      status: ScrapeJobStatus.FAILED,
      errorMessage: message,
      finishedAt: new Date(),
    },
  });

  if (jobType === ScrapeJobType.INITIAL) {
    await markInitialSyncStatusIfAccountExists(
      socialAccountId,
      InitialSyncStatus.FAILED
    );
  }
}

async function markJobCompleted(
  jobId: string,
  socialAccountId: string,
  scrapedAt: Date,
  jobType: ScrapeJobType
) {
  await prisma.scrapeJob.update({
    where: { id: jobId },
    data: {
      status: ScrapeJobStatus.COMPLETED,
      finishedAt: new Date(),
      errorMessage: null,
    },
  });

  const account = await prisma.socialAccount.findUnique({
    where: { id: socialAccountId },
    select: { id: true },
  });

  if (!account) {
    return;
  }

  if (jobType === ScrapeJobType.INITIAL) {
    await prisma.socialAccount.update({
      where: { id: socialAccountId },
      data: {
        initialSyncStatus: InitialSyncStatus.COMPLETED,
        needsInitialSync: false,
        lastSyncedAt: scrapedAt,
      },
    });
    return;
  }

  if (jobType === ScrapeJobType.DAILY) {
    await prisma.socialAccount.update({
      where: { id: socialAccountId },
      data: {
        lastSyncedAt: scrapedAt,
      },
    });
  }
}

async function createImportRun(params: {
  organizationId: string;
  platform: Platform;
  rowCount: number;
  note: string;
}) {
  return prisma.importRun.create({
    data: {
      organizationId: params.organizationId,
      sourceType: ImportSourceType.SCRAPER,
      fileFormat: "apify",
      status: ImportStatus.PROCESSING,
      platformGuess: params.platform,
      rowCount: params.rowCount,
      notes: params.note,
    },
  });
}

async function markImportRunFailed(importRunId: string, message: string) {
  await prisma.importRun.update({
    where: { id: importRunId },
    data: {
      status: ImportStatus.FAILED,
      notes: message,
    },
  });
}

async function markImportRunCompleted(importRunId: string) {
  await prisma.importRun.update({
    where: { id: importRunId },
    data: {
      status: ImportStatus.COMPLETED,
    },
  });
}

async function canRunJob(job: {
  id: string;
  socialAccountId: string;
  organizationId: string;
  type: ScrapeJobType;
  attemptCount: number;
  socialAccount: {
    isActive: boolean;
  };
}) {
  if (!SCRAPING_ENABLED) {
    return {
      ok: false,
      reason: "Scraping er deaktivert via miljøvariabel.",
    };
  }

  if (!job.socialAccount.isActive) {
    return {
      ok: false,
      reason: "Kontoen er ikke lenger aktiv.",
    };
  }

  if (job.attemptCount >= MAX_JOB_ATTEMPTS) {
    return {
      ok: false,
      reason: `Jobben har nådd maks antall forsøk (${MAX_JOB_ATTEMPTS}).`,
    };
  }

  if (isQuotaBlocked()) {
    return {
      ok: false,
      reason: "Apify-kvoten er midlertidig blokkert etter quota-feil.",
    };
  }

  const capacity = await getScrapeCapacitySnapshot();

  if (capacity.totalRunsLast24Hours >= MAX_SCRAPE_RUNS_PER_DAY) {
    return {
      ok: false,
      reason: `Intern scrape-grense nådd (${MAX_SCRAPE_RUNS_PER_DAY} kjøringer siste 24 timer).`,
    };
  }

  if (
    job.type === ScrapeJobType.INITIAL &&
    capacity.initialRunsLast24Hours >= MAX_INITIAL_SCRAPE_RUNS_PER_DAY
  ) {
    return {
      ok: false,
      reason: `Intern INITIAL-grense nådd (${MAX_INITIAL_SCRAPE_RUNS_PER_DAY} kjøringer siste 24 timer).`,
    };
  }

  if (
    job.type === ScrapeJobType.DAILY &&
    capacity.dailyRunsLast24Hours >= MAX_DAILY_SCRAPE_RUNS_PER_DAY
  ) {
    return {
      ok: false,
      reason: `Intern DAILY-grense nådd (${MAX_DAILY_SCRAPE_RUNS_PER_DAY} kjøringer siste 24 timer).`,
    };
  }

  const organization = await prisma.organization.findUnique({
    where: {
      id: job.organizationId,
    },
    include: {
      subscription: true,
    },
  });

  if (!organization?.subscription) {
    return {
      ok: false,
      reason: "Workspace mangler abonnement.",
    };
  }

  if (isExpiredTrialSubscription(organization.subscription)) {
    return {
      ok: false,
      reason: "Workspace har utløpt free trial.",
    };
  }

  const now = new Date();
  const subscription = organization.subscription;
  const hasAccess =
    subscription.status === SubscriptionStatus.ACTIVE ||
    (subscription.status === SubscriptionStatus.TRIALING &&
      (!subscription.currentPeriodEnd || subscription.currentPeriodEnd >= now));

  if (!hasAccess) {
    return {
      ok: false,
      reason: "Workspace har ikke aktiv tilgang til scraping.",
    };
  }

  const socialAccount = await prisma.socialAccount.findUnique({
    where: {
      id: job.socialAccountId,
    },
    select: {
      lastSyncedAt: true,
    },
  });

  if (!socialAccount) {
    return {
      ok: false,
      reason: "Fant ikke konto for jobben.",
    };
  }

  const cooldownMs = getCooldownMsForJobType(job.type);

  if (
    socialAccount.lastSyncedAt &&
    Date.now() - socialAccount.lastSyncedAt.getTime() < cooldownMs
  ) {
    return {
      ok: false,
      reason: "Cooldown aktiv for denne kontoen.",
    };
  }

  return {
    ok: true,
    reason: null,
  };
}

async function enqueueMissingInitialJobs() {
  if (!SCRAPING_ENABLED) {
    debugLog("INITIAL enqueue hoppet over: scraping er deaktivert.");
    return;
  }

  const capacity = await getScrapeCapacitySnapshot();

  if (
    capacity.remainingTotalRuns <= 0 ||
    capacity.remainingInitialRuns <= 0 ||
    capacity.remainingPendingSlots <= 0 ||
    capacity.remainingPendingInitialSlots <= 0
  ) {
    debugLog(
      "INITIAL enqueue hoppet over: intern grense eller pending-grense er nådd."
    );

    await logWorkerEvent({
      action: "SCRAPE_WORKER_INITIAL_ENQUEUE_BLOCKED_BY_CAP",
      metadata: {
        remainingTotalRuns: capacity.remainingTotalRuns,
        remainingInitialRuns: capacity.remainingInitialRuns,
        remainingPendingSlots: capacity.remainingPendingSlots,
        remainingPendingInitialSlots: capacity.remainingPendingInitialSlots,
        maxScrapeRunsPerDay: MAX_SCRAPE_RUNS_PER_DAY,
        maxInitialScrapeRunsPerDay: MAX_INITIAL_SCRAPE_RUNS_PER_DAY,
        maxPendingScrapeJobs: MAX_PENDING_SCRAPE_JOBS,
        maxPendingInitialJobs: MAX_PENDING_INITIAL_JOBS,
      },
    });

    return;
  }

  const maxCandidatesToQueue = Math.min(
    25,
    capacity.remainingTotalRuns,
    capacity.remainingInitialRuns,
    capacity.remainingPendingSlots,
    capacity.remainingPendingInitialSlots
  );

  if (maxCandidatesToQueue <= 0) {
    return;
  }

  const candidateAccounts = await prisma.socialAccount.findMany({
    where: {
      isActive: true,
      needsInitialSync: true,
      initialSyncStatus: {
        in: [InitialSyncStatus.PENDING, InitialSyncStatus.FAILED],
      },
      organization: {
        subscription: {
          is: {
            OR: [
              {
                status: SubscriptionStatus.ACTIVE,
              },
              {
                status: SubscriptionStatus.TRIALING,
                currentPeriodEnd: {
                  gte: new Date(),
                },
              },
            ],
          },
        },
      },
    },
    select: {
      id: true,
      organizationId: true,
      accountHandle: true,
    },
    take: maxCandidatesToQueue,
  });

  let queuedCount = 0;

  for (const account of candidateAccounts) {
    const existingJob = await prisma.scrapeJob.findFirst({
      where: {
        socialAccountId: account.id,
        type: ScrapeJobType.INITIAL,
        status: {
          in: [ScrapeJobStatus.PENDING, ScrapeJobStatus.RUNNING],
        },
      },
      select: {
        id: true,
      },
    });

    if (existingJob) {
      continue;
    }

    await prisma.scrapeJob.create({
      data: {
        organizationId: account.organizationId,
        socialAccountId: account.id,
        type: ScrapeJobType.INITIAL,
        status: ScrapeJobStatus.PENDING,
        scheduledFor: new Date(),
        priority: 100,
      },
    });

    queuedCount += 1;

    debugLog(
      `Opprettet INITIAL-job automatisk for @${account.accountHandle} (${account.id})`
    );
  }

  if (queuedCount > 0) {
    await logWorkerEvent({
      action: "SCRAPE_WORKER_INITIAL_ENQUEUED",
      metadata: {
        queuedCount,
      },
    });
  }
}

async function processTikTokJob(job: {
  id: string;
  socialAccountId: string;
  organizationId: string;
  type: ScrapeJobType;
  socialAccount: {
    id: string;
    accountHandle: string;
    platform: Platform;
    isActive: boolean;
  };
}) {
  let importRunId: string | null = null;

  try {
    const resultsLimit =
      job.type === ScrapeJobType.INITIAL ? INITIAL_RESULTS_LIMIT : DAILY_RESULTS_LIMIT;

    const rawPosts = await runApifyTaskForProfile(
      job.socialAccount.accountHandle,
      resultsLimit
    );

    const subscription = await getOrganizationSubscriptionOrThrow(
      job.organizationId
    );
    const initialWindowDays = getInitialSyncWindowDays(subscription);

    const posts = rawPosts.filter((post) => {
      const publishedAt = toTikTokDate(post);

      if (job.type === ScrapeJobType.INITIAL) {
        return isWithinLastXDays(publishedAt, initialWindowDays);
      }

      return isWithinLastXDays(publishedAt, 7);
    });

    const scrapedAt = new Date();

    infoLog(
      `TIKTOK ${job.type} START: @${job.socialAccount.accountHandle}, posts=${posts.length}, initialWindowDays=${initialWindowDays}`
    );

    const importRun = await createImportRun({
      organizationId: job.organizationId,
      platform: Platform.TIKTOK,
      rowCount: posts.length,
      note: `${job.type} TikTok scrape for @${job.socialAccount.accountHandle}`,
    });

    importRunId = importRun.id;

    for (let i = 0; i < posts.length; i += 1) {
      const post = posts[i];
      const externalPostId = getTikTokExternalPostId(post, i);
      const publishedAt = toTikTokDate(post);
      const thumbnailUrl = getTikTokThumbnailUrl(post);

      const contentPost = await prisma.contentPost.upsert({
        where: {
          socialAccountId_externalPostId: {
            socialAccountId: job.socialAccountId,
            externalPostId,
          },
        },
        update: {
          url: post.webVideoUrl ?? null,
          thumbnailUrl,
          caption: post.text ?? null,
          publishedAt,
          durationSeconds: post.videoMeta?.duration ?? null,
        },
        create: {
          organizationId: job.organizationId,
          socialAccountId: job.socialAccountId,
          platform: Platform.TIKTOK,
          externalPostId,
          url: post.webVideoUrl ?? null,
          thumbnailUrl,
          caption: post.text ?? null,
          tags: [],
          publishedAt,
          durationSeconds: post.videoMeta?.duration ?? null,
        },
      });

      await prisma.postSnapshot.create({
        data: {
          organizationId: job.organizationId,
          contentPostId: contentPost.id,
          scrapedAt,
          views: post.playCount ?? 0,
          likes: post.diggCount ?? 0,
          comments: post.commentCount ?? 0,
          shares: post.shareCount ?? 0,
          saves: post.collectCount ?? 0,
          engagementRate:
            post.playCount && post.playCount > 0
              ? Number(
                  (
                    (((post.diggCount ?? 0) +
                      (post.commentCount ?? 0) +
                      (post.shareCount ?? 0) +
                      (post.collectCount ?? 0)) /
                      post.playCount) *
                    100
                  ).toFixed(2)
                )
              : 0,
          importRunId: importRun.id,
        },
      });
    }

    await prisma.accountSnapshot.create({
      data: {
        organizationId: job.organizationId,
        socialAccountId: job.socialAccountId,
        scrapedAt,
        totalPosts: posts.length,
        importRunId: importRun.id,
      },
    });

    await markImportRunCompleted(importRun.id);
    await markJobCompleted(job.id, job.socialAccountId, scrapedAt, job.type);

    infoLog(`TIKTOK ${job.type} COMPLETED: @${job.socialAccount.accountHandle}`);

    await logWorkerEvent({
      action: "SCRAPE_WORKER_JOB_COMPLETED",
      organizationId: job.organizationId,
      targetId: job.id,
      metadata: {
        platform: Platform.TIKTOK,
        jobType: job.type,
        socialAccountId: job.socialAccountId,
        accountHandle: job.socialAccount.accountHandle,
        importedPosts: posts.length,
      },
    });
  } catch (error) {
    const message = normalizeWorkerError(error);
    errorLog(
      `TIKTOK ${job.type} FAILED: @${job.socialAccount.accountHandle}`,
      error
    );

    if (isQuotaErrorMessage(message)) {
      quotaBlockedUntil = new Date(Date.now() + QUOTA_BACKOFF_MS);
      errorLog(`Apify quota blokkert til ${quotaBlockedUntil.toISOString()}`);

      const now = Date.now();
      if (!lastQuotaLogAt || now - lastQuotaLogAt > 5 * 60 * 1000) {
        await logWorkerEvent({
          action: "SCRAPE_WORKER_APIFY_QUOTA_BLOCKED",
          organizationId: job.organizationId,
          targetId: job.id,
          metadata: {
            quotaBlockedUntil: quotaBlockedUntil.toISOString(),
            message,
            platform: Platform.TIKTOK,
            jobType: job.type,
            socialAccountId: job.socialAccountId,
            accountHandle: job.socialAccount.accountHandle,
          },
        });
        lastQuotaLogAt = now;
      }
    }

    if (importRunId) {
      await markImportRunFailed(importRunId, message);
    }

    await markJobFailed(job.id, job.socialAccountId, message, job.type);

    await logWorkerEvent({
      action: "SCRAPE_WORKER_JOB_FAILED",
      organizationId: job.organizationId,
      targetId: job.id,
      metadata: {
        platform: Platform.TIKTOK,
        jobType: job.type,
        socialAccountId: job.socialAccountId,
        accountHandle: job.socialAccount.accountHandle,
        error: message,
      },
    });
  }
}

async function processInstagramJob(job: {
  id: string;
  socialAccountId: string;
  organizationId: string;
  type: ScrapeJobType;
  socialAccount: {
    id: string;
    accountHandle: string;
    platform: Platform;
    isActive: boolean;
  };
}) {
  let importRunId: string | null = null;

  try {
    const resultsLimit =
      job.type === ScrapeJobType.INITIAL ? INITIAL_RESULTS_LIMIT : DAILY_RESULTS_LIMIT;

    const rawPosts = await runApifyInstagramTaskForProfile(
      job.socialAccount.accountHandle,
      resultsLimit
    );

    const subscription = await getOrganizationSubscriptionOrThrow(
      job.organizationId
    );
    const initialWindowDays = getInitialSyncWindowDays(subscription);

    const cleanedHandle = job.socialAccount.accountHandle
      .replace(/^@/, "")
      .toLowerCase();

    const posts = rawPosts.filter((post) => {
      const owner = post.ownerUsername?.trim().toLowerCase();

      if (!owner || owner !== cleanedHandle) {
        return false;
      }

      const publishedAt = toInstagramDate(post);

      if (job.type === ScrapeJobType.INITIAL) {
        return isWithinLastXDays(publishedAt, initialWindowDays);
      }

      return isWithinLastXDays(publishedAt, 7);
    });

    const scrapedAt = new Date();

    infoLog(
      `INSTAGRAM ${job.type} START: @${job.socialAccount.accountHandle}, raw=${rawPosts.length}, filtered=${posts.length}, initialWindowDays=${initialWindowDays}`
    );

    const importRun = await createImportRun({
      organizationId: job.organizationId,
      platform: Platform.INSTAGRAM,
      rowCount: posts.length,
      note: `${job.type} Instagram scrape for @${job.socialAccount.accountHandle}`,
    });

    importRunId = importRun.id;

    for (let i = 0; i < posts.length; i += 1) {
      const post = posts[i];
      const externalPostId = getInstagramExternalPostId(post, i);
      const publishedAt = toInstagramDate(post);

      const views = getInstagramViews(post);
      const likes = post.likesCount ?? 0;
      const comments = post.commentsCount ?? 0;
      const shares = 0;
      const saves = 0;
      const url = getInstagramPostUrl(post, job.socialAccount.accountHandle);
      const thumbnailUrl = getInstagramThumbnailUrl(post);

      const contentPost = await prisma.contentPost.upsert({
        where: {
          socialAccountId_externalPostId: {
            socialAccountId: job.socialAccountId,
            externalPostId,
          },
        },
        update: {
          url,
          thumbnailUrl,
          caption: post.caption ?? null,
          publishedAt,
          durationSeconds: post.videoDuration ?? null,
        },
        create: {
          organizationId: job.organizationId,
          socialAccountId: job.socialAccountId,
          platform: Platform.INSTAGRAM,
          externalPostId,
          url,
          thumbnailUrl,
          caption: post.caption ?? null,
          tags: [],
          publishedAt,
          durationSeconds: post.videoDuration ?? null,
        },
      });

      await prisma.postSnapshot.create({
        data: {
          organizationId: job.organizationId,
          contentPostId: contentPost.id,
          scrapedAt,
          views,
          likes,
          comments,
          shares,
          saves,
          engagementRate:
            views > 0
              ? Number(
                  (((likes + comments + shares + saves) / views) * 100).toFixed(2)
                )
              : 0,
          importRunId: importRun.id,
        },
      });
    }

    await prisma.accountSnapshot.create({
      data: {
        organizationId: job.organizationId,
        socialAccountId: job.socialAccountId,
        scrapedAt,
        totalPosts: posts.length,
        importRunId: importRun.id,
      },
    });

    await markImportRunCompleted(importRun.id);
    await markJobCompleted(job.id, job.socialAccountId, scrapedAt, job.type);

    infoLog(
      `INSTAGRAM ${job.type} COMPLETED: @${job.socialAccount.accountHandle}`
    );

    await logWorkerEvent({
      action: "SCRAPE_WORKER_JOB_COMPLETED",
      organizationId: job.organizationId,
      targetId: job.id,
      metadata: {
        platform: Platform.INSTAGRAM,
        jobType: job.type,
        socialAccountId: job.socialAccountId,
        accountHandle: job.socialAccount.accountHandle,
        importedPosts: posts.length,
      },
    });
  } catch (error) {
    const message = normalizeWorkerError(error);
    errorLog(
      `INSTAGRAM ${job.type} FAILED: @${job.socialAccount.accountHandle}`,
      error
    );

    if (isQuotaErrorMessage(message)) {
      quotaBlockedUntil = new Date(Date.now() + QUOTA_BACKOFF_MS);
      errorLog(`Apify quota blokkert til ${quotaBlockedUntil.toISOString()}`);

      const now = Date.now();
      if (!lastQuotaLogAt || now - lastQuotaLogAt > 5 * 60 * 1000) {
        await logWorkerEvent({
          action: "SCRAPE_WORKER_APIFY_QUOTA_BLOCKED",
          organizationId: job.organizationId,
          targetId: job.id,
          metadata: {
            quotaBlockedUntil: quotaBlockedUntil.toISOString(),
            message,
            platform: Platform.INSTAGRAM,
            jobType: job.type,
            socialAccountId: job.socialAccountId,
            accountHandle: job.socialAccount.accountHandle,
          },
        });
        lastQuotaLogAt = now;
      }
    }

    if (importRunId) {
      await markImportRunFailed(importRunId, message);
    }

    await markJobFailed(job.id, job.socialAccountId, message, job.type);

    await logWorkerEvent({
      action: "SCRAPE_WORKER_JOB_FAILED",
      organizationId: job.organizationId,
      targetId: job.id,
      metadata: {
        platform: Platform.INSTAGRAM,
        jobType: job.type,
        socialAccountId: job.socialAccountId,
        accountHandle: job.socialAccount.accountHandle,
        error: message,
      },
    });
  }
}

async function claimNextPendingJob() {
  if (!SCRAPING_ENABLED) {
    debugLog("Worker tick skipped: scraping er deaktivert.");
    return null;
  }

  if (isQuotaBlocked()) {
    debugLog("Worker tick skipped: Apify quota is temporarily blocked.");
    return null;
  }

  const nextJob = await prisma.scrapeJob.findFirst({
    where: {
      type: {
        in: [ScrapeJobType.INITIAL, ScrapeJobType.DAILY],
      },
      status: ScrapeJobStatus.PENDING,
      socialAccount: {
        isActive: true,
      },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    include: {
      socialAccount: {
        select: {
          id: true,
          accountHandle: true,
          platform: true,
          isActive: true,
        },
      },
    },
  });

  if (!nextJob) {
    return null;
  }

  const alreadyRunningForSameAccountAndType = await prisma.scrapeJob.findFirst({
    where: {
      id: {
        not: nextJob.id,
      },
      socialAccountId: nextJob.socialAccountId,
      type: nextJob.type,
      status: ScrapeJobStatus.RUNNING,
    },
    select: {
      id: true,
    },
  });

  if (alreadyRunningForSameAccountAndType) {
    debugLog(
      `Worker skipped job ${nextJob.id}: samme konto/type kjører allerede.`
    );

    await logWorkerEvent({
      action: "SCRAPE_WORKER_JOB_SKIPPED_DUPLICATE_RUNNING",
      organizationId: nextJob.organizationId,
      targetId: nextJob.id,
      metadata: {
        socialAccountId: nextJob.socialAccountId,
        jobType: nextJob.type,
      },
    });

    return null;
  }

  const eligibility = await canRunJob(nextJob);

  if (!eligibility.ok) {
    debugLog(`Worker skipped job ${nextJob.id}: ${eligibility.reason}`);

    await logWorkerEvent({
      action: "SCRAPE_WORKER_JOB_SKIPPED",
      organizationId: nextJob.organizationId,
      targetId: nextJob.id,
      metadata: {
        socialAccountId: nextJob.socialAccountId,
        jobType: nextJob.type,
        reason: eligibility.reason,
      },
    });

    if (
      eligibility.reason ===
        `Jobben har nådd maks antall forsøk (${MAX_JOB_ATTEMPTS}).` ||
      eligibility.reason === "Workspace har ikke aktiv tilgang til scraping." ||
      eligibility.reason === "Workspace har utløpt free trial." ||
      eligibility.reason === "Kontoen er ikke lenger aktiv." ||
      eligibility.reason === "Fant ikke konto for jobben."
    ) {
      await markJobFailed(
        nextJob.id,
        nextJob.socialAccountId,
        eligibility.reason,
        nextJob.type
      );
    }

    return null;
  }

  const claimed = await prisma.scrapeJob.updateMany({
    where: {
      id: nextJob.id,
      status: ScrapeJobStatus.PENDING,
    },
    data: {
      status: ScrapeJobStatus.RUNNING,
      startedAt: new Date(),
      attemptCount: {
        increment: 1,
      },
    },
  });

  if (claimed.count === 0) {
    return null;
  }

  infoLog(
    `Worker claimed ${nextJob.type} job ${nextJob.id} for @${nextJob.socialAccount.accountHandle}`
  );

  return {
    ...nextJob,
    attemptCount: nextJob.attemptCount + 1,
  };
}

async function runWorkerTick() {
  if (isTickRunning) {
    return;
  }

  isTickRunning = true;

  try {
    await cleanupExpiredTrialWorkspaces();
    await enqueueMissingInitialJobs();

    const job = await claimNextPendingJob();

    if (!job) {
      return;
    }

    if (job.socialAccount.platform === Platform.TIKTOK) {
      await processTikTokJob(job);
      return;
    }

    if (job.socialAccount.platform === Platform.INSTAGRAM) {
      await processInstagramJob(job);
      return;
    }

    await markJobFailed(
      job.id,
      job.socialAccountId,
      "Ukjent plattform for scrape worker.",
      job.type
    );

    await logWorkerEvent({
      action: "SCRAPE_WORKER_JOB_FAILED_UNKNOWN_PLATFORM",
      organizationId: job.organizationId,
      targetId: job.id,
      metadata: {
        socialAccountId: job.socialAccountId,
        platform: job.socialAccount.platform,
        jobType: job.type,
      },
    });
  } catch (error) {
    errorLog("Scrape worker tick error:", error);

    await logWorkerEvent({
      action: "SCRAPE_WORKER_TICK_FAILED",
      metadata: {
        error: normalizeWorkerError(error),
      },
    });
  } finally {
    isTickRunning = false;
  }
}

export function startScrapeWorker() {
  if (workerStarted) {
    return;
  }

  if (!SCRAPING_ENABLED) {
    infoLog("Scrape worker er deaktivert via SCRAPING_ENABLED=false.");
    return;
  }

  workerStarted = true;

  infoLog(
    `Scrape worker startet. Poller hvert ${
      WORKER_INTERVAL_MS / 1000
    }. sekund. Maks ${MAX_SCRAPE_RUNS_PER_DAY} scrape-kjøringer siste 24 timer.`
  );

  void logWorkerEvent({
    action: "SCRAPE_WORKER_STARTED",
    metadata: {
      workerIntervalMs: WORKER_INTERVAL_MS,
      maxScrapeRunsPerDay: MAX_SCRAPE_RUNS_PER_DAY,
      maxInitialScrapeRunsPerDay: MAX_INITIAL_SCRAPE_RUNS_PER_DAY,
      maxDailyScrapeRunsPerDay: MAX_DAILY_SCRAPE_RUNS_PER_DAY,
      maxPendingScrapeJobs: MAX_PENDING_SCRAPE_JOBS,
      maxPendingInitialJobs: MAX_PENDING_INITIAL_JOBS,
    },
  });

  void runWorkerTick();
  setInterval(() => {
    void runWorkerTick();
  }, WORKER_INTERVAL_MS);
}

export function isApifyQuotaBlocked() {
  return isQuotaBlocked();
}

export function getApifyQuotaBlockedUntil() {
  return quotaBlockedUntil;
}

export function isScrapingEnabled() {
  return SCRAPING_ENABLED;
}