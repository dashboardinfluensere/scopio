import { Router } from "express";
import { z } from "zod";
import {
  AccessRequestStatus,
  InitialSyncStatus,
  MemberRole,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma";
import { ensureClerkUserExists } from "../services/ensureClerkUser";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middleware/requireAuth";
import {
  sensitiveActionLimiter,
  joinWorkspaceLimiter,
  deleteWorkspaceLimiter,
} from "../middleware/rateLimiters";
import { hasRole } from "../services/hasRole";
import { logAdminEvent } from "../services/adminLogs";

const router = Router();

const organizationIdParamSchema = z.object({
  organizationId: z.string().trim().min(1, "organizationId er påkrevd"),
});

const membershipParamsSchema = z.object({
  organizationId: z.string().trim().min(1, "organizationId er påkrevd"),
  membershipId: z.string().trim().min(1, "membershipId er påkrevd"),
});

const createOrganizationBodySchema = z.object({
  name: z.string().trim().min(1, "Navn på workspace er påkrevd"),
  password: z.string().trim().min(4, "Passord må være minst 4 tegn"),
  selectedPlan: z.enum(["pro-trial", "pro", "business"]).optional(),
});

const setActiveBodySchema = z.object({
  organizationId: z.string().trim().min(1, "organizationId er påkrevd"),
});

const upgradeActiveBodySchema = z.object({
  selectedPlan: z.enum(["pro", "business"]).optional(),
});

const renameOrganizationBodySchema = z.object({
  name: z.string().trim().min(1, "Navn på workspace er påkrevd"),
});

const updatePasswordBodySchema = z.object({
  password: z.string().trim().min(4, "Passord må være minst 4 tegn"),
});

const joinOrganizationBodySchema = z.object({
  organizationId: z.string().trim().min(1, "organizationId er påkrevd"),
  password: z.string().trim().min(1, "Passord er påkrevd"),
});

const updateMemberRoleBodySchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"], {
    error: "Rollen må være ADMIN eller MEMBER",
  }),
});

const deleteOrganizationBodySchema = z.object({
  confirmationText: z.string().trim().refine((value) => value === "SLETT", {
    message: "Skriv SLETT for å bekrefte sletting",
  }),
});

function getFirstZodError(error: z.ZodError) {
  return error.issues[0]?.message || "Ugyldig input";
}

function getAuthenticatedClerkUserId(req: AuthenticatedRequest): string | null {
  return req.auth?.clerkUserId ?? req.auth?.userId ?? null;
}

