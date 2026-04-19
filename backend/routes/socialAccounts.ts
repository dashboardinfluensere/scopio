import { Router } from "express";
import {
  InitialSyncStatus,
  MemberRole,
  Platform,
  ScrapeJobStatus,
  ScrapeJobType,
  SocialAccountStatus,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@prisma/client";
import { prisma } from "../prisma";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middleware/requireAuth";
import {
  socialAccountsWriteLimiter,
  initialSubmitLimiter,
  retryScrapeLimiter,
} from "../middleware/rateLimiters";
import { getActiveOrganizationAccess } from "../services/getActiveOrganizationAccess";
import { hasRole } from "../services/hasRole";
import {
  getApifyQuotaBlockedUntil,
  isApifyQuotaBlocked,
} from "../services/scrapeWorker";
import { logAdminEvent } from "../services/adminLogs";

const router = Router();

type PendingAccountInput = {
  platform: Platform;
  accountHandle: string;
  displayName?: string | null;
  profileUrl?: string | null;
};

type InitialSubmitBodyItem = {
  platform?: unknown;
  accountHandle?: unknown;
  displayName?: unknown;
  profileUrl?: unknown;
};

type RetryJobBody = {
  jobType?: unknown;
};

type LatestJobSummary = {
  id: string;
  type: ScrapeJobType;
  status: ScrapeJobStatus;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

type LatestJobSummaryWithAccountId = LatestJobSummary & {
  socialAccountId: string;
};

function getAuthenticatedClerkUserId(req: AuthenticatedRequest): string | null {
  return req.auth?.clerkUserId ?? req.auth?.userId ?? null;
}

function isValidPlatform(value: unknown): value is Platform {
  return (
    typeof value === "string" &&
    Object.values(Platform).includes(value as Platform)
  );
}

function isRetryableJobType(value: unknown): value is ScrapeJobType {
  return value === ScrapeJobType.INITIAL || value === ScrapeJobType.DAILY;
}

function normalizeAccountHandle(input: string, platform: Platform): string {
  const value = String(input ?? "").trim();

  if (!value) {
    return "";
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const url = new URL(value);

      if (platform === Platform.TIKTOK) {
        const match = url.pathname.match(/@([^/]+)/);
        return match?.[1]?.trim().toLowerCase() ?? "";
      }

      const parts = url.pathname.split("/").filter(Boolean);
      return parts[0]?.trim().toLowerCase() ?? "";
    } catch {
      return "";
    }
  }

  return value.replace(/^@/, "").trim().toLowerCase();
}

function getMonthlyAccountAddLimit(params: {
  plan: SubscriptionPlan | null | undefined;
  status: SubscriptionStatus | null | undefined;
}) {
  if (
    params.plan === SubscriptionPlan.PRO &&
    params.status === SubscriptionStatus.TRIALING
  ) {
    return 1;
  }

  if (params.plan === SubscriptionPlan.BUSINESS) {
    return 4;
  }

  if (params.plan === SubscriptionPlan.PRO) {
    return 2;
  }

  if (params.plan === SubscriptionPlan.STARTER) {
    return 1;
  }

  return 1;
}

function hasSubscriptionAccess(
  status: SubscriptionStatus | null | undefined,
  currentPeriodEnd?: Date | string | null
) {
  if (status === SubscriptionStatus.ACTIVE) {
    return true;
  }

  if (status === SubscriptionStatus.TRIALING) {
    if (!currentPeriodEnd) {
      return true;
    }

    return new Date(currentPeriodEnd) >= new Date();
  }

  return false;
}

function getAddWindowStart() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date;
}

function getNextAvailableAddAtFromOldest(oldestCreatedAt: Date | null) {
  if (!oldestCreatedAt) {
    return null;
  }

  const nextAvailable = new Date(oldestCreatedAt);
  nextAvailable.setDate(nextAvailable.getDate() + 30);
  return nextAvailable;
}

