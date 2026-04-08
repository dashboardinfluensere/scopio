import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "../prisma";

export async function getOrganizationAccess(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: {
      id: organizationId,
    },
    include: {
      subscription: true,
    },
  });

  if (!organization) {
    return {
      ok: false,
      reason: "NOT_FOUND" as const,
      organization: null,
      subscription: null,
      hasProAccess: false,
    };
  }

  const subscription = organization.subscription;

  if (!subscription) {
    return {
      ok: true,
      reason: "NO_SUBSCRIPTION" as const,
      organization,
      subscription: null,
      hasProAccess: false,
    };
  }

  const now = new Date();

  const hasActivePaidAccess =
    subscription.status === SubscriptionStatus.ACTIVE;

  const hasTrialAccess =
    subscription.status === SubscriptionStatus.TRIALING &&
    !!subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd.getTime() >= now.getTime();

  return {
    ok: true,
    reason: "OK" as const,
    organization,
    subscription,
    hasProAccess: hasActivePaidAccess || hasTrialAccess,
  };
}