function buildSlugBase(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildUniqueSlug(name: string) {
  const slugBase = buildSlugBase(name);
  return `${slugBase || "workspace"}-${Date.now()}`;
}

function getMemberLimitFromPlan(plan: SubscriptionPlan | null | undefined) {
  if (plan === SubscriptionPlan.BUSINESS) {
    return 10;
  }

  if (plan === SubscriptionPlan.PRO) {
    return 2;
  }

  if (plan === SubscriptionPlan.STARTER) {
    return 1;
  }

  return 1;
}

function resolveSubscriptionFromSelectedPlan(selectedPlanRaw: unknown) {
  const selectedPlan = String(selectedPlanRaw ?? "").trim().toLowerCase();

  if (selectedPlan === "business") {
    return {
      plan: SubscriptionPlan.BUSINESS,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(),
      currentPeriodEnd: null as Date | null,
      cancelAtPeriodEnd: false,
    };
  }

  if (selectedPlan === "pro") {
    return {
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(),
      currentPeriodEnd: null as Date | null,
      cancelAtPeriodEnd: false,
    };
  }

  const now = new Date();
  const trialEndsAt = new Date();
  trialEndsAt.setDate(now.getDate() + 7);

  return {
    plan: SubscriptionPlan.PRO,
    status: SubscriptionStatus.TRIALING,
    currentPeriodStart: now,
    currentPeriodEnd: trialEndsAt,
    cancelAtPeriodEnd: false,
  };
}

function resolvePaidSubscriptionFromSelectedPlan(selectedPlanRaw: unknown) {
  const selectedPlan = String(selectedPlanRaw ?? "").trim().toLowerCase();

  if (selectedPlan === "business") {
    return {
      plan: SubscriptionPlan.BUSINESS,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(),
      currentPeriodEnd: null as Date | null,
      cancelAtPeriodEnd: false,
    };
  }

  return {
    plan: SubscriptionPlan.PRO,
    status: SubscriptionStatus.ACTIVE,
    currentPeriodStart: new Date(),
    currentPeriodEnd: null as Date | null,
    cancelAtPeriodEnd: false,
  };
}

function resolveRequestedPlan(selectedPlanRaw: unknown): SubscriptionPlan {
  const selectedPlan = String(selectedPlanRaw ?? "").trim().toLowerCase();

  if (selectedPlan === "business") {
    return SubscriptionPlan.BUSINESS;
  }

  if (selectedPlan === "pro") {
    return SubscriptionPlan.PRO;
  }

  return SubscriptionPlan.PRO;
}

async function getUserByClerkUserId(clerkUserId: string) {
  return prisma.user.findFirst({
    where: {
      authProvider: "CLERK",
      authProviderId: clerkUserId,
    },
  });
}

async function getUserWithOrganizationsByUserId(userId: string) {
  return prisma.user.findUnique({
    where: {
      id: userId,
    },
    include: {
      memberships: {
        include: {
          organization: {
            include: {
              subscription: true,
              _count: {
                select: {
                  members: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      activeOrganization: true,
    },
  });
}

async function getMembership(userId: string, organizationId: string) {
  return prisma.organizationMember.findFirst({
    where: {
      userId,
      organizationId,
    },
  });
}

async function requireAuthenticatedUser(req: AuthenticatedRequest) {
  const clerkUserId = getAuthenticatedClerkUserId(req);

  if (!clerkUserId) {
    return {
      error: {
        status: 401,
        body: {
          ok: false,
          error: "Ikke autentisert",
        },
      },
      user: null,
    };
  }

  await ensureClerkUserExists(clerkUserId);

  const user = await getUserByClerkUserId(clerkUserId);

  if (!user) {
    return {
      error: {
        status: 404,
        body: {
          ok: false,
          error: "Fant ikke bruker",
        },
      },
      user: null,
    };
  }

  return {
    error: null,
    user,
  };
}

async function requireOrganizationMembership(
  req: AuthenticatedRequest,
  organizationId: string
) {
  const authResult = await requireAuthenticatedUser(req);

  if (authResult.error || !authResult.user) {
    return {
      error: authResult.error,
      user: null,
      membership: null,
    };
  }

  const membership = await getMembership(authResult.user.id, organizationId);

  if (!membership) {
    return {
      error: {
        status: 403,
        body: {
          ok: false,
          error: "Brukeren er ikke medlem av dette workspace-et",
        },
      },
      user: authResult.user,
      membership: null,
    };
  }

  return {
    error: null,
    user: authResult.user,
    membership,
  };
}

async function requireOrganizationRole(
  req: AuthenticatedRequest,
  organizationId: string,
  allowedRoles: MemberRole[]
) {
  const access = await requireOrganizationMembership(req, organizationId);

  if (access.error || !access.user || !access.membership) {
    return access;
  }

  if (!hasRole(access.membership.role, allowedRoles)) {
    return {
      error: {
        status: 403,
        body: {
          ok: false,
          error: "Ingen tilgang",
        },
      },
      user: access.user,
      membership: access.membership,
    };
  }

  return access;
}

router.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const authResult = await requireAuthenticatedUser(req);

    if (authResult.error || !authResult.user) {
      return res.status(authResult.error!.status).json(authResult.error!.body);
    }

    const user = await getUserWithOrganizationsByUserId(authResult.user.id);

    if (!user) {
      return res.status(404).json({
        ok: false,
        error: "Fant ikke bruker",
      });
    }

    const organizations = user.memberships.map((membership) => {
      const subscription = membership.organization.subscription;
      const memberLimit = getMemberLimitFromPlan(subscription?.plan);

      return {
        membershipId: membership.id,
        role: membership.role,
        organization: {
          id: membership.organization.id,
          name: membership.organization.name,
          slug: membership.organization.slug,
          createdAt: membership.organization.createdAt,
          updatedAt: membership.organization.updatedAt,
          memberCount: membership.organization._count.members,
          memberLimit,
          subscription: subscription
            ? {
                id: subscription.id,
                plan: subscription.plan,
                status: subscription.status,
                currentPeriodStart: subscription.currentPeriodStart,
                currentPeriodEnd: subscription.currentPeriodEnd,
                cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
              }
            : null,
        },
        isActive: membership.organizationId === user.activeOrganizationId,
      };
    });

    return res.status(200).json({
      ok: true,
      activeOrganizationId: user.activeOrganizationId,
      organizations,
    });
  } catch (error) {
    console.error("Get organizations error:", error);

    return res.status(500).json({
      ok: false,
      error: "Kunne ikke hente workspaces",
    });
  }
});

router.post(
  "/",
  requireAuth,
  sensitiveActionLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const authResult = await requireAuthenticatedUser(req);

      if (authResult.error || !authResult.user) {
        return res.status(authResult.error!.status).json(authResult.error!.body);
      }

      const parsedBody = createOrganizationBodySchema.safeParse(req.body);

      if (!parsedBody.success) {
        return res.status(400).json({
          ok: false,
          error: getFirstZodError(parsedBody.error),
        });
      }

      const user = authResult.user;
      const { name, password, selectedPlan } = parsedBody.data;

      const existingMembershipCount = await prisma.organizationMember.count({
        where: {
          userId: user.id,
        },
      });

      if (existingMembershipCount > 0) {
        const passwordHash = await bcrypt.hash(password, 10);
        const subscriptionInput = resolveSubscriptionFromSelectedPlan(
          selectedPlan
        );
        const slug = buildUniqueSlug(name);

        const result = await prisma.$transaction(async (tx) => {
          const organization = await tx.organization.create({
            data: {
              name,
              slug,
              joinPasswordHash: passwordHash,
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
              plan: subscriptionInput.plan,
              status: subscriptionInput.status,
              currentPeriodStart: subscriptionInput.currentPeriodStart,
              currentPeriodEnd: subscriptionInput.currentPeriodEnd,
              cancelAtPeriodEnd: subscriptionInput.cancelAtPeriodEnd,
            },
          });

          await tx.user.update({
            where: {
              id: user.id,
            },
            data: {
              activeOrganizationId: organization.id,
            },
          });

          await tx.accessRequest.updateMany({
            where: {
              userId: user.id,
              status: AccessRequestStatus.APPROVED,
            },
            data: {
              status: AccessRequestStatus.COMPLETED,
              reviewedAt: new Date(),
            },
          });

          return {
            organization,
            membership,
            subscription,
          };
        });

        await logAdminEvent({
          actorUserId: user.id,
          actorEmail: user.email,
          action: "ORGANIZATION_CREATED",
          targetType: "organization",
          targetId: result.organization.id,
          organizationId: result.organization.id,
          metadata: {
            name: result.organization.name,
            slug: result.organization.slug,
            selectedPlan: result.subscription.plan,
            subscriptionStatus: result.subscription.status,
          },
        });

        return res.status(201).json({
          ok: true,
          message: "Workspace opprettet",
          activeOrganizationId: result.organization.id,
          organization: {
            id: result.organization.id,
            name: result.organization.name,
            slug: result.organization.slug,
            createdAt: result.organization.createdAt,
            updatedAt: result.organization.updatedAt,
            memberCount: 1,
            memberLimit: getMemberLimitFromPlan(result.subscription.plan),
            subscription: {
              id: result.subscription.id,
              plan: result.subscription.plan,
              status: result.subscription.status,
              currentPeriodStart: result.subscription.currentPeriodStart,
              currentPeriodEnd: result.subscription.currentPeriodEnd,
              cancelAtPeriodEnd: result.subscription.cancelAtPeriodEnd,
            },
          },
          membership: result.membership,
        });
      }

      const existingApprovedRequest = await prisma.accessRequest.findFirst({
        where: {
          userId: user.id,
          status: AccessRequestStatus.APPROVED,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (!existingApprovedRequest) {
        const requestedPlan = resolveRequestedPlan(selectedPlan);

        const existingPendingRequest = await prisma.accessRequest.findFirst({
          where: {
            userId: user.id,
            status: AccessRequestStatus.PENDING,
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        if (existingPendingRequest) {
          const updatedRequest = await prisma.accessRequest.update({
            where: {
              id: existingPendingRequest.id,
            },
            data: {
              email: user.email,
              workspaceName: name,
              selectedPlan: requestedPlan,
            },
          });

          await logAdminEvent({
            actorUserId: user.id,
            actorEmail: user.email,
            action: "ACCESS_REQUEST_UPDATED_FROM_ORGANIZATION_FLOW",
            targetType: "access_request",
            targetId: updatedRequest.id,
            metadata: {
              workspaceName: updatedRequest.workspaceName,
              selectedPlan: updatedRequest.selectedPlan,
            },
          });

          return res.status(202).json({
            ok: true,
            status: "PENDING_APPROVAL",
            message: "Forespørselen din er oppdatert og venter på godkjenning.",
            accessRequest: {
              id: updatedRequest.id,
              status: updatedRequest.status,
              workspaceName: updatedRequest.workspaceName,
              selectedPlan: updatedRequest.selectedPlan,
              createdAt: updatedRequest.createdAt,
              updatedAt: updatedRequest.updatedAt,
            },
          });
        }

        const createdRequest = await prisma.accessRequest.create({
          data: {
            userId: user.id,
            email: user.email,
            workspaceName: name,
            selectedPlan: requestedPlan,
            status: AccessRequestStatus.PENDING,
          },
        });

        await logAdminEvent({
          actorUserId: user.id,
          actorEmail: user.email,
          action: "ACCESS_REQUEST_CREATED_FROM_ORGANIZATION_FLOW",
          targetType: "access_request",
          targetId: createdRequest.id,
          metadata: {
            workspaceName: createdRequest.workspaceName,
            selectedPlan: createdRequest.selectedPlan,
          },
        });

        return res.status(202).json({
          ok: true,
          status: "PENDING_APPROVAL",
          message: "Forespørselen din er sendt og venter på godkjenning.",
          accessRequest: {
            id: createdRequest.id,
            status: createdRequest.status,
            workspaceName: createdRequest.workspaceName,
            selectedPlan: createdRequest.selectedPlan,
            createdAt: createdRequest.createdAt,
            updatedAt: createdRequest.updatedAt,
          },
        });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const subscriptionInput = resolveSubscriptionFromSelectedPlan(selectedPlan);
      const slug = buildUniqueSlug(name);

      const result = await prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: {
            name,
            slug,
            joinPasswordHash: passwordHash,
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
            plan: subscriptionInput.plan,
            status: subscriptionInput.status,
            currentPeriodStart: subscriptionInput.currentPeriodStart,
            currentPeriodEnd: subscriptionInput.currentPeriodEnd,
            cancelAtPeriodEnd: subscriptionInput.cancelAtPeriodEnd,
          },
        });

        await tx.user.update({
          where: {
            id: user.id,
          },
          data: {
            activeOrganizationId: organization.id,
          },
        });

        await tx.accessRequest.update({
          where: {
            id: existingApprovedRequest.id,
          },
          data: {
            status: AccessRequestStatus.COMPLETED,
            reviewedAt: new Date(),
            workspaceName: name,
            selectedPlan: resolveRequestedPlan(selectedPlan),
            email: user.email,
          },
        });

        return {
          organization,
          membership,
          subscription,
        };
      });

      await logAdminEvent({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "ORGANIZATION_CREATED_AFTER_APPROVAL",
        targetType: "organization",
        targetId: result.organization.id,
        organizationId: result.organization.id,
        metadata: {
          name: result.organization.name,
          slug: result.organization.slug,
          selectedPlan: result.subscription.plan,
          subscriptionStatus: result.subscription.status,
          approvedAccessRequestId: existingApprovedRequest.id,
        },
      });

      return res.status(201).json({
        ok: true,
        message: "Workspace opprettet",
        activeOrganizationId: result.organization.id,
        organization: {
          id: result.organization.id,
          name: result.organization.name,
          slug: result.organization.slug,
          createdAt: result.organization.createdAt,
          updatedAt: result.organization.updatedAt,
          memberCount: 1,
          memberLimit: getMemberLimitFromPlan(result.subscription.plan),
          subscription: {
            id: result.subscription.id,
            plan: result.subscription.plan,
            status: result.subscription.status,
            currentPeriodStart: result.subscription.currentPeriodStart,
            currentPeriodEnd: result.subscription.currentPeriodEnd,
            cancelAtPeriodEnd: result.subscription.cancelAtPeriodEnd,
          },
        },
        membership: result.membership,
      });
    } catch (error) {
      console.error("Create organization error:", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke opprette workspace",
      });
    }
  }
);

router.post(
  "/set-active",
  requireAuth,
  sensitiveActionLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const authResult = await requireAuthenticatedUser(req);

      if (authResult.error || !authResult.user) {
        return res.status(authResult.error!.status).json(authResult.error!.body);
      }

      const parsedBody = setActiveBodySchema.safeParse(req.body);

      if (!parsedBody.success) {
        return res.status(400).json({
          ok: false,
          error: getFirstZodError(parsedBody.error),
        });
      }

      const user = authResult.user;
      const { organizationId } = parsedBody.data;

      const membership = await getMembership(user.id, organizationId);

      if (!membership) {
        return res.status(403).json({
          ok: false,
          error: "Brukeren er ikke medlem av dette workspace-et",
        });
      }

      await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          activeOrganizationId: organizationId,
        },
      });

      await logAdminEvent({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "ACTIVE_ORGANIZATION_SET",
        targetType: "organization",
        targetId: organizationId,
        organizationId,
        metadata: {
          role: membership.role,
        },
      });

      return res.status(200).json({
        ok: true,
        message: "Aktiv workspace oppdatert",
        activeOrganizationId: organizationId,
      });
    } catch (error) {
      console.error("Set active organization error:", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke oppdatere aktiv workspace",
      });
    }
  }
);