function toLatestJobSummary(job: LatestJobSummary | null | undefined) {
  if (!job) {
    return null;
  }

  return {
    id: job.id,
    type: job.type,
    status: job.status,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
}

async function getLatestJobsForAccounts(
  organizationId: string,
  accountIds: string[]
) {
  if (accountIds.length === 0) {
    return {
      latestInitialJobByAccountId: new Map<
        string,
        LatestJobSummaryWithAccountId
      >(),
      latestDailyJobByAccountId: new Map<string, LatestJobSummaryWithAccountId>(),
    };
  }

  const [initialJobs, dailyJobs] = await Promise.all([
    prisma.scrapeJob.findMany({
      where: {
        organizationId,
        socialAccountId: {
          in: accountIds,
        },
        type: ScrapeJobType.INITIAL,
      },
      select: {
        id: true,
        socialAccountId: true,
        type: true,
        status: true,
        errorMessage: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
      },
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.scrapeJob.findMany({
      where: {
        organizationId,
        socialAccountId: {
          in: accountIds,
        },
        type: ScrapeJobType.DAILY,
      },
      select: {
        id: true,
        socialAccountId: true,
        type: true,
        status: true,
        errorMessage: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
      },
      orderBy: [{ createdAt: "desc" }],
    }),
  ]);

  const latestInitialJobByAccountId = new Map<
    string,
    LatestJobSummaryWithAccountId
  >();
  const latestDailyJobByAccountId = new Map<string, LatestJobSummaryWithAccountId>();

  for (const job of initialJobs) {
    if (!latestInitialJobByAccountId.has(job.socialAccountId)) {
      latestInitialJobByAccountId.set(job.socialAccountId, job);
    }
  }

  for (const job of dailyJobs) {
    if (!latestDailyJobByAccountId.has(job.socialAccountId)) {
      latestDailyJobByAccountId.set(job.socialAccountId, job);
    }
  }

  return {
    latestInitialJobByAccountId,
    latestDailyJobByAccountId,
  };
}

router.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const clerkUserId = getAuthenticatedClerkUserId(req);

    if (!clerkUserId) {
      return res.status(401).json({
        ok: false,
        error: "Ikke autentisert",
      });
    }

    const access = await getActiveOrganizationAccess(clerkUserId);

    const [accounts, organization, addsThisPeriod, oldestAddEvent] =
      await Promise.all([
        prisma.socialAccount.findMany({
          where: {
            organizationId: access.organizationId,
            isActive: true,
          },
          select: {
            id: true,
            platform: true,
            accountHandle: true,
            displayName: true,
            profileUrl: true,
            status: true,
            initialSyncStatus: true,
            isActive: true,
            createdAt: true,
            lastSyncedAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        }),
        prisma.organization.findUnique({
          where: {
            id: access.organizationId,
          },
          include: {
            subscription: true,
          },
        }),
        prisma.socialAccountAddEvent.count({
          where: {
            organizationId: access.organizationId,
            createdAt: {
              gte: getAddWindowStart(),
            },
          },
        }),
        prisma.socialAccountAddEvent.findFirst({
          where: {
            organizationId: access.organizationId,
            createdAt: {
              gte: getAddWindowStart(),
            },
          },
          orderBy: {
            createdAt: "asc",
          },
          select: {
            createdAt: true,
          },
        }),
      ]);

    const accountIds = accounts.map((account) => account.id);
    const { latestInitialJobByAccountId, latestDailyJobByAccountId } =
      await getLatestJobsForAccounts(access.organizationId, accountIds);

    const mappedAccounts = accounts.map((account) => {
      const latestInitialJob =
        latestInitialJobByAccountId.get(account.id) ?? null;
      const latestDailyJob = latestDailyJobByAccountId.get(account.id) ?? null;

      return {
        ...account,
        latestInitialJob: toLatestJobSummary(latestInitialJob),
        latestDailyJob: toLatestJobSummary(latestDailyJob),
        retry: {
          canRetryInitial:
            account.initialSyncStatus === InitialSyncStatus.FAILED &&
            latestInitialJob?.status === ScrapeJobStatus.FAILED,
          canRetryDaily: latestDailyJob?.status === ScrapeJobStatus.FAILED,
        },
      };
    });

    const subscription = organization?.subscription ?? null;
    const accountLimit = getMonthlyAccountAddLimit({
      plan: subscription?.plan,
      status: subscription?.status,
    });
    const hasAccess = hasSubscriptionAccess(
      subscription?.status,
      subscription?.currentPeriodEnd
    );
    const nextAvailableAddAt =
      addsThisPeriod >= accountLimit
        ? getNextAvailableAddAtFromOldest(oldestAddEvent?.createdAt ?? null)
        : null;

    return res.status(200).json({
      ok: true,
      activeOrganizationId: access.organizationId,
      count: mappedAccounts.length,
      accounts: mappedAccounts,
      subscription: subscription
        ? {
            plan: subscription.plan,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
          }
        : null,
      role: access.role,
      permissions: {
        canAddAccounts:
          hasAccess &&
          hasRole(access.role, [MemberRole.OWNER, MemberRole.ADMIN]) &&
          addsThisPeriod < accountLimit,
        canDeleteAccounts: hasRole(access.role, [MemberRole.OWNER]),
        canRetryFailedScrapes:
          hasAccess &&
          hasRole(access.role, [MemberRole.OWNER, MemberRole.ADMIN]),
      },
      limits: {
        monthlyAccountAdds: accountLimit,
      },
      usage: {
        activeAccounts: mappedAccounts.length,
        accountsAddedThisPeriod: addsThisPeriod,
        monthlyAddsRemaining: Math.max(accountLimit - addsThisPeriod, 0),
        nextAvailableAddAt,
      },
      onboarding: {
        initialScrapeStartedAt: organization?.initialScrapeStartedAt ?? null,
        onboardingCompletedAt: organization?.onboardingCompletedAt ?? null,
      },
    });
  } catch (error) {
    console.error("Get social accounts error:", error);

    return res.status(500).json({
      ok: false,
      error: "Kunne ikke hente social accounts",
    });
  }
});

router.post(
  "/",
  requireAuth,
  socialAccountsWriteLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const clerkUserId = getAuthenticatedClerkUserId(req);
      const platform = req.body.platform;
      const rawAccountHandle = String(req.body.accountHandle ?? "");
      const displayName = req.body.displayName;
      const profileUrl = req.body.profileUrl;

      if (!clerkUserId) {
        return res.status(401).json({
          ok: false,
          error: "Ikke autentisert",
        });
      }

      if (!isValidPlatform(platform)) {
        return res.status(400).json({
          ok: false,
          error: "platform må være TIKTOK eller INSTAGRAM",
        });
      }

      const cleanedHandle = normalizeAccountHandle(rawAccountHandle, platform);

      if (!cleanedHandle || cleanedHandle.length > 100) {
        return res.status(400).json({
          ok: false,
          error: "Skriv inn et gyldig brukernavn eller en gyldig profil-lenke",
        });
      }

      const access = await getActiveOrganizationAccess(clerkUserId);

      if (!hasRole(access.role, [MemberRole.OWNER, MemberRole.ADMIN])) {
        return res.status(403).json({
          ok: false,
          error: "Kun owner eller admin kan legge til kontoer",
        });
      }

      const [organization, addsThisPeriod, oldestAddEvent, actorUser] =
        await Promise.all([
          prisma.organization.findUnique({
            where: {
              id: access.organizationId,
            },
            include: {
              subscription: true,
            },
          }),
          prisma.socialAccountAddEvent.count({
            where: {
              organizationId: access.organizationId,
              createdAt: {
                gte: getAddWindowStart(),
              },
            },
          }),
          prisma.socialAccountAddEvent.findFirst({
            where: {
              organizationId: access.organizationId,
              createdAt: {
                gte: getAddWindowStart(),
              },
            },
            orderBy: {
              createdAt: "asc",
            },
            select: {
              createdAt: true,
            },
          }),
          prisma.user.findFirst({
            where: {
              authProvider: "CLERK",
              authProviderId: clerkUserId,
            },
            select: {
              id: true,
              email: true,
            },
          }),
        ]);

      if (!organization) {
        return res.status(404).json({
          ok: false,
          error: "Fant ikke workspace",
        });
      }

      const subscription = organization.subscription ?? null;
      const addLimit = getMonthlyAccountAddLimit({
        plan: subscription?.plan,
        status: subscription?.status,
      });
      const hasAccess = hasSubscriptionAccess(
        subscription?.status,
        subscription?.currentPeriodEnd
      );

      if (!hasAccess) {
        return res.status(403).json({
          ok: false,
          error: "Workspace-et har ikke aktiv tilgang til å legge til kontoer",
        });
      }

      const existingAccount = await prisma.socialAccount.findFirst({
        where: {
          organizationId: access.organizationId,
          platform,
          accountHandle: cleanedHandle,
        },
      });

      if (existingAccount && existingAccount.isActive) {
        return res.status(409).json({
          ok: false,
          error: "Denne kontoen finnes allerede i dette workspace-et",
        });
      }

      const willConsumeQuota = !existingAccount;

      if (willConsumeQuota && addsThisPeriod >= addLimit) {
        return res.status(403).json({
          ok: false,
          error: `Dette workspace-et har nådd maks antall nye kontoer de siste 30 dagene (${addLimit})`,
          code: "MONTHLY_ACCOUNT_ADD_LIMIT_REACHED",
          limits: {
            monthlyAccountAdds: addLimit,
          },
          usage: {
            accountsAddedThisPeriod: addsThisPeriod,
            monthlyAddsRemaining: 0,
            nextAvailableAddAt: getNextAvailableAddAtFromOldest(
              oldestAddEvent?.createdAt ?? null
            ),
          },
        });
      }

      const result = await prisma.$transaction(async (tx) => {
        let socialAccount;

        if (existingAccount && !existingAccount.isActive) {
          socialAccount = await tx.socialAccount.update({
            where: {
              id: existingAccount.id,
            },
            data: {
              isActive: true,
              status: SocialAccountStatus.ACTIVE,
              initialSyncStatus: InitialSyncStatus.PENDING,
              needsInitialSync: true,
              accountHandle: cleanedHandle,
              displayName:
                typeof displayName === "string"
                  ? displayName.trim() || null
                  : null,
              profileUrl:
                typeof profileUrl === "string" ? profileUrl.trim() || null : null,
            },
          });
        } else {
          socialAccount = await tx.socialAccount.create({
            data: {
              organizationId: access.organizationId,
              platform,
              accountHandle: cleanedHandle,
              displayName:
                typeof displayName === "string"
                  ? displayName.trim() || null
                  : null,
              profileUrl:
                typeof profileUrl === "string" ? profileUrl.trim() || null : null,
              status: SocialAccountStatus.ACTIVE,
              initialSyncStatus: InitialSyncStatus.PENDING,
              needsInitialSync: true,
              isActive: true,
            },
          });
        }

        if (willConsumeQuota) {
          await tx.socialAccountAddEvent.create({
            data: {
              organizationId: access.organizationId,
              socialAccountId: socialAccount.id,
              platform,
              accountHandle: cleanedHandle,
            },
          });
        }

        const existingInitialJob = await tx.scrapeJob.findFirst({
          where: {
            organizationId: access.organizationId,
            socialAccountId: socialAccount.id,
            type: ScrapeJobType.INITIAL,
            status: {
              in: [ScrapeJobStatus.PENDING, ScrapeJobStatus.RUNNING],
            },
          },
          select: {
            id: true,
          },
        });

        if (!existingInitialJob) {
          await tx.scrapeJob.create({
            data: {
              organizationId: access.organizationId,
              socialAccountId: socialAccount.id,
              type: ScrapeJobType.INITIAL,
              status: ScrapeJobStatus.PENDING,
              priority: 100,
            },
          });
        }

        return socialAccount;
      });

      await logAdminEvent({
        actorUserId: actorUser?.id ?? null,
        actorEmail: actorUser?.email ?? null,
        action: existingAccount
          ? "SOCIAL_ACCOUNT_REACTIVATED"
          : "SOCIAL_ACCOUNT_CREATED",
        targetType: "social_account",
        targetId: result.id,
        organizationId: access.organizationId,
        metadata: {
          platform: result.platform,
          accountHandle: result.accountHandle,
          displayName: result.displayName,
          profileUrl: result.profileUrl,
          quotaConsumed: willConsumeQuota,
        },
      });

      return res.status(201).json({
        ok: true,
        action: existingAccount ? "reactivated" : "created",
        message: existingAccount
          ? "Social account reaktivert og initial scrape startet"
          : "Social account opprettet og initial scrape startet",
        activeOrganizationId: access.organizationId,
        socialAccount: result,
        limits: {
          monthlyAccountAdds: addLimit,
        },
        usage: {
          accountsAddedThisPeriod: addsThisPeriod + (willConsumeQuota ? 1 : 0),
          monthlyAddsRemaining: Math.max(
            addLimit - (addsThisPeriod + (willConsumeQuota ? 1 : 0)),
            0
          ),
          nextAvailableAddAt: null,
        },
      });
    } catch (error) {
      console.error("Create social account error:", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke opprette social account",
      });
    }
  }
);

