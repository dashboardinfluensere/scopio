import path from "path";
import dotenv from "dotenv";

dotenv.config({
  path: path.resolve(__dirname, ".env"),
});

import express from "express";
import cors from "cors";
import helmet from "helmet";
import cron from "node-cron";

import {
  MemberRole,
  SubscriptionPlan,
  SubscriptionStatus,
  ScrapeJobType,
  ScrapeJobStatus,
} from "@prisma/client";

import { prisma } from "./prisma";

import importRoutes from "./routes/import";
import analyticsRoutes from "./routes/analytics";
import socialAccountsRoutes from "./routes/socialAccounts";
import devRoutes from "./routes/dev";
import clerkWebhookRoutes from "./routes/clerkWebhook";
import meRoutes from "./routes/me";
import organizationsRoutes from "./routes/organizations";
import insightsRoutes from "./routes/insights";
import accessRequestsRouter from "./routes/accessRequests";
import adminLogsRouter from "./routes/adminLogs";
import { startScrapeWorker } from "./services/scrapeWorker";
import { getActiveOrganizationAccess } from "./services/getActiveOrganizationAccess";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "./middleware/requireAuth";
import {
  globalLimiter,
  analyticsLimiter,
  expensiveJobLimiter,
} from "./middleware/rateLimiters";

const app = express();
const PORT = Number(process.env.PORT ?? 3001);
const NODE_ENV = process.env.NODE_ENV ?? "development";
const IS_PROD = NODE_ENV === "production";

const RUN_SCHEDULER = process.env.RUN_SCHEDULER === "true";
const RUN_SCRAPE_WORKER = process.env.RUN_SCRAPE_WORKER === "true";

/**
 * Global kill switch for scraping.
 * Sett denne til "false" i .env hvis du vil stoppe all scraping umiddelbart.
 */
const SCRAPING_ENABLED = process.env.SCRAPING_ENABLED !== "false";

/**
 * Hard cap for hvor mange DAILY jobs som kan opprettes i én scheduler-kjøring.
 * Standard = 300
 */
const MAX_DAILY_JOBS_PER_SCHEDULE_RUN = Math.max(
  1,
  Number(process.env.MAX_DAILY_JOBS_PER_SCHEDULE_RUN ?? 300)
);

function getAuthenticatedClerkUserId(req: AuthenticatedRequest): string | null {
  return req.auth?.clerkUserId ?? req.auth?.userId ?? null;
}

function generateDefaultJoinCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function parseAllowedOrigins() {
  const rawOrigins = [
    process.env.FRONTEND_URL,
    process.env.APP_URL,
    process.env.CORS_ORIGIN,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ];

  return Array.from(
    new Set(
      rawOrigins
        .flatMap((value) => String(value ?? "").split(","))
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

const allowedOrigins = parseAllowedOrigins();

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blokkerte origin: ${origin}`));
  },
  credentials: true,
};

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(globalLimiter);

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return res.json({
      ok: true,
      database: true,
      environment: NODE_ENV,
      scrapingEnabled: SCRAPING_ENABLED,
      schedulerEnabled: RUN_SCHEDULER,
      scrapeWorkerEnabled: RUN_SCRAPE_WORKER,
      maxDailyJobsPerScheduleRun: MAX_DAILY_JOBS_PER_SCHEDULE_RUN,
    });
  } catch (error) {
    console.error("Health check error:", error);

    return res.status(500).json({
      ok: false,
      database: false,
    });
  }
});

app.use("/webhooks", clerkWebhookRoutes);

app.use("/analytics/insights", analyticsLimiter, insightsRoutes);
app.use("/analytics", analyticsLimiter, analyticsRoutes);
app.use("/import", expensiveJobLimiter, importRoutes);
app.use("/social-accounts", socialAccountsRoutes);
app.use("/me", meRoutes);
app.use("/organizations", organizationsRoutes);
app.use("/access-requests", accessRequestsRouter);
app.use("/admin-logs", adminLogsRouter);

if (!IS_PROD) {
  app.use("/dev", devRoutes);

  app.post("/dev/create-organization", async (req, res) => {
    try {
      const { name } = req.body;

      if (!name || typeof name !== "string") {
        return res.status(400).json({
          ok: false,
          error: "name er påkrevd",
        });
      }

      const organization = await prisma.organization.create({
        data: {
          name: name.trim(),
          joinCode: generateDefaultJoinCode(),
        },
      });

      return res.status(201).json({
        ok: true,
        organization,
      });
    } catch (error) {
      console.error("Dev create organization error:", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke opprette organization",
      });
    }
  });

  app.post("/dev/create-user-with-organization", async (req, res) => {
    try {
      const { email, name, organizationName } = req.body;

      if (!email || typeof email !== "string") {
        return res.status(400).json({
          ok: false,
          error: "email er påkrevd",
        });
      }

      if (!organizationName || typeof organizationName !== "string") {
        return res.status(400).json({
          ok: false,
          error: "organizationName er påkrevd",
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      const existingUser = await prisma.user.findUnique({
        where: {
          email: normalizedEmail,
        },
      });

      if (existingUser) {
        return res.status(409).json({
          ok: false,
          error: "Bruker med denne e-posten finnes allerede",
        });
      }

      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: normalizedEmail,
            name: typeof name === "string" ? name.trim() : null,
          },
        });

        const slugBase = organizationName
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "");

        const organization = await tx.organization.create({
          data: {
            name: organizationName.trim(),
            slug: slugBase || null,
            joinCode: generateDefaultJoinCode(),
          },
        });

        const membership = await tx.organizationMember.create({
          data: {
            userId: user.id,
            organizationId: organization.id,
            role: MemberRole.OWNER,
          },
        });

        const subscription = await tx.subscription.create({
          data: {
            organizationId: organization.id,
            plan: SubscriptionPlan.FREE,
            status: SubscriptionStatus.ACTIVE,
          },
        });

        const updatedUser = await tx.user.update({
          where: { id: user.id },
          data: {
            activeOrganizationId: organization.id,
          },
        });

        return {
          user: updatedUser,
          organization,
          membership,
          subscription,
        };
      });

      return res.status(201).json({
        ok: true,
        ...result,
      });
    } catch (error) {
      console.error("Dev create user with organization error:", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke opprette user med organization",
      });
    }
  });
}

app.get("/posts", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const clerkUserId = getAuthenticatedClerkUserId(req);

    if (!clerkUserId) {
      return res.status(401).json({
        ok: false,
        error: "Ikke autentisert",
      });
    }

    const access = await getActiveOrganizationAccess(clerkUserId);

    const posts = await prisma.contentPost.findMany({
      where: {
        organizationId: access.organizationId,
      },
      orderBy: {
        publishedAt: "desc",
      },
      take: 50,
      include: {
        socialAccount: true,
        snapshots: {
          orderBy: {
            scrapedAt: "desc",
          },
          take: 1,
        },
      },
    });

    return res.json({
      ok: true,
      posts,
    });
  } catch (error) {
    console.error("Get posts error:", error);

    return res.status(500).json({
      ok: false,
      error: "Kunne ikke hente posts",
    });
  }
});

/* =========================
   DAILY SCRAPE (08:00)
   ========================= */

if (RUN_SCHEDULER) {
  cron.schedule(
    "0 8 * * *",
    async () => {
      console.log("⏰ Starter daglig scraping...");

      if (!SCRAPING_ENABLED) {
        console.log("⏸️ Daglig scraping hoppet over: SCRAPING_ENABLED=false");
        return;
      }

      try {
        const now = new Date();

        const pendingOrRunningDailyJobs = await prisma.scrapeJob.count({
          where: {
            type: ScrapeJobType.DAILY,
            status: {
              in: [ScrapeJobStatus.PENDING, ScrapeJobStatus.RUNNING],
            },
          },
        });

        const remainingCapacity = Math.max(
          MAX_DAILY_JOBS_PER_SCHEDULE_RUN - pendingOrRunningDailyJobs,
          0
        );

        if (remainingCapacity <= 0) {
          console.log(
            `⛔ Hopper over opprettelse av DAILY jobs: hard cap nådd (${MAX_DAILY_JOBS_PER_SCHEDULE_RUN})`
          );
          return;
        }

        const accounts = await prisma.socialAccount.findMany({
          where: {
            needsInitialSync: false,
            isActive: true,
            organization: {
              subscription: {
                OR: [
                  { status: SubscriptionStatus.ACTIVE },
                  {
                    status: SubscriptionStatus.TRIALING,
                    OR: [
                      { currentPeriodEnd: null },
                      { currentPeriodEnd: { gte: now } },
                    ],
                  },
                ],
              },
            },
          },
          select: {
            id: true,
            organizationId: true,
          },
          take: remainingCapacity * 3,
        });

        let createdJobs = 0;

        for (const account of accounts) {
          if (createdJobs >= remainingCapacity) {
            break;
          }

          const existingJob = await prisma.scrapeJob.findFirst({
            where: {
              socialAccountId: account.id,
              organizationId: account.organizationId,
              type: ScrapeJobType.DAILY,
              status: {
                in: [ScrapeJobStatus.PENDING, ScrapeJobStatus.RUNNING],
              },
            },
            select: {
              id: true,
            },
          });

          if (existingJob) continue;

          await prisma.scrapeJob.create({
            data: {
              socialAccountId: account.id,
              organizationId: account.organizationId,
              type: ScrapeJobType.DAILY,
              status: ScrapeJobStatus.PENDING,
              priority: 1,
            },
          });

          createdJobs += 1;
        }

        console.log(
          `✅ Opprettet ${createdJobs} daglige scrape-jobs (hard cap per kjøring: ${MAX_DAILY_JOBS_PER_SCHEDULE_RUN}, eksisterende pending/running: ${pendingOrRunningDailyJobs})`
        );
      } catch (error) {
        console.error("❌ Feil i daily scrape:", error);
      }
    },
    { timezone: "Europe/Oslo" }
  );
}

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    if (
      err instanceof Error &&
      err.message.startsWith("CORS blokkerte origin:")
    ) {
      return res.status(403).json({
        ok: false,
        error: "Denne origin-en har ikke tilgang til API-et",
      });
    }

    console.error("Unhandled server error:", err);

    return res.status(500).json({
      ok: false,
      error: "Intern serverfeil",
    });
  }
);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server kjører på port ${PORT} (${NODE_ENV})`);

  if (RUN_SCRAPE_WORKER && SCRAPING_ENABLED) {
    startScrapeWorker();
    console.log("Scrape worker startet.");
  } else if (RUN_SCRAPE_WORKER && !SCRAPING_ENABLED) {
    console.log("Scrape worker er slått av via SCRAPING_ENABLED=false.");
  } else {
    console.log("Scrape worker er deaktivert.");
  }

  if (RUN_SCHEDULER && SCRAPING_ENABLED) {
    console.log("Daglig scheduler er aktiv.");
  } else if (RUN_SCHEDULER && !SCRAPING_ENABLED) {
    console.log("Daglig scheduler er slått av via SCRAPING_ENABLED=false.");
  } else {
    console.log("Daglig scheduler er deaktivert.");
  }
});