import { Router } from "express";
import {
  AccessRequestStatus,
  InitialSyncStatus,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@prisma/client";
import { prisma } from "../prisma";
import { ensureClerkUserExists } from "../services/ensureClerkUser";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middleware/requireAuth";
import { meLimiter } from "../middleware/rateLimiters";

const router = Router();

function getAuthenticatedClerkUserId(req: AuthenticatedRequest): string | null {
  return req.auth?.clerkUserId ?? req.auth?.userId ?? null;
}

async function getCurrentUserByClerkId(clerkUserId: string) {
  return prisma.user.findFirst({
    where: {
      authProvider: "CLERK",
      authProviderId: clerkUserId,
    },
  });
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

router.get("/", requireAuth, meLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const clerkUserId = getAuthenticatedClerkUserId(req);

    if (!clerkUserId) {
      return res.status(401).json({
        ok: false,
        error: "Ikke autentisert",
      });
    }

    await ensureClerkUserExists(clerkUserId);

    const user = await prisma.user.findFirst({
      where: {
        authProvider: "CLERK",
        authProviderId: clerkUserId,
      },
      include: {
        memberships: {
          include: {
            organization: {
              include: {
                subscription: true,
                socialAccounts: {
                  where: {
                    isActive: true,
                  },
                  select: {
                    id: true,
                    initialSyncStatus: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
        activeOrganization: {
          include: {
            subscription: true,
            socialAccounts: {
              where: {
                isActive: true,
              },
              select: {
                id: true,
                initialSyncStatus: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        ok: false,
        error: "Fant ikke bruker",
      });
    }

    const latestAccessRequest = await prisma.accessRequest.findFirst({
      where: {
        userId: user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const organizations = user.memberships.map((membership) => ({
      membershipId: membership.id,
      role: membership.role,
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        createdAt: membership.organization.createdAt,
        updatedAt: membership.organization.updatedAt,
        initialScrapeStartedAt: membership.organization.initialScrapeStartedAt,
        onboardingCompletedAt: membership.organization.onboardingCompletedAt,
        socialAccountsCount: membership.organization.socialAccounts.length,
        subscription: membership.organization.subscription
          ? {
              id: membership.organization.subscription.id,
              plan: membership.organization.subscription.plan,
              status: membership.organization.subscription.status,
              currentPeriodEnd:
                membership.organization.subscription.currentPeriodEnd,
            }
          : null,
      },
    }));

    let activeOrganizationId = user.activeOrganizationId;

    if (!activeOrganizationId && organizations.length > 0) {
      activeOrganizationId = organizations[0].organization.id;

      await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          activeOrganizationId,
        },
      });
    }

    const resolvedActiveOrganization =
      user.activeOrganization && user.activeOrganizationId
        ? user.activeOrganization
        : activeOrganizationId
          ? user.memberships.find(
              (membership) => membership.organization.id === activeOrganizationId
            )?.organization ?? null
          : null;

    const activeOrganization = resolvedActiveOrganization
      ? {
          id: resolvedActiveOrganization.id,
          name: resolvedActiveOrganization.name,
          slug: resolvedActiveOrganization.slug,
          createdAt: resolvedActiveOrganization.createdAt,
          updatedAt: resolvedActiveOrganization.updatedAt,
          initialScrapeStartedAt:
            resolvedActiveOrganization.initialScrapeStartedAt,
          onboardingCompletedAt:
            resolvedActiveOrganization.onboardingCompletedAt,
          socialAccountsCount: resolvedActiveOrganization.socialAccounts.length,
          socialAccounts: resolvedActiveOrganization.socialAccounts,
          subscription: resolvedActiveOrganization.subscription
            ? {
                id: resolvedActiveOrganization.subscription.id,
                plan: resolvedActiveOrganization.subscription.plan,
                status: resolvedActiveOrganization.subscription.status,
                currentPeriodEnd:
                  resolvedActiveOrganization.subscription.currentPeriodEnd,
              }
            : null,
        }
      : null;

    let requiresOnboarding = false;
    let requiresUpgrade = false;
    let requiresAccessRequest = false;
    let hasAccess = false;
    let requiresInitialAccountOnboarding = false;
    let isInitialScrapeRunning = false;
    let upgradeReason:
      | "trial_expired"
      | "missing_subscription"
      | "inactive_subscription"
      | null = null;

    if (!activeOrganization) {
      if (latestAccessRequest?.status === AccessRequestStatus.APPROVED) {
        requiresOnboarding = true;
        requiresAccessRequest = false;
      } else {
        requiresOnboarding = false;
        requiresAccessRequest = true;
      }
    } else {
      const sub = activeOrganization.subscription;

      if (!sub) {
        requiresUpgrade = true;
        upgradeReason = "missing_subscription";
      } else if (isExpiredTrialSubscription(sub)) {
        requiresUpgrade = true;
        upgradeReason = "trial_expired";
      } else if (
        sub.status === SubscriptionStatus.ACTIVE ||
        sub.status === SubscriptionStatus.TRIALING
      ) {
        hasAccess = true;
      } else {
        requiresUpgrade = true;
        upgradeReason = "inactive_subscription";
      }

      if (hasAccess) {
        const socialAccounts = activeOrganization.socialAccounts ?? [];
        const noAccountsYet = socialAccounts.length === 0;
        const hasAccounts = socialAccounts.length > 0;
        const onboardingCompleted = Boolean(
          activeOrganization.onboardingCompletedAt
        );
        const initialScrapeStarted = Boolean(
          activeOrganization.initialScrapeStartedAt
        );

        const hasCompletedAccounts = socialAccounts.some(
          (account) => account.initialSyncStatus === InitialSyncStatus.COMPLETED
        );

        const hasRunningAccounts = socialAccounts.some(
          (account) =>
            account.initialSyncStatus === InitialSyncStatus.RUNNING ||
            account.initialSyncStatus === InitialSyncStatus.PENDING
        );

        const hasFailedAccounts = socialAccounts.some(
          (account) => account.initialSyncStatus === InitialSyncStatus.FAILED
        );

        const allAccountsFailed =
          hasAccounts &&
          !hasCompletedAccounts &&
          !hasRunningAccounts &&
          hasFailedAccounts;

        if (!onboardingCompleted && !initialScrapeStarted && noAccountsYet) {
          requiresInitialAccountOnboarding = true;
        }

        if (!onboardingCompleted && initialScrapeStarted && hasRunningAccounts) {
          isInitialScrapeRunning = true;
        }

        if (allAccountsFailed) {
          requiresInitialAccountOnboarding = false;
          isInitialScrapeRunning = false;
        }
      }
    }

    return res.status(200).json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        authProvider: user.authProvider,
        authProviderId: user.authProviderId,
        activeOrganizationId,
      },
      organizations,
      activeOrganization: activeOrganization
        ? {
            id: activeOrganization.id,
            name: activeOrganization.name,
            slug: activeOrganization.slug,
            createdAt: activeOrganization.createdAt,
            updatedAt: activeOrganization.updatedAt,
            initialScrapeStartedAt: activeOrganization.initialScrapeStartedAt,
            onboardingCompletedAt: activeOrganization.onboardingCompletedAt,
            socialAccountsCount: activeOrganization.socialAccountsCount,
            subscription: activeOrganization.subscription,
          }
        : null,
      accessRequest: latestAccessRequest
        ? {
            id: latestAccessRequest.id,
            status: latestAccessRequest.status,
            workspaceName: latestAccessRequest.workspaceName,
            selectedPlan: latestAccessRequest.selectedPlan,
            createdAt: latestAccessRequest.createdAt,
            updatedAt: latestAccessRequest.updatedAt,
          }
        : null,
      access: {
        hasAccess,
        requiresOnboarding,
        requiresUpgrade,
        requiresAccessRequest,
        upgradeReason,
        requiresInitialAccountOnboarding,
        isInitialScrapeRunning,
      },
    });
  } catch (error) {
    console.error("GET /me error FULL:", error);
    console.error(
      "GET /me error STACK:",
      error instanceof Error ? error.stack : "Ingen stack"
    );
    console.error(
      "GET /me error JSON:",
      JSON.stringify(
        error,
        Object.getOwnPropertyNames(error instanceof Object ? error : {}),
        2
      )
    );

    return res.status(500).json({
      ok: false,
      error:
        error instanceof Error ? error.message : "Kunne ikke hente brukerdata",
    });
  }
});

router.patch(
  "/profile",
  requireAuth,
  meLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const clerkUserId = getAuthenticatedClerkUserId(req);
      const name = String(req.body.name ?? "").trim();

      if (!clerkUserId) {
        return res.status(401).json({
          ok: false,
          error: "Ikke autentisert",
        });
      }

      if (!name) {
        return res.status(400).json({
          ok: false,
          error: "name er påkrevd",
        });
      }

      await ensureClerkUserExists(clerkUserId);

      const user = await getCurrentUserByClerkId(clerkUserId);

      if (!user) {
        return res.status(404).json({
          ok: false,
          error: "Fant ikke bruker",
        });
      }

      const updatedUser = await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          name,
        },
      });

      return res.status(200).json({
        ok: true,
        message: "Profil oppdatert",
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          activeOrganizationId: updatedUser.activeOrganizationId,
        },
      });
    } catch (error) {
      console.error("PATCH /me/profile error:", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke oppdatere profil",
      });
    }
  }
);