router.post(
  "/initial-submit",
  requireAuth,
  initialSubmitLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const clerkUserId = getAuthenticatedClerkUserId(req);
      const rawAccounts = Array.isArray(req.body.accounts) ? req.body.accounts : [];

      if (!clerkUserId) {
        return res.status(401).json({
          ok: false,
          error: "Ikke autentisert",
        });
      }

      if (rawAccounts.length === 0) {
        return res.status(400).json({
          ok: false,
          error: "Du må legge til minst én konto",
        });
      }

      const access = await getActiveOrganizationAccess(clerkUserId);

      if (!hasRole(access.role, [MemberRole.OWNER, MemberRole.ADMIN])) {
        return res.status(403).json({
          ok: false,
          error: "Kun owner eller admin kan legge til kontoer",
        });
      }

      const [organization, actorUser] = await Promise.all([
        prisma.organization.findUnique({
          where: {
            id: access.organizationId,
          },
          include: {
            subscription: true,
            socialAccounts: {
              select: {
                id: true,
                platform: true,
                accountHandle: true,
                isActive: true,
              },
            },
          },
        }),
        prisma.user.findFirst({
          where: {
            authProvider: "CLERK",
            authProviderId: clerkUserId,
          },
          select: {
            id: true,
            email: true,
          },
        }),
      ]);

      if (!organization) {
        return res.status(404).json({
          ok: false,
          error: "Fant ikke workspace",
        });
      }

      const [addsThisPeriod, oldestAddEvent] = await Promise.all([
        prisma.socialAccountAddEvent.count({
          where: {
            organizationId: access.organizationId,
            createdAt: {
              gte: getAddWindowStart(),
            },
          },
        }),
        prisma.socialAccountAddEvent.findFirst({
          where: {
            organizationId: access.organizationId,
            createdAt: {
              gte: getAddWindowStart(),
            },
          },
          orderBy: {
            createdAt: "asc",
          },
          select: {
            createdAt: true,
          },
        }),
      ]);

      const subscription = organization.subscription ?? null;
      const addLimit = getMonthlyAccountAddLimit({
        plan: subscription?.plan,
        status: subscription?.status,
      });
      const hasAccess = hasSubscriptionAccess(
        subscription?.status,
        subscription?.currentPeriodEnd
      );

      if (!hasAccess) {
        return res.status(403).json({
          ok: false,
          error: "Workspace-et har ikke aktiv tilgang til å legge til kontoer",
        });
      }

      const normalizedAccounts: PendingAccountInput[] = rawAccounts.map(
        (item: InitialSubmitBodyItem) => {
          const rawPlatform = item?.platform;
          const rawHandle = String(item?.accountHandle ?? "");
          const cleanedPlatform = isValidPlatform(rawPlatform) ? rawPlatform : null;

          if (!cleanedPlatform) {
            throw new Error("En eller flere kontoer har ugyldig plattform");
          }

          const cleanedHandle = normalizeAccountHandle(
            rawHandle,
            cleanedPlatform
          );

          if (!cleanedHandle || cleanedHandle.length > 100) {
            throw new Error(
              "En eller flere kontoer har ugyldig brukernavn eller lenke"
            );
          }

          return {
            platform: cleanedPlatform,
            accountHandle: cleanedHandle,
            displayName:
              typeof item?.displayName === "string"
                ? item.displayName.trim() || null
                : null,
            profileUrl:
              typeof item?.profileUrl === "string"
                ? item.profileUrl.trim() || null
                : null,
          };
        }
      );

      const uniqueMap = new Map<string, PendingAccountInput>();

      for (const account of normalizedAccounts) {
        const key = `${account.platform}:${account.accountHandle}`;
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, account);
        }
      }

      const dedupedAccounts = Array.from(uniqueMap.values());

      const existingAccounts =
        dedupedAccounts.length > 0
          ? await prisma.socialAccount.findMany({
              where: {
                organizationId: access.organizationId,
                OR: dedupedAccounts.map((account) => ({
                  platform: account.platform,
                  accountHandle: account.accountHandle,
                })),
              },
              select: {
                id: true,
                platform: true,
                accountHandle: true,
                isActive: true,
              },
            })
          : [];

      const existingKeyMap = new Map(
        existingAccounts.map((account) => [
          `${account.platform}:${account.accountHandle}`,
          account,
        ])
      );

      const accountsThatConsumeQuota = dedupedAccounts.filter((account) => {
        const existing = existingKeyMap.get(
          `${account.platform}:${account.accountHandle}`
        );
        return !existing;
      });

      if (addsThisPeriod + accountsThatConsumeQuota.length > addLimit) {
        return res.status(403).json({
          ok: false,
          error: `Dette workspace-et kan ikke legge til så mange nye kontoer nå. Maks de siste 30 dagene er ${addLimit}.`,
          code: "MONTHLY_ACCOUNT_ADD_LIMIT_REACHED",
          limits: {
            monthlyAccountAdds: addLimit,
          },
          usage: {
            accountsAddedThisPeriod: addsThisPeriod,
            monthlyAddsRemaining: Math.max(addLimit - addsThisPeriod, 0),
            nextAvailableAddAt: getNextAvailableAddAtFromOldest(
              oldestAddEvent?.createdAt ?? null
            ),
          },
        });
      }

      const result = await prisma.$transaction(async (tx) => {
        const createdAccounts = [];
        let createdAddEvents = 0;

        for (const account of dedupedAccounts) {
          const existing = await tx.socialAccount.findFirst({
            where: {
              organizationId: access.organizationId,
              platform: account.platform,
              accountHandle: account.accountHandle,
            },
          });

          let socialAccount;

          if (existing) {
            socialAccount = await tx.socialAccount.update({
              where: {
                id: existing.id,
              },
              data: {
                isActive: true,
                status: SocialAccountStatus.ACTIVE,
                initialSyncStatus: InitialSyncStatus.PENDING,
                needsInitialSync: true,
                displayName: account.displayName ?? existing.displayName,
                profileUrl: account.profileUrl ?? existing.profileUrl,
              },
            });
          } else {
            socialAccount = await tx.socialAccount.create({
              data: {
                organizationId: access.organizationId,
                platform: account.platform,
                accountHandle: account.accountHandle,
                displayName: account.displayName ?? null,
                profileUrl: account.profileUrl ?? null,
                status: SocialAccountStatus.ACTIVE,
                initialSyncStatus: InitialSyncStatus.PENDING,
                needsInitialSync: true,
                isActive: true,
              },
            });

            await tx.socialAccountAddEvent.create({
              data: {
                organizationId: access.organizationId,
                socialAccountId: socialAccount.id,
                platform: account.platform,
                accountHandle: account.accountHandle,
              },
            });

            createdAddEvents += 1;
          }

          const existingInitialJob = await tx.scrapeJob.findFirst({
            where: {
              organizationId: access.organizationId,
              socialAccountId: socialAccount.id,
              type: ScrapeJobType.INITIAL,
              status: {
                in: [ScrapeJobStatus.PENDING, ScrapeJobStatus.RUNNING],
              },
            },
            select: {
              id: true,
            },
          });

          if (!existingInitialJob) {
            await tx.scrapeJob.create({
              data: {
                organizationId: access.organizationId,
                socialAccountId: socialAccount.id,
                type: ScrapeJobType.INITIAL,
                status: ScrapeJobStatus.PENDING,
                priority: 100,
              },
            });
          }

          createdAccounts.push(socialAccount);
        }

        const updatedOrganization = await tx.organization.update({
          where: {
            id: access.organizationId,
          },
          data: {
            initialScrapeStartedAt: new Date(),
          },
        });

        return {
          createdAccounts,
          updatedOrganization,
          createdAddEvents,
        };
      });

      await logAdminEvent({
        actorUserId: actorUser?.id ?? null,
        actorEmail: actorUser?.email ?? null,
        action: "SOCIAL_ACCOUNTS_INITIAL_SUBMIT",
        targetType: "organization",
        targetId: access.organizationId,
        organizationId: access.organizationId,
        metadata: {
          submittedCount: dedupedAccounts.length,
          createdCount: result.createdAddEvents,
          submittedAccounts: dedupedAccounts.map((account) => ({
            platform: account.platform,
            accountHandle: account.accountHandle,
            displayName: account.displayName ?? null,
          })),
        },
      });

      return res.status(200).json({
        ok: true,
        message: "Initial scrape startet",
        activeOrganizationId: access.organizationId,
        accounts: result.createdAccounts,
        limits: {
          monthlyAccountAdds: addLimit,
        },
        usage: {
          accountsAddedThisPeriod: addsThisPeriod + result.createdAddEvents,
          monthlyAddsRemaining: Math.max(
            addLimit - (addsThisPeriod + result.createdAddEvents),
            0
          ),
          nextAvailableAddAt: null,
        },
        onboarding: {
          initialScrapeStartedAt:
            result.updatedOrganization.initialScrapeStartedAt,
          onboardingCompletedAt: result.updatedOrganization.onboardingCompletedAt,
        },
      });
    } catch (error) {
      console.error("Initial submit error:", error);

      return res.status(500).json({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Kunne ikke starte initial scrape",
      });
    }
  }
);

