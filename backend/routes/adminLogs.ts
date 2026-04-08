import { Router } from "express";
import { prisma } from "../prisma";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middleware/requireAuth";
import { accessRequestAdminReadLimiter } from "../middleware/rateLimiters";

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

      const limitRaw = Number(String(req.query.limit ?? "100"));
      const limit = Math.min(Math.max(limitRaw, 1), 500);

      const logs = await prisma.adminLog.findMany({
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
      });

      return res.status(200).json({
        ok: true,
        logs,
      });
    } catch (error) {
      console.error("[GET /admin-logs]", error);

      return res.status(500).json({
        ok: false,
        error: "Kunne ikke hente admin-logger.",
      });
    }
  }
);

export default router;