router.post(
  "/upgrade-active",
  requireAuth,
  sensitiveActionLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const authResult = await requireAuthenticatedUser(req);

      if (authResult.error || !authResult.user) {
        return res.status(authResult.error!.status).json(authResult.error!.body);
      }

      const parsedBody = upgradeActiveBodySchema.safeParse(req.body);

      if (!parsedBody.success) {
        return res.status(400).json({
          ok: false,
          error: getFirstZodError(parsedBody.error),
        });
      }

      const user = await prisma.user.findUnique({
        where: {
          id: authResult.user.id,
        },
        include: {
          activeOrganization: {
            include: {
              subscription: true,
              _count: {
                select: {
                  members: true,
                },
              },
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

      if (!user.activeOrganizationId || !user.activeOrganization) {
        return res.status(404).json({
          ok: false,
          error: "Fant ikke aktivt workspace",
        });
      }

      const membership = await getMembership(user.id, user.activeOrganizationId);

      if (!membership || !hasRole(membership.role, [MemberRole.OWNER])) {
        return res.status(403).json({
          ok: false,
          error: "Kun owner kan oppgradere aktivt workspace",
        });
      }

      const currentSubscription = user.activeOrganization.subscription;

      if (!currentSubscription) {
        return res.status(404).json({
          ok: false,
          error: "Fant ikke abonnement på aktivt workspace",
        });
      }

      const subscriptionInput = resolvePaidSubscriptionFromSelectedPlan(
        parsedBody.data.selectedPlan
      );

      const wasTrialing =
        currentSubscription.status === SubscriptionStatus.TRIALING ||
        currentSubscription.status === SubscriptionStatus.CANCELED;

      const hasActiveAccounts = user.activeOrganization.socialAccounts.length > 0;

      const requiresHistoricalResync = wasTrialing && hasActiveAccounts;

      const previousPlan = currentSubscription.plan;
      const previousStatus = currentSubscription.status;

      const updatedSubscription = await prisma.$transaction(async (tx) => {
        const updated = await tx.subscription.update({
          where: {
            organizationId: user.activeOrganizationId!,
          },
          data: {
            plan: subscriptionInput.plan,
            status: subscriptionInput.status,
            currentPeriodStart: subscriptionInput.currentPeriodStart,
            currentPeriodEnd: subscriptionInput.currentPeriodEnd,
            cancelAtPeriodEnd: subscriptionInput.cancelAtPeriodEnd,
          },
        });

        if (requiresHistoricalResync) {
          await tx.socialAccount.updateMany({
            where: {
              organizationId: user.activeOrganizationId!,
              isActive: true,
            },
            data: {
              needsInitialSync: true,
              initialSyncStatus: InitialSyncStatus.PENDING,
            },
          });
        }

        return updated;
      });

      await logAdminEvent({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "ORGANIZATION_UPGRADED",
        targetType: "organization",
        targetId: user.activeOrganizationId,
        organizationId: user.activeOrganizationId,
        metadata: {
          previousPlan,
          previousStatus,
          newPlan: updatedSubscription.plan,
          newStatus: updatedSubscription.status,
          requiresHistoricalResync,
        },
      });

      return res.status(200).json({
        ok: true,
        message: requiresHistoricalResync
          ? "Aktivt workspace oppgradert. Historisk sync er markert for ny kjøring."
          : "Aktivt workspace oppgradert",
        activeOrganizationId: user.activeOrganizationId,
        requiresHistoricalResync,
        organization: {
          id: user.activeOrganization.id,
          name: user.activeOrganization.name,
          slug: user.activeOrganization.slug,
          createdAt: user.activeOrganization.createdAt,
          updatedAt: user.activeOrganization.updatedAt,
          memberCount: user.activeOrganization._count.members,
          memberLimit: getMemberLimitFromPlan(updatedSubscription.plan),
          subscription: {
            id: updatedSubscription.id,
            plan: updatedSubscription.plan,
            status: updatedSubscription.status,
            currentPeriodStart: updatedSubscription.currentPeriodStart,
            currentPeriodEnd: updatedSubscription.currentPeriodEnd,
            cancelAtPeriodEnd: updatedSubscription.cancelAtPeriodEnd,
          },
        },
      });
    } catch (error) {
      console.error("Upgrade active organization error:", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke oppgradere aktivt workspace",
      });
    }
  }
);

router.patch(
  "/:organizationId",
  requireAuth,
  sensitiveActionLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsedParams = organizationIdParamSchema.safeParse(req.params);
      const parsedBody = renameOrganizationBodySchema.safeParse(req.body);

      if (!parsedParams.success) {
        return res.status(400).json({
          ok: false,
          error: getFirstZodError(parsedParams.error),
        });
      }

      if (!parsedBody.success) {
        return res.status(400).json({
          ok: false,
          error: getFirstZodError(parsedBody.error),
        });
      }

      const { organizationId } = parsedParams.data;
      const { name } = parsedBody.data;

      const access = await requireOrganizationRole(
        req,
        organizationId,
        [MemberRole.OWNER]
      );

      if (access.error || !access.user || !access.membership) {
        return res.status(access.error!.status).json(access.error!.body);
      }

      const organization = await prisma.organization.update({
        where: {
          id: organizationId,
        },
        data: {
          name,
          slug: buildUniqueSlug(name),
        },
        include: {
          subscription: true,
          _count: {
            select: {
              members: true,
            },
          },
        },
      });

      await logAdminEvent({
        actorUserId: access.user.id,
        actorEmail: access.user.email,
        action: "ORGANIZATION_RENAMED",
        targetType: "organization",
        targetId: organizationId,
        organizationId,
        metadata: {
          newName: organization.name,
          newSlug: organization.slug,
        },
      });

      return res.status(200).json({
        ok: true,
        message: "Workspace-navn oppdatert",
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          createdAt: organization.createdAt,
          updatedAt: organization.updatedAt,
          memberCount: organization._count.members,
          memberLimit: getMemberLimitFromPlan(organization.subscription?.plan),
          subscription: organization.subscription
            ? {
                id: organization.subscription.id,
                plan: organization.subscription.plan,
                status: organization.subscription.status,
                currentPeriodStart: organization.subscription.currentPeriodStart,
                currentPeriodEnd: organization.subscription.currentPeriodEnd,
                cancelAtPeriodEnd: organization.subscription.cancelAtPeriodEnd,
              }
            : null,
        },
      });
    } catch (error) {
      console.error("Rename workspace error:", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke oppdatere workspace-navn",
      });
    }
  }
);

