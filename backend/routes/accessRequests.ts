import { Router } from "express";
import {
  AccessRequestStatus,
  MemberRole,
  SubscriptionPlan,
} from "@prisma/client";
import { prisma } from "../prisma";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middleware/requireAuth";
import {
  accessRequestAdminActionLimiter,
  accessRequestAdminReadLimiter,
  accessRequestCreateLimiter,
} from "../middleware/rateLimiters";
import {
  sendAccessApprovedEmail,
  sendAccessRejectedEmail,
  sendNewAccessRequestNotification,
} from "../services/email";
import { logAdminEvent } from "../services/adminLogs";

const router = Router();

const ADMIN_EMAILS = String(
  process.env.ACCESS_REQUEST_ADMIN_EMAILS ?? ""
)
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

function isAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

async function getActingUser(req: AuthenticatedRequest) {
  const clerkUserId = req.auth?.userId;

  if (!clerkUserId) {
    return null;
  }

  return prisma.user.findFirst({
    where: {
      authProvider: "CLERK",
      authProviderId: clerkUserId,
    },
  });
}

router.get(
  "/",
  requireAuth,
  accessRequestAdminReadLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const actingUser = await getActingUser(req);

      if (!actingUser) {
        return res.status(401).json({
          ok: false,
          error: "Ikke autentisert.",
        });
      }

      if (!isAdminEmail(actingUser.email)) {
        return res.status(403).json({
          ok: false,
          error: "Du har ikke tilgang til denne siden.",
        });
      }

      const accessRequests = await prisma.accessRequest.findMany({
        orderBy: {
          createdAt: "desc",
        },
        include: {
          user: true,
        },
      });

      return res.status(200).json({
        ok: true,
        accessRequests,
      });
    } catch (error) {
      console.error("[GET /access-requests]", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke hente tilgangsforespørsler.",
      });
    }
  }
);

router.post(
  "/",
  requireAuth,
  accessRequestCreateLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const clerkUserId = req.auth?.userId;

      if (!clerkUserId) {
        return res.status(401).json({
          ok: false,
          error: "Ikke autentisert.",
        });
      }

      const note = String(req.body?.note ?? "").trim() || null;

      const user = await prisma.user.findFirst({
        where: {
          authProvider: "CLERK",
          authProviderId: clerkUserId,
        },
      });

      if (!user) {
        return res.status(404).json({
          ok: false,
          error: "Fant ikke bruker i databasen.",
        });
      }

      const existingPending = await prisma.accessRequest.findFirst({
        where: {
          userId: user.id,
          status: AccessRequestStatus.PENDING,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (existingPending) {
        const updated = await prisma.accessRequest.update({
          where: {
            id: existingPending.id,
          },
          data: {
            email: user.email,
            note,
            status: AccessRequestStatus.PENDING,
          },
        });

        await logAdminEvent({
          actorUserId: user.id,
          actorEmail: user.email,
          action: "ACCESS_REQUEST_UPDATED",
          targetType: "access_request",
          targetId: updated.id,
          metadata: {
            note: updated.note,
            selectedPlan: updated.selectedPlan,
            workspaceName: updated.workspaceName,
          },
        });

        return res.status(200).json({
          ok: true,
          action: "updated",
          accessRequest: updated,
        });
      }

      const created = await prisma.accessRequest.create({
        data: {
          userId: user.id,
          email: user.email,
          note,
          workspaceName: "Ikke valgt ennå",
          selectedPlan: SubscriptionPlan.PRO,
          status: AccessRequestStatus.PENDING,
        },
      });

      await logAdminEvent({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "ACCESS_REQUEST_CREATED",
        targetType: "access_request",
        targetId: created.id,
        metadata: {
          note: created.note,
          selectedPlan: created.selectedPlan,
          workspaceName: created.workspaceName,
        },
      });

      if (ADMIN_EMAILS.length === 0) {
        console.warn(
          "[POST /access-requests] ACCESS_REQUEST_ADMIN_EMAILS er tom eller ikke lastet inn."
        );
      }

      for (const adminEmail of ADMIN_EMAILS) {
        void sendNewAccessRequestNotification({
          adminEmail,
          requesterEmail: created.email,
          note: created.note,
        });
      }

      return res.status(201).json({
        ok: true,
        action: "created",
        accessRequest: created,
      });
    } catch (error) {
      console.error("[POST /access-requests]", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke opprette tilgangsforespørselen.",
      });
    }
  }
);

