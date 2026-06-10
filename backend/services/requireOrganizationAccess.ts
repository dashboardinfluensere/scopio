import { prisma } from "../prisma";
import { resolveActiveOrganizationMembership } from "./activeOrganizationResolver";

export async function requireOrganizationAccess(clerkUserId: string) {
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
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!user) {
    return {
      ok: false as const,
      status: 401,
      error: "Fant ikke bruker.",
    };
  }

  const resolved = await resolveActiveOrganizationMembership({
    user,
    memberships: user.memberships,
  });

  if (!resolved.activeMembership) {
    return {
      ok: false as const,
      status: 403,
      error: "Brukeren har ingen aktiv workspace.",
    };
  }

  return {
    ok: true as const,
    user,
    organization: resolved.activeMembership.organization,
    membership: resolved.activeMembership,
  };
}