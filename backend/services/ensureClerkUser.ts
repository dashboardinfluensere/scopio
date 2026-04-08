import { prisma } from "../prisma";

type ClerkUserResponse = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email_addresses?: Array<{
    email_address: string;
    id: string;
  }>;
  primary_email_address_id?: string | null;
};

function pickPrimaryEmail(clerkUser: ClerkUserResponse): string | null {
  const primaryId = clerkUser.primary_email_address_id;

  if (primaryId) {
    const primary = clerkUser.email_addresses?.find(
      (item) => item.id === primaryId
    );

    if (primary?.email_address) {
      return primary.email_address;
    }
  }

  return clerkUser.email_addresses?.[0]?.email_address ?? null;
}

function buildFullName(firstName: string | null, lastName: string | null) {
  const fullName = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  return fullName || null;
}

async function getClerkUser(clerkUserId: string): Promise<ClerkUserResponse> {
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY mangler i backend/.env");
  }

  const response = await fetch(
    `https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Clerk user fetch feilet: ${response.status} ${errorText}`);
  }

  return (await response.json()) as ClerkUserResponse;
}

export async function ensureClerkUserExists(clerkUserId: string) {
  let user = await prisma.user.findFirst({
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

  if (user) {
    if (!user.activeOrganizationId && user.memberships.length > 0) {
      const fallbackOrganizationId = user.memberships[0].organizationId;

      user = await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          activeOrganizationId: fallbackOrganizationId,
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
    }

    return user;
  }

  const clerkUser = await getClerkUser(clerkUserId);
  const email = pickPrimaryEmail(clerkUser);

  if (!email) {
    throw new Error("Clerk-brukeren mangler e-postadresse");
  }

  const fullName = buildFullName(clerkUser.first_name, clerkUser.last_name);

  const existingUserByEmail = await prisma.user.findUnique({
    where: {
      email,
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

  if (existingUserByEmail) {
    let updatedUser = await prisma.user.update({
      where: {
        id: existingUserByEmail.id,
      },
      data: {
        authProvider: "CLERK",
        authProviderId: clerkUserId,
        name: fullName ?? existingUserByEmail.name,
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

    if (!updatedUser.activeOrganizationId && updatedUser.memberships.length > 0) {
      const fallbackOrganizationId = updatedUser.memberships[0].organizationId;

      updatedUser = await prisma.user.update({
        where: {
          id: updatedUser.id,
        },
        data: {
          activeOrganizationId: fallbackOrganizationId,
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
    }

    return updatedUser;
  }

  const createdUser = await prisma.user.create({
    data: {
      email,
      name: fullName,
      authProvider: "CLERK",
      authProviderId: clerkUserId,
      activeOrganizationId: null,
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

  return createdUser;
}