router.patch(
  "/:organizationId/password",
  requireAuth,
  sensitiveActionLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsedParams = organizationIdParamSchema.safeParse(req.params);
      const parsedBody = updatePasswordBodySchema.safeParse(req.body);

      if (!parsedParams.success) {
        return res.status(400).json({
          ok: false,
          error: getFirstZodError(parsedParams.error),
        });
      }

      if (!parsedBody.success) {
        return res.status(400).json({
          ok: false,
          error: getFirstZodError(parsedBody.error),
        });
      }

      const { organizationId } = parsedParams.data;
      const { password } = parsedBody.data;

      const access = await requireOrganizationRole(
        req,
        organizationId,
        [MemberRole.OWNER]
      );

      if (access.error || !access.user || !access.membership) {
        return res.status(access.error!.status).json(access.error!.body);
      }

      const passwordHash = await bcrypt.hash(password, 10);

      await prisma.organization.update({
        where: {
          id: organizationId,
        },
        data: {
          joinPasswordHash: passwordHash,
        },
      });

      await logAdminEvent({
        actorUserId: access.user.id,
        actorEmail: access.user.email,
        action: "ORGANIZATION_PASSWORD_UPDATED",
        targetType: "organization",
        targetId: organizationId,
        organizationId,
      });

      return res.status(200).json({
        ok: true,
        message: "Workspace-passord oppdatert",
      });
    } catch (error) {
      console.error("Update workspace password error:", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke oppdatere workspace-passord",
      });
    }
  }
);

