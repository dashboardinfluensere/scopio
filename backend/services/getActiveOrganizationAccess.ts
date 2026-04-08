import { MemberRole } from "@prisma/client";
import { prisma } from "../prisma";

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
      memberships: true,
    },
  });

  if (!user) {
    throw new Error("Bruker ikke funnet");
  }

  if (!user.activeOrganizationId) {
    throw new Error("Ingen aktiv workspace valgt");
  }

  const membership = user.memberships.find(
    (item) => item.organizationId === user.activeOrganizationId
  );

  if (!membership) {
    throw new Error("Du har ikke tilgang til denne workspace-en");
  }

  return {
    userId: user.id,
    organizationId: user.activeOrganizationId,
    role: membership.role,
  };
}