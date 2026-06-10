import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import ChangeWorkspacePlanForm from "../../../../components/ChangeWorkspacePlanForm";
import { getServerApiUrl } from "../../../../lib/api";

const API_URL = getServerApiUrl();

type SubscriptionInfo = {
  id: string;
  plan: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
} | null;

type OrganizationItem = {
  membershipId: string;
  role: string;
  organization: {
    id: string;
    name: string;
    slug: string | null;
    createdAt: string;
    updatedAt: string;
    memberCount: number;
    memberLimit: number;
    subscription: SubscriptionInfo;
  };
  isActive: boolean;
};

type OrganizationsResponse = {
  ok: boolean;
  activeOrganizationId: string | null;
  organizations: OrganizationItem[];
};

type SocialAccountsResponse = {
  ok: boolean;
  count: number;
  accounts: Array<{
    id: string;
    isActive: boolean;
  }>;
  limits: {
    monthlyAccountAdds: number;
    activeAccounts: number;
  };
  usage: {
    activeAccounts: number;
    accountsAddedThisPeriod: number;
    monthlyAddsRemaining: number;
    nextAvailableAddAt: string | null;
  };
};

async function getAuthHeaders() {
  const { getToken } = await auth();
  const token = await getToken();

  if (!token) {
    throw new Error("Fant ikke auth-token");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

async function getOrganizations() {
  const headers = await getAuthHeaders();

  const res = await fetch(`${API_URL}/organizations`, {
    cache: "no-store",
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("GET /organizations feilet:", res.status, text);
    throw new Error("Kunne ikke hente workspaces");
  }

  return res.json() as Promise<OrganizationsResponse>;
}

async function getTrackedAccounts() {
  const headers = await getAuthHeaders();

  const res = await fetch(`${API_URL}/social-accounts`, {
    cache: "no-store",
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("GET /social-accounts feilet:", res.status, text);
    throw new Error("Kunne ikke hente kontoer");
  }

  return res.json() as Promise<SocialAccountsResponse>;
}

export default async function ChangePlanPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const [organizationsResponse, trackedAccountsResponse] = await Promise.all([
    getOrganizations(),
    getTrackedAccounts(),
  ]);

  const activeWorkspace = organizationsResponse.organizations.find(
    (item) => item.organization.id === organizationsResponse.activeOrganizationId
  );

  if (!activeWorkspace) {
    redirect("/account/profile");
  }

  return (
    <ChangeWorkspacePlanForm
      activeWorkspace={activeWorkspace}
      activeAccountsCount={trackedAccountsResponse.usage.activeAccounts}
      activeAccountLimit={trackedAccountsResponse.limits.activeAccounts}
    />
  );
}