router.post(
  "/join",
  requireAuth,
  joinWorkspaceLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const authResult = await requireAuthenticatedUser(req);

      if (authResult.error || !authResult.user) {
        return res.status(authResult.error!.status).json(authResult.error!.body);
      }

      const parsedBody = joinOrganizationBodySchema.safeParse(req.body);

      if (!parsedBody.success) {
        return res.status(400).json({
          ok: false,
          error: getFirstZodError(parsedBody.error),
        });
      }

      const user = authResult.user;
      const { organizationId, password } = parsedBody.data;

      const organization = await prisma.organization.findFirst({
        where: {
          id: organizationId,
        },
        include: {
          subscription: true,
          _count: {
            select: {
              members: true,
            },
          },
        },
      });

      if (!organization) {
        return res.status(404).json({
          ok: false,
          error: "Fant ikke workspace",
        });
      }

      if (!organization.joinPasswordHash) {
        return res.status(403).json({
          ok: false,
          error: "Workspace mangler passord",
        });
      }

      const isValidPassword = await bcrypt.compare(
        password,
        organization.joinPasswordHash
      );

      if (!isValidPassword) {
        return res.status(403).json({
          ok: false,
          error: "Feil workspace-ID eller passord",
        });
      }

      const result = await prisma.$transaction(async (tx) => {
        const existingMembership = await tx.organizationMember.findFirst({
          where: {
            userId: user.id,
            organizationId,
          },
        });

        if (existingMembership) {
          return { code: "ALREADY_MEMBER" as const };
        }

        const freshOrganization = await tx.organization.findUnique({
          where: {
            id: organizationId,
          },
          include: {
            subscription: true,
            _count: {
              select: {
                members: true,
              },
            },
          },
        });

        if (!freshOrganization) {
          return { code: "NOT_FOUND" as const };
        }

        const memberLimit = getMemberLimitFromPlan(
          freshOrganization.subscription?.plan
        );
        const memberCount = freshOrganization._count.members;

        if (memberCount >= memberLimit) {
          return {
            code: "MEMBER_LIMIT_REACHED" as const,
            memberLimit,
            memberCount,
            organization: freshOrganization,
          };
        }

        const membership = await tx.organizationMember.create({
          data: {
            userId: user.id,
            organizationId,
            role: MemberRole.MEMBER,
          },
        });

        await tx.user.update({
          where: {
            id: user.id,
          },
          data: {
            activeOrganizationId: organizationId,
          },
        });

        return {
          code: "JOINED" as const,
          membership,
          organization: freshOrganization,
          memberLimit,
          memberCount,
        };
      });

      if (result.code === "ALREADY_MEMBER") {
        return res.status(409).json({
          ok: false,
          error: "Du er allerede medlem av dette workspace-et",
        });
      }

      if (result.code === "NOT_FOUND") {
        return res.status(404).json({
          ok: false,
          error: "Fant ikke workspace",
        });
      }

      if (result.code === "MEMBER_LIMIT_REACHED") {
        return res.status(409).json({
          ok: false,
          error:
            "Dette workspace-et har nådd maks antall medlemmer for abonnementet sitt",
        });
      }

      await logAdminEvent({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "ORGANIZATION_JOINED",
        targetType: "organization",
        targetId: organizationId,
        organizationId,
        metadata: {
          membershipId: result.membership.id,
          role: result.membership.role,
        },
      });

      return res.status(201).json({
        ok: true,
        message: "Du ble med i workspace",
        membership: result.membership,
        organization: {
          id: result.organization.id,
          name: result.organization.name,
          slug: result.organization.slug,
          createdAt: result.organization.createdAt,
          updatedAt: result.organization.updatedAt,
          memberCount: result.memberCount + 1,
          memberLimit: result.memberLimit,
          subscription: result.organization.subscription
            ? {
                id: result.organization.subscription.id,
                plan: result.organization.subscription.plan,
                status: result.organization.subscription.status,
                currentPeriodStart:
                  result.organization.subscription.currentPeriodStart,
                currentPeriodEnd: result.organization.subscription.currentPeriodEnd,
                cancelAtPeriodEnd:
                  result.organization.subscription.cancelAtPeriodEnd,
              }
            : null,
        },
      });
    } catch (error) {
      console.error("Join organization error:", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke bli med i workspace",
      });
    }
  }
);