router.get(
  "/initial-sync-status",
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

      const [organization, accounts] = await Promise.all([
        prisma.organization.findUnique({
          where: {
            id: access.organizationId,
          },
          select: {
            id: true,
            initialScrapeStartedAt: true,
            onboardingCompletedAt: true,
          },
        }),
        prisma.socialAccount.findMany({
          where: {
            organizationId: access.organizationId,
            isActive: true,
          },
          select: {
            id: true,
            platform: true,
            accountHandle: true,
            displayName: true,
            initialSyncStatus: true,
            status: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        }),
      ]);

      const completedAccounts = accounts.filter(
        (account) => account.initialSyncStatus === InitialSyncStatus.COMPLETED
      );

      const runningAccounts = accounts.filter(
        (account) =>
          account.initialSyncStatus === InitialSyncStatus.RUNNING ||
          account.initialSyncStatus === InitialSyncStatus.PENDING
      );

      const failedAccounts = accounts.filter(
        (account) => account.initialSyncStatus === InitialSyncStatus.FAILED
      );

      const quotaBlocked = isApifyQuotaBlocked();
      const quotaBlockedUntil = getApifyQuotaBlockedUntil();

      const allFinished = runningAccounts.length === 0 && accounts.length > 0;
      const allFailed =
        allFinished &&
        completedAccounts.length === 0 &&
        failedAccounts.length > 0;

      const allPendingWhileQuotaBlocked =
        quotaBlocked &&
        accounts.length > 0 &&
        completedAccounts.length === 0 &&
        runningAccounts.length > 0 &&
        failedAccounts.length === 0;

      if (
        completedAccounts.length > 0 &&
        organization &&
        !organization.onboardingCompletedAt
      ) {
        await prisma.organization.update({
          where: {
            id: access.organizationId,
          },
          data: {
            onboardingCompletedAt: new Date(),
          },
        });
      }

      return res.status(200).json({
        ok: true,
        organization,
        summary: {
          total: accounts.length,
          completed: completedAccounts.length,
          inProgress: runningAccounts.length,
          failed: failedAccounts.length,
          hasAtLeastOneCompleted: completedAccounts.length > 0,
          hasFailures: failedAccounts.length > 0,
          allFinished,
          allFailed,
          isQuotaBlocked: quotaBlocked,
          quotaBlockedUntil,
          allPendingWhileQuotaBlocked,
        },
        accounts,
      });
    } catch (error) {
      console.error("Initial sync status error:", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke hente initial sync-status",
      });
    }
  }
);

