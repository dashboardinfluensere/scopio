import { MemberRole, SubscriptionStatus } from "@prisma/client";
import { prisma } from "../prisma";

type ResolverSubscription = {
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
} | null;

type ResolverOrganization = {
  id: string;
  deletedAt: Date | null;
  scheduledDeletionAt: Date | null;
  subscription: ResolverSubscription;
};

type ResolverMembership<TOrganization extends ResolverOrganization> = {
  id: string;
  userId: string;
  organizationId: string;
  role: MemberRole;
  organization: TOrganization;
};

type ResolverUser = {
  id: string;
  activeOrganizationId: string | null;
};

export function isOrganizationAvailable(organization: {
  deletedAt: Date | null;
  scheduledDeletionAt: Date | null;
}) {
  const now = new Date();

  if (organization.deletedAt) {
    return false;
  }

  if (
    organization.scheduledDeletionAt &&
    organization.scheduledDeletionAt.getTime() <= now.getTime()
  ) {
    return false;
  }

  return true;
}

export function hasUsableSubscription(subscription: ResolverSubscription) {
  const now = new Date();

  if (!subscription) {
    return false;
  }

  if (subscription.status === SubscriptionStatus.ACTIVE) {
    return true;
  }

  if (subscription.status === SubscriptionStatus.TRIALING) {
    if (!subscription.currentPeriodEnd) {
      return true;
    }

    return subscription.currentPeriodEnd.getTime() >= now.getTime();
  }

  return false;
}

export function hasUsableOrganizationAccess(organization: ResolverOrganization) {
  if (!isOrganizationAvailable(organization)) {
    return false;
  }

  return hasUsableSubscription(organization.subscription);
}

export async function resolveActiveOrganizationMembership<
  TOrganization extends ResolverOrganization,
  TMembership extends ResolverMembership<TOrganization>,
>(params: {
  user: ResolverUser;
  memberships: TMembership[];
}) {
  const { user, memberships } = params;

  const availableMemberships = memberships.filter((membership) =>
    isOrganizationAvailable(membership.organization)
  );

  const currentMembership = user.activeOrganizationId
    ? availableMemberships.find(
        (membership) => membership.organizationId === user.activeOrganizationId
      ) ?? null
    : null;

  if (
    currentMembership &&
    hasUsableOrganizationAccess(currentMembership.organization)
  ) {
    return {
      activeOrganizationId: currentMembership.organizationId,
      activeMembership: currentMembership,
      availableMemberships,
      switched: false,
    };
  }

  const fallbackWithAccess =
    availableMemberships.find((membership) =>
      hasUsableOrganizationAccess(membership.organization)
    ) ?? null;

  if (fallbackWithAccess) {
    if (fallbackWithAccess.organizationId !== user.activeOrganizationId) {
      await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          activeOrganizationId: fallbackWithAccess.organizationId,
        },
      });
    }

    return {
      activeOrganizationId: fallbackWithAccess.organizationId,
      activeMembership: fallbackWithAccess,
      availableMemberships,
      switched: fallbackWithAccess.organizationId !== user.activeOrganizationId,
    };
  }

  if (currentMembership) {
    return {
      activeOrganizationId: currentMembership.organizationId,
      activeMembership: currentMembership,
      availableMemberships,
      switched: false,
    };
  }

  const fallbackAvailable = availableMemberships[0] ?? null;

  if (fallbackAvailable) {
    if (fallbackAvailable.organizationId !== user.activeOrganizationId) {
      await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          activeOrganizationId: fallbackAvailable.organizationId,
        },
      });
    }

    return {
      activeOrganizationId: fallbackAvailable.organizationId,
      activeMembership: fallbackAvailable,
      availableMemberships,
      switched: fallbackAvailable.organizationId !== user.activeOrganizationId,
    };
  }

  if (user.activeOrganizationId) {
    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        activeOrganizationId: null,
      },
    });
  }

  return {
    activeOrganizationId: null,
    activeMembership: null,
    availableMemberships,
    switched: Boolean(user.activeOrganizationId),
  };
}