router.post(
  "/:accessRequestId/approve",
  requireAuth,
  accessRequestAdminActionLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const accessRequestId = String(req.params.accessRequestId ?? "").trim();

      if (!accessRequestId) {
        return res.status(400).json({
          ok: false,
          error: "accessRequestId er påkrevd.",
        });
      }

      const actingUser = await getActingUser(req);

      if (!actingUser) {
        return res.status(401).json({
          ok: false,
          error: "Ikke autentisert.",
        });
      }

      if (!isAdminEmail(actingUser.email)) {
        return res.status(403).json({
          ok: false,
          error: "Du har ikke tilgang til å godkjenne forespørsler.",
        });
      }

      const accessRequest = await prisma.accessRequest.findUnique({
        where: {
          id: accessRequestId,
        },
        include: {
          user: true,
        },
      });

      if (!accessRequest) {
        return res.status(404).json({
          ok: false,
          error: "Fant ikke tilgangsforespørselen.",
        });
      }

      if (accessRequest.status === AccessRequestStatus.COMPLETED) {
        return res.status(409).json({
          ok: false,
          error: "Denne forespørselen er allerede fullført.",
        });
      }

      if (accessRequest.status === AccessRequestStatus.APPROVED) {
        return res.status(409).json({
          ok: false,
          error: "Denne forespørselen er allerede godkjent.",
        });
      }

      if (accessRequest.status === AccessRequestStatus.REJECTED) {
        return res.status(409).json({
          ok: false,
          error: "Denne forespørselen er avslått og kan ikke godkjennes.",
        });
      }

      const existingMembership = await prisma.organizationMember.findFirst({
        where: {
          userId: accessRequest.userId,
          role: MemberRole.OWNER,
        },
        include: {
          organization: true,
        },
      });

      if (existingMembership) {
        return res.status(409).json({
          ok: false,
          error: "Brukeren har allerede et workspace som owner.",
        });
      }

      const updatedAccessRequest = await prisma.accessRequest.update({
        where: {
          id: accessRequest.id,
        },
        data: {
          status: AccessRequestStatus.APPROVED,
          reviewedAt: new Date(),
        },
      });

      await logAdminEvent({
        actorUserId: actingUser.id,
        actorEmail: actingUser.email,
        action: "ACCESS_REQUEST_APPROVED",
        targetType: "access_request",
        targetId: updatedAccessRequest.id,
        metadata: {
          requestedByUserId: accessRequest.userId,
          requestedByEmail: accessRequest.email,
        },
      });

      void sendAccessApprovedEmail({
        to: accessRequest.email,
      });

      return res.status(200).json({
        ok: true,
        action: "approved",
        accessRequest: updatedAccessRequest,
      });
    } catch (error) {
      console.error("[POST /access-requests/:accessRequestId/approve]", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke godkjenne tilgangsforespørselen.",
      });
    }
  }
);

router.post(
  "/:accessRequestId/reject",
  requireAuth,
  accessRequestAdminActionLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const accessRequestId = String(req.params.accessRequestId ?? "").trim();

      if (!accessRequestId) {
        return res.status(400).json({
          ok: false,
          error: "accessRequestId er påkrevd.",
        });
      }

      const actingUser = await getActingUser(req);

      if (!actingUser) {
        return res.status(401).json({
          ok: false,
          error: "Ikke autentisert.",
        });
      }

      if (!isAdminEmail(actingUser.email)) {
        return res.status(403).json({
          ok: false,
          error: "Du har ikke tilgang til å avslå forespørsler.",
        });
      }

      const accessRequest = await prisma.accessRequest.findUnique({
        where: {
          id: accessRequestId,
        },
      });

      if (!accessRequest) {
        return res.status(404).json({
          ok: false,
          error: "Fant ikke tilgangsforespørselen.",
        });
      }

      if (accessRequest.status === AccessRequestStatus.COMPLETED) {
        return res.status(409).json({
          ok: false,
          error: "Denne forespørselen er allerede fullført.",
        });
      }

      if (accessRequest.status === AccessRequestStatus.REJECTED) {
        return res.status(409).json({
          ok: false,
          error: "Denne forespørselen er allerede avslått.",
        });
      }

      const updated = await prisma.accessRequest.update({
        where: {
          id: accessRequestId,
        },
        data: {
          status: AccessRequestStatus.REJECTED,
          reviewedAt: new Date(),
        },
      });

      await logAdminEvent({
        actorUserId: actingUser.id,
        actorEmail: actingUser.email,
        action: "ACCESS_REQUEST_REJECTED",
        targetType: "access_request",
        targetId: updated.id,
        metadata: {
          requestedByUserId: accessRequest.userId,
          requestedByEmail: accessRequest.email,
        },
      });

      void sendAccessRejectedEmail({
        to: accessRequest.email,
      });

      return res.status(200).json({
        ok: true,
        action: "rejected",
        accessRequest: updated,
      });
    } catch (error) {
      console.error("[POST /access-requests/:accessRequestId/reject]", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke avslå tilgangsforespørselen.",
      });
    }
  }
);

export default router;