router.post(
  "/active-organization",
  requireAuth,
  meLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const clerkUserId = getAuthenticatedClerkUserId(req);
      const organizationId = String(req.body.organizationId ?? "").trim();

      if (!clerkUserId) {
        return res.status(401).json({
          ok: false,
          error: "Ikke autentisert",
        });
      }

      if (!organizationId) {
        return res.status(400).json({
          ok: false,
          error: "organizationId er påkrevd",
        });
      }

      await ensureClerkUserExists(clerkUserId);

      const user = await prisma.user.findFirst({
        where: {
          authProvider: "CLERK",
          authProviderId: clerkUserId,
        },
        include: {
          memberships: {
            select: {
              organizationId: true,
            },
          },
        },
      });

      if (!user) {
        return res.status(404).json({
          ok: false,
          error: "Fant ikke bruker",
        });
      }

      const hasAccess = user.memberships.some(
        (membership) => membership.organizationId === organizationId
      );

      if (!hasAccess) {
        return res.status(403).json({
          ok: false,
          error: "Brukeren har ikke tilgang til denne organization",
        });
      }

      const updatedUser = await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          activeOrganizationId: organizationId,
        },
      });

      return res.status(200).json({
        ok: true,
        message: "Aktiv organization oppdatert",
        activeOrganizationId: updatedUser.activeOrganizationId,
      });
    } catch (error) {
      console.error("POST /me/active-organization error:", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke oppdatere aktiv organization",
      });
    }
  }
);

export default router;