router.get(
  "/:organizationId/members",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsedParams = organizationIdParamSchema.safeParse(req.params);

      if (!parsedParams.success) {
        return res.status(400).json({
          ok: false,
          error: getFirstZodError(parsedParams.error),
        });
      }

      const { organizationId } = parsedParams.data;

      const access = await requireOrganizationRole(
        req,
        organizationId,
        [MemberRole.OWNER]
      );

      if (access.error || !access.user || !access.membership) {
        return res.status(access.error!.status).json(access.error!.body);
      }

      const organization = await prisma.organization.findUnique({
        where: {
          id: organizationId,
        },
        include: {
          subscription: true,
          _count: {
            select: {
              members: true,
            },
          },
        },
      });

      if (!organization) {
        return res.status(404).json({
          ok: false,
          error: "Fant ikke workspace",
        });
      }

      const members = await prisma.organizationMember.findMany({
        where: {
          organizationId,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      });

      return res.status(200).json({
        ok: true,
        memberCount: organization._count.members,
        memberLimit: getMemberLimitFromPlan(organization.subscription?.plan),
        members: members.map((item) => ({
          membershipId: item.id,
          role: item.role,
          createdAt: item.createdAt,
          user: item.user,
        })),
      });
    } catch (error) {
      console.error("Get organization members error:", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke hente medlemmer",
      });
    }
  }
);

