import { prisma } from "../prisma";

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

  let organization = null;

  if (user.activeOrganizationId) {
    organization = await prisma.organization.findUnique({
      where: {
        id: user.activeOrganizationId,
      },
      include: {
        subscription: true,
      },
    });
  }

  if (!organization && user.memberships.length > 0) {
    organization = user.memberships[0].organization;
  }

  if (!organization) {
    return {
      ok: false as const,
      status: 403,
      error: "Brukeren har ingen aktiv workspace.",
    };
  }

  const membership = user.memberships.find(
    (item) => item.organizationId === organization.id
  );

  if (!membership) {
    return {
      ok: false as const,
      status: 403,
      error: "Du har ikke tilgang til denne workspacen.",
    };
  }

  return {
    ok: true as const,
    user,
    organization,
    membership,
  };
}