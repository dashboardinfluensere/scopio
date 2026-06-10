import { MemberRole } from "@prisma/client";
import { prisma } from "../prisma";
import { resolveActiveOrganizationMembership } from "./activeOrganizationResolver";

type OrganizationAccess = {
  userId: string;
  organizationId: string;
  role: MemberRole;
};

export async function getActiveOrganizationAccess(
  clerkUserId: string
): Promise<OrganizationAccess> {
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
    throw new Error("Bruker ikke funnet");
  }

  const resolved = await resolveActiveOrganizationMembership({
    user,
    memberships: user.memberships,
  });

  if (!resolved.activeMembership || !resolved.activeOrganizationId) {
    throw new Error("Ingen aktiv workspace valgt");
  }

  return {
    userId: user.id,
    organizationId: resolved.activeOrganizationId,
    role: resolved.activeMembership.role,
  };
}