router.patch(
  "/:organizationId/members/:membershipId/role",
  requireAuth,
  sensitiveActionLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsedParams = membershipParamsSchema.safeParse(req.params);
      const parsedBody = updateMemberRoleBodySchema.safeParse(req.body);

      if (!parsedParams.success) {
        return res.status(400).json({
          ok: false,
          error: getFirstZodError(parsedParams.error),
        });
      }

      if (!parsedBody.success) {
        return res.status(400).json({
          ok: false,
          error: getFirstZodError(parsedBody.error),
        });
      }

      const { organizationId, membershipId } = parsedParams.data;
      const { role } = parsedBody.data;

      const access = await requireOrganizationRole(
        req,
        organizationId,
        [MemberRole.OWNER]
      );

      if (access.error || !access.user || !access.membership) {
        return res.status(access.error!.status).json(access.error!.body);
      }

      const targetMembership = await prisma.organizationMember.findFirst({
        where: {
          id: membershipId,
          organizationId,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      if (!targetMembership) {
        return res.status(404).json({
          ok: false,
          error: "Fant ikke medlem",
        });
      }

      if (targetMembership.userId === access.user.id) {
        return res.status(400).json({
          ok: false,
          error: "Du kan ikke endre din egen rolle her",
        });
      }

      if (targetMembership.role === MemberRole.OWNER) {
        return res.status(400).json({
          ok: false,
          error: "Owner-rollen kan ikke endres her",
        });
      }

      const previousRole = targetMembership.role;

      const updatedMembership = await prisma.organizationMember.update({
        where: {
          id: membershipId,
        },
        data: {
          role,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      await logAdminEvent({
        actorUserId: access.user.id,
        actorEmail: access.user.email,
        action: "ORGANIZATION_MEMBER_ROLE_UPDATED",
        targetType: "membership",
        targetId: membershipId,
        organizationId,
        metadata: {
          targetUserId: updatedMembership.user.id,
          targetUserEmail: updatedMembership.user.email,
          previousRole,
          newRole: updatedMembership.role,
        },
      });

      return res.status(200).json({
        ok: true,
        message: "Rolle oppdatert",
        member: {
          membershipId: updatedMembership.id,
          role: updatedMembership.role,
          createdAt: updatedMembership.createdAt,
          user: updatedMembership.user,
        },
      });
    } catch (error) {
      console.error("Update member role error:", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke oppdatere rolle",
      });
    }
  }
);

router.delete(
  "/:organizationId/members/:membershipId",
  requireAuth,
  sensitiveActionLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsedParams = membershipParamsSchema.safeParse(req.params);

      if (!parsedParams.success) {
        return res.status(400).json({
          ok: false,
          error: getFirstZodError(parsedParams.error),
        });
      }

      const { organizationId, membershipId } = parsedParams.data;

      const access = await requireOrganizationRole(
        req,
        organizationId,
        [MemberRole.OWNER]
      );

      if (access.error || !access.user || !access.membership) {
        return res.status(access.error!.status).json(access.error!.body);
      }

      const targetMembership = await prisma.organizationMember.findFirst({
        where: {
          id: membershipId,
          organizationId,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      if (!targetMembership) {
        return res.status(404).json({
          ok: false,
          error: "Fant ikke medlem",
        });
      }

      if (targetMembership.userId === access.user.id) {
        return res.status(400).json({
          ok: false,
          error: "Du kan ikke fjerne deg selv her",
        });
      }

      if (targetMembership.role === MemberRole.OWNER) {
        return res.status(400).json({
          ok: false,
          error: "Owner kan ikke fjernes her",
        });
      }

      await prisma.$transaction(async (tx) => {
        const targetUser = await tx.user.findUnique({
          where: {
            id: targetMembership.userId,
          },
          include: {
            memberships: true,
          },
        });

        if (targetUser?.activeOrganizationId === organizationId) {
          const fallbackMembership = targetUser.memberships.find(
            (item) => item.organizationId !== organizationId
          );

          await tx.user.update({
            where: {
              id: targetMembership.userId,
            },
            data: {
              activeOrganizationId: fallbackMembership?.organizationId ?? null,
            },
          });
        }

        await tx.organizationMember.delete({
          where: {
            id: membershipId,
          },
        });
      });

      await logAdminEvent({
        actorUserId: access.user.id,
        actorEmail: access.user.email,
        action: "ORGANIZATION_MEMBER_REMOVED",
        targetType: "membership",
        targetId: membershipId,
        organizationId,
        metadata: {
          targetUserId: targetMembership.user.id,
          targetUserEmail: targetMembership.user.email,
          targetUserName: targetMembership.user.name,
          removedRole: targetMembership.role,
        },
      });

      return res.status(200).json({
        ok: true,
        message: "Medlem fjernet",
        removedMembershipId: membershipId,
      });
    } catch (error) {
      console.error("Remove organization member error:", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke fjerne medlem",
      });
    }
  }
);

router.delete(
  "/:organizationId",
  requireAuth,
  deleteWorkspaceLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsedParams = organizationIdParamSchema.safeParse(req.params);
      const parsedBody = deleteOrganizationBodySchema.safeParse(req.body);

      if (!parsedParams.success) {
        return res.status(400).json({
          ok: false,
          error: getFirstZodError(parsedParams.error),
        });
      }

      if (!parsedBody.success) {
        return res.status(400).json({
          ok: false,
          error: getFirstZodError(parsedBody.error),
        });
      }

      const { organizationId } = parsedParams.data;

      const access = await requireOrganizationRole(
        req,
        organizationId,
        [MemberRole.OWNER]
      );

      if (access.error || !access.user || !access.membership) {
        return res.status(access.error!.status).json(access.error!.body);
      }

      const organizationBeforeDelete = await prisma.organization.findUnique({
        where: {
          id: organizationId,
        },
        include: {
          subscription: true,
          _count: {
            select: {
              members: true,
              socialAccounts: true,
              contentPosts: true,
            },
          },
        },
      });

      let nextActiveOrganizationId: string | null = null;

      await prisma.$transaction(async (tx) => {
        const usersWithActiveWorkspace = await tx.user.findMany({
          where: {
            activeOrganizationId: organizationId,
          },
          include: {
            memberships: true,
          },
        });

        for (const affectedUser of usersWithActiveWorkspace) {
          const fallbackMembership = affectedUser.memberships.find(
            (item) => item.organizationId !== organizationId
          );

          const fallbackOrganizationId =
            fallbackMembership?.organizationId ?? null;

          if (affectedUser.id === access.user.id) {
            nextActiveOrganizationId = fallbackOrganizationId;
          }

          await tx.user.update({
            where: {
              id: affectedUser.id,
            },
            data: {
              activeOrganizationId: fallbackOrganizationId,
            },
          });
        }

        await tx.organization.delete({
          where: {
            id: organizationId,
          },
        });
      });

      await logAdminEvent({
        actorUserId: access.user.id,
        actorEmail: access.user.email,
        action: "ORGANIZATION_DELETED",
        targetType: "organization",
        targetId: organizationId,
        organizationId,
        metadata: {
          organizationName: organizationBeforeDelete?.name ?? null,
          subscriptionPlan: organizationBeforeDelete?.subscription?.plan ?? null,
          subscriptionStatus:
            organizationBeforeDelete?.subscription?.status ?? null,
          memberCount: organizationBeforeDelete?._count.members ?? 0,
          socialAccountsCount: organizationBeforeDelete?._count.socialAccounts ?? 0,
          contentPostsCount: organizationBeforeDelete?._count.contentPosts ?? 0,
          nextActiveOrganizationId,
        },
      });

      return res.status(200).json({
        ok: true,
        message: "Workspace, tilknyttet data og abonnement er slettet",
        activeOrganizationId: nextActiveOrganizationId,
        deletedOrganizationId: organizationId,
      });
    } catch (error) {
      console.error("Delete organization error:", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke slette workspace",
      });
    }
  }
);

export default router;