router.patch(
  "/:socialAccountId/display-name",
  requireAuth,
  socialAccountsWriteLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const clerkUserId = getAuthenticatedClerkUserId(req);
      const socialAccountId = String(req.params.socialAccountId ?? "").trim();
      const displayName = req.body?.displayName;

      if (!clerkUserId) {
        return res.status(401).json({
          ok: false,
          error: "Ikke autentisert",
        });
      }

      if (!socialAccountId) {
        return res.status(400).json({
          ok: false,
          error: "socialAccountId er påkrevd",
        });
      }

      const access = await getActiveOrganizationAccess(clerkUserId);

      if (!hasRole(access.role, [MemberRole.OWNER, MemberRole.ADMIN])) {
        return res.status(403).json({
          ok: false,
          error: "Kun owner eller admin kan redigere visningsnavn",
        });
      }

      const [existingAccount, actorUser] = await Promise.all([
        prisma.socialAccount.findFirst({
          where: {
            id: socialAccountId,
            organizationId: access.organizationId,
            isActive: true,
          },
        }),
        prisma.user.findFirst({
          where: {
            authProvider: "CLERK",
            authProviderId: clerkUserId,
          },
          select: {
            id: true,
            email: true,
          },
        }),
      ]);

      if (!existingAccount) {
        return res.status(404).json({
          ok: false,
          error: "Fant ikke konto for aktivt workspace",
        });
      }

      const previousDisplayName = existingAccount.displayName ?? null;

      const updatedAccount = await prisma.socialAccount.update({
        where: {
          id: existingAccount.id,
        },
        data: {
          displayName:
            typeof displayName === "string" && displayName.trim() !== ""
              ? displayName.trim()
              : null,
        },
      });

      await logAdminEvent({
        actorUserId: actorUser?.id ?? null,
        actorEmail: actorUser?.email ?? null,
        action: "SOCIAL_ACCOUNT_DISPLAY_NAME_UPDATED",
        targetType: "social_account",
        targetId: updatedAccount.id,
        organizationId: access.organizationId,
        metadata: {
          platform: updatedAccount.platform,
          accountHandle: updatedAccount.accountHandle,
          previousDisplayName,
          newDisplayName: updatedAccount.displayName ?? null,
        },
      });

      return res.status(200).json({
        ok: true,
        message: "Visningsnavn oppdatert",
        socialAccount: updatedAccount,
      });
    } catch (error) {
      console.error("Update display name error:", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke oppdatere visningsnavn",
      });
    }
  }
);

router.post(
  "/:socialAccountId/retry",
  requireAuth,
  retryScrapeLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const clerkUserId = getAuthenticatedClerkUserId(req);
      const socialAccountId = String(req.params.socialAccountId ?? "").trim();
      const { jobType } = (req.body ?? {}) as RetryJobBody;

      if (!clerkUserId) {
        return res.status(401).json({
          ok: false,
          error: "Ikke autentisert",
        });
      }

      if (!socialAccountId) {
        return res.status(400).json({
          ok: false,
          error: "socialAccountId er påkrevd",
        });
      }

      if (!isRetryableJobType(jobType)) {
        return res.status(400).json({
          ok: false,
          error: "jobType må være INITIAL eller DAILY",
        });
      }

      const access = await getActiveOrganizationAccess(clerkUserId);

      if (!hasRole(access.role, [MemberRole.OWNER, MemberRole.ADMIN])) {
        return res.status(403).json({
          ok: false,
          error: "Kun owner eller admin kan restarte feilet scraping",
        });
      }

      const [organization, socialAccount, actorUser] = await Promise.all([
        prisma.organization.findUnique({
          where: {
            id: access.organizationId,
          },
          include: {
            subscription: true,
          },
        }),
        prisma.socialAccount.findFirst({
          where: {
            id: socialAccountId,
            organizationId: access.organizationId,
            isActive: true,
          },
          select: {
            id: true,
            organizationId: true,
            platform: true,
            accountHandle: true,
            displayName: true,
            initialSyncStatus: true,
            lastDailyJobCreatedAt: true,
          },
        }),
        prisma.user.findFirst({
          where: {
            authProvider: "CLERK",
            authProviderId: clerkUserId,
          },
          select: {
            id: true,
            email: true,
          },
        }),
      ]);

      if (!organization?.subscription) {
        return res.status(404).json({
          ok: false,
          error: "Fant ikke aktivt workspace eller abonnement",
        });
      }

      const subscription = organization.subscription;
      const hasAccess = hasSubscriptionAccess(
        subscription.status,
        subscription.currentPeriodEnd
      );

      if (!hasAccess) {
        return res.status(403).json({
          ok: false,
          error: "Workspace-et har ikke aktiv tilgang til scraping",
        });
      }

      if (!socialAccount) {
        return res.status(404).json({
          ok: false,
          error: "Fant ikke konto for aktivt workspace",
        });
      }

      const existingQueuedOrRunningJob = await prisma.scrapeJob.findFirst({
        where: {
          organizationId: access.organizationId,
          socialAccountId,
          type: jobType,
          status: {
            in: [ScrapeJobStatus.PENDING, ScrapeJobStatus.RUNNING],
          },
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (existingQueuedOrRunningJob) {
        return res.status(409).json({
          ok: false,
          error: "Det finnes allerede en aktiv scraping-jobb for denne kontoen",
        });
      }

      const latestJob = await prisma.scrapeJob.findFirst({
        where: {
          organizationId: access.organizationId,
          socialAccountId,
          type: jobType,
        },
        select: {
          id: true,
          type: true,
          status: true,
          errorMessage: true,
          createdAt: true,
          startedAt: true,
          finishedAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (!latestJob || latestJob.status !== ScrapeJobStatus.FAILED) {
        return res.status(400).json({
          ok: false,
          error:
            jobType === ScrapeJobType.INITIAL
              ? "Kun feilet initial scraping kan restartes"
              : "Kun feilet daglig data-innhenting kan restartes",
        });
      }

      if (
        jobType === ScrapeJobType.INITIAL &&
        socialAccount.initialSyncStatus !== InitialSyncStatus.FAILED
      ) {
        return res.status(400).json({
          ok: false,
          error: "Initial scraping er ikke markert som feilet for denne kontoen",
        });
      }

      const newJob = await prisma.$transaction(async (tx) => {
        const createdJob = await tx.scrapeJob.create({
          data: {
            organizationId: access.organizationId,
            socialAccountId,
            type: jobType,
            status: ScrapeJobStatus.PENDING,
            scheduledFor: new Date(),
            priority: jobType === ScrapeJobType.INITIAL ? 120 : 80,
          },
          select: {
            id: true,
            type: true,
            status: true,
            errorMessage: true,
            createdAt: true,
            startedAt: true,
            finishedAt: true,
          },
        });

        if (jobType === ScrapeJobType.INITIAL) {
          await tx.socialAccount.update({
            where: {
              id: socialAccountId,
            },
            data: {
              initialSyncStatus: InitialSyncStatus.PENDING,
              needsInitialSync: true,
            },
          });
        }

        if (jobType === ScrapeJobType.DAILY) {
          await tx.socialAccount.update({
            where: {
              id: socialAccountId,
            },
            data: {
              lastDailyJobCreatedAt: new Date(),
            },
          });
        }

        return createdJob;
      });

      await logAdminEvent({
        actorUserId: actorUser?.id ?? null,
        actorEmail: actorUser?.email ?? null,
        action:
          jobType === ScrapeJobType.INITIAL
            ? "SOCIAL_ACCOUNT_INITIAL_RETRY_QUEUED"
            : "SOCIAL_ACCOUNT_DAILY_RETRY_QUEUED",
        targetType: "social_account",
        targetId: socialAccount.id,
        organizationId: access.organizationId,
        metadata: {
          platform: socialAccount.platform,
          accountHandle: socialAccount.accountHandle,
          displayName: socialAccount.displayName,
          retriedJobType: jobType,
          previousFailedJobId: latestJob.id,
          newJobId: newJob.id,
        },
      });

      return res.status(200).json({
        ok: true,
        message:
          jobType === ScrapeJobType.INITIAL
            ? "Initial scraping er lagt i kø på nytt"
            : "Daglig data-innhenting er lagt i kø på nytt",
        retry: {
          jobType,
          queuedJob: toLatestJobSummary(newJob),
        },
      });
    } catch (error) {
      console.error("Retry social account scrape error:", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke restarte scraping",
      });
    }
  }
);

router.delete(
  "/:socialAccountId",
  requireAuth,
  socialAccountsWriteLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const clerkUserId = getAuthenticatedClerkUserId(req);
      const socialAccountId = String(req.params.socialAccountId ?? "").trim();

      if (!clerkUserId) {
        return res.status(401).json({
          ok: false,
          error: "Ikke autentisert",
        });
      }

      if (!socialAccountId) {
        return res.status(400).json({
          ok: false,
          error: "socialAccountId er påkrevd",
        });
      }

      const access = await getActiveOrganizationAccess(clerkUserId);

      if (!hasRole(access.role, [MemberRole.OWNER])) {
        return res.status(403).json({
          ok: false,
          error: "Kun owner kan slette tracked accounts",
        });
      }

      const [activeAccountsCount, existingAccount, actorUser] = await Promise.all([
        prisma.socialAccount.count({
          where: {
            organizationId: access.organizationId,
            isActive: true,
          },
        }),
        prisma.socialAccount.findFirst({
          where: {
            id: socialAccountId,
            organizationId: access.organizationId,
            isActive: true,
          },
        }),
        prisma.user.findFirst({
          where: {
            authProvider: "CLERK",
            authProviderId: clerkUserId,
          },
          select: {
            id: true,
            email: true,
          },
        }),
      ]);

      if (activeAccountsCount <= 1) {
        return res.status(400).json({
          ok: false,
          error: "Du kan ikke slette den eneste aktive kontoen i workspace-et",
        });
      }

      if (!existingAccount) {
        return res.status(404).json({
          ok: false,
          error: "Fant ikke konto for aktivt workspace",
        });
      }

      const updatedAccount = await prisma.socialAccount.update({
        where: {
          id: existingAccount.id,
        },
        data: {
          isActive: false,
          status: SocialAccountStatus.DISCONNECTED,
        },
      });

      const remainingCount = await prisma.socialAccount.count({
        where: {
          organizationId: access.organizationId,
          isActive: true,
        },
      });

      await logAdminEvent({
        actorUserId: actorUser?.id ?? null,
        actorEmail: actorUser?.email ?? null,
        action: "SOCIAL_ACCOUNT_DEACTIVATED",
        targetType: "social_account",
        targetId: updatedAccount.id,
        organizationId: access.organizationId,
        metadata: {
          platform: updatedAccount.platform,
          accountHandle: updatedAccount.accountHandle,
          remainingActiveAccounts: remainingCount,
        },
      });

      return res.status(200).json({
        ok: true,
        message: "Konto fjernet",
        socialAccount: updatedAccount,
        usage: {
          activeAccounts: remainingCount,
        },
      });
    } catch (error) {
      console.error("Delete social account error:", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke fjerne social account",
      });
    }
